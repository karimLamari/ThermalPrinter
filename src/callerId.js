/**
 * callerId.js - Identification de l'appelant via un modem USB branché sur la
 * ligne téléphonique de la box (en parallèle du téléphone du restaurant).
 *
 * Facultatif : sans modem branché, ce module ne fait rien et l'impression
 * fonctionne comme avant. Si le modem est débranché ou plante, on réessaie
 * toutes les 30 s, sans jamais bloquer l'impression.
 *
 * Modem testé : StarTech USB56KEMH2 (Conexant CX93010), vu par Linux en
 * /dev/ttyACM0 sans pilote. Réglages envoyés à chaque ouverture, CHACUN
 * VÉRIFIÉ (réponse OK attendue) :
 *   - AT+GCI=3D : pays France (sinon le format français du numéro n'est pas lu)
 *   - AT+VCID=1 : afficher le numéro des appels entrants
 *
 * Surveillance (cas réel Rajpoot, 2026-10-22 : après une coupure de courant le
 * modem restait figé, puis captait les sonneries SANS le numéro) :
 *   - pas d'ATZ au démarrage (remise à zéro trop proche des réglages = réglages
 *     perdus) ; on attend que le modem réponde avant de le régler ;
 *   - toutes les 10 min, hors appel : le modem doit répondre « OK », sinon
 *     réinitialisation USB automatique (au plus une toutes les 5 min) ;
 *   - toutes les 30 min, hors appel : les réglages sont renvoyés.
 *
 * Variables .env facultatives :
 *   CALLERID_DEVICE   chemin du modem (défaut : détection automatique)
 *   CALLERID_COUNTRY  code pays T.35 en hexa (défaut : 3D = France)
 *   CALLERID_DISABLED=true pour couper la fonction
 */

const fs = require('fs');
const tty = require('tty');
const path = require('path');
const { execFile } = require('child_process');
const { createCallTracker } = require('./callerIdParser');
const { parseModemResponse, usbDeviceFromSysPath } = require('./modemUtils');

const RETRY_MS = 30000;
const BY_ID_DIR = '/dev/serial/by-id';
const COUNTRY = (process.env.CALLERID_COUNTRY || '3D').replace(/[^0-9A-Fa-f]/g, '') || '3D';

const COMMAND_TIMEOUT_MS = 3000;
const WAKE_DELAY_MS = 2000;
const HEALTH_CHECK_MS = 10 * 60 * 1000;
const REAPPLY_SETTINGS_MS = 30 * 60 * 1000;
const CALL_QUIET_MS = 60 * 1000; // pas de commande pendant / juste après un appel
const MIN_USB_RESET_INTERVAL_MS = 5 * 60 * 1000;

let fd = null;
let reader = null;
let retryTimer = null;
let healthTimer = null;
let currentDevice = null;
let pendingCommand = null; // { resolve, timer }
let lastCallActivityAt = 0;
let lastSettingsAt = 0;
let lastUsbResetAt = 0;
let failedHealthChecks = 0;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cherche le modem : chemin imposé, sinon /dev/serial/by-id (nom stable),
 * sinon /dev/ttyACM0. L'imprimante USB est en /dev/usb/lp*, jamais confondue.
 * @returns {string|null}
 */
function findModem() {
  if (process.env.CALLERID_DEVICE) {
    return fs.existsSync(process.env.CALLERID_DEVICE) ? process.env.CALLERID_DEVICE : null;
  }

  try {
    const entries = fs.readdirSync(BY_ID_DIR);
    const modem = entries.find((name) => /modem|conexant|cx930|startech/i.test(name))
      || entries.find((name) => /ACM/i.test(name));
    if (modem) return path.join(BY_ID_DIR, modem);
  } catch {
    // dossier absent = aucun périphérique série branché
  }

  return fs.existsSync('/dev/ttyACM0') ? '/dev/ttyACM0' : null;
}

function configurePort(device) {
  // execFile : pas de shell, le chemin n'est jamais interprété
  return new Promise((resolve, reject) => {
    execFile('stty', ['-F', device, '115200', 'raw', '-echo', 'clocal'], { timeout: 5000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Envoie une commande AT et attend la réponse du modem.
 * Une écriture qui ne se termine pas (modem figé) compte comme sans réponse.
 * @param {string} command
 * @returns {Promise<'OK'|'ERROR'|'TIMEOUT'>}
 */
function sendCommand(command) {
  return new Promise((resolve) => {
    if (fd === null) return resolve('TIMEOUT');
    if (pendingCommand) {
      clearTimeout(pendingCommand.timer);
      pendingCommand.resolve('TIMEOUT');
    }

    const timer = setTimeout(() => {
      if (pendingCommand && pendingCommand.timer === timer) pendingCommand = null;
      resolve('TIMEOUT');
    }, COMMAND_TIMEOUT_MS);
    pendingCommand = { resolve, timer };

    fs.write(fd, `${command}\r`, (err) => {
      if (err) console.error(`[CallerID] Envoi "${command}" impossible:`, err.message);
    });
  });
}

/** Commande avec plusieurs essais ; journalise le résultat. */
async function sendWithRetry(command, attempts) {
  let result = 'TIMEOUT';
  for (let i = 0; i < attempts; i += 1) {
    result = await sendCommand(command);
    if (result === 'OK') break;
    await pause(1000);
  }
  return result;
}

/**
 * Réveil + réglages. Renvoie false si le modem ne répond pas (figé).
 */
async function applySettings({ wake }) {
  if (wake) {
    const alive = await sendWithRetry('AT', 5);
    if (alive !== 'OK') {
      console.error('[CallerID] Le modem ne répond pas');
      return false;
    }
    await sendWithRetry('ATE0', 2);
  }

  const country = await sendWithRetry(`AT+GCI=${COUNTRY}`, 3);
  const callerId = await sendWithRetry('AT+VCID=1', 3);
  lastSettingsAt = Date.now();

  if (country === 'OK' && callerId === 'OK') {
    console.log('[CallerID] Réglages acceptés (pays France, affichage du numéro)');
  } else {
    console.error(`[CallerID] Réglages refusés : pays=${country}, numéro=${callerId}`);
  }
  return true;
}

/**
 * Réinitialise le modem côté USB (comme le débrancher / rebrancher). La
 * lecture se ferme, et la boucle de reconnexion le rouvre et le règle.
 */
async function resetUsb(reason) {
  const now = Date.now();
  if (now - lastUsbResetAt < MIN_USB_RESET_INTERVAL_MS) {
    console.error(`[CallerID] ${reason} - réinitialisation USB déjà faite il y a moins de 5 min, on attend`);
    return;
  }

  let usbId = null;
  try {
    const realDevice = fs.realpathSync(currentDevice);
    usbId = usbDeviceFromSysPath(fs.realpathSync(`/sys/class/tty/${path.basename(realDevice)}/device`));
  } catch (err) {
    console.error('[CallerID] Port USB du modem introuvable:', err.message);
  }
  if (!usbId) return;

  lastUsbResetAt = now;
  console.error(`[CallerID] ${reason} : réinitialisation USB du modem (${usbId})`);
  try {
    await fs.promises.writeFile('/sys/bus/usb/drivers/usb/unbind', usbId);
    await pause(3000);
    await fs.promises.writeFile('/sys/bus/usb/drivers/usb/bind', usbId);
  } catch (err) {
    console.error('[CallerID] Réinitialisation USB impossible:', err.message);
  }
}

function stopHealthChecks() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function startHealthChecks() {
  stopHealthChecks();
  healthTimer = setInterval(async () => {
    if (fd === null) return;
    if (Date.now() - lastCallActivityAt < CALL_QUIET_MS) return; // appel en cours

    const alive = await sendCommand('AT');
    if (alive !== 'OK') {
      failedHealthChecks += 1;
      console.error(`[CallerID] Le modem ne répond plus (${failedHealthChecks}/2)`);
      if (failedHealthChecks >= 2) {
        failedHealthChecks = 0;
        await resetUsb('Modem figé');
      }
      return;
    }
    failedHealthChecks = 0;

    if (Date.now() - lastSettingsAt >= REAPPLY_SETTINGS_MS) {
      await applySettings({ wake: false });
    }
  }, HEALTH_CHECK_MS);
}

function closePort() {
  stopHealthChecks();
  if (pendingCommand) {
    clearTimeout(pendingCommand.timer);
    pendingCommand.resolve('TIMEOUT');
    pendingCommand = null;
  }
  // Un tty.ReadStream ferme lui-même le descripteur en se détruisant : le
  // refermer ensuite pourrait fermer un AUTRE fichier qui aurait reçu le même
  // numéro entre-temps (celui de l'imprimante, par exemple).
  const streamOwnsFd = reader instanceof tty.ReadStream;
  if (reader) {
    reader.removeAllListeners();
    reader.on('error', () => {}); // une erreur tardive ne doit pas faire planter le service
    reader.destroy();
    reader = null;
  }
  if (fd !== null && !streamOwnsFd) {
    try { fs.closeSync(fd); } catch { /* déjà fermé */ }
  }
  fd = null;
  currentDevice = null;
}

function scheduleRetry(onCall) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    openModem(onCall);
  }, RETRY_MS);
}

async function openModem(onCall) {
  const device = findModem();
  if (!device) {
    scheduleRetry(onCall);
    return;
  }

  try {
    await configurePort(device);
    fd = fs.openSync(device, fs.constants.O_RDWR | fs.constants.O_NOCTTY);
  } catch (err) {
    console.error(`[CallerID] Ouverture du modem ${device} impossible:`, err.message);
    closePort();
    scheduleRetry(onCall);
    return;
  }

  currentDevice = device;
  console.log(`☎️  Modem détecté (${device})`);

  const tracker = createCallTracker({ onCall });
  // tty.ReadStream : lecture non bloquante (un fs.ReadStream occuperait un
  // thread du pool en permanence, partagé avec l'écriture des tickets).
  reader = tty.isatty(fd) ? new tty.ReadStream(fd) : fs.createReadStream(null, { fd, autoClose: false });

  let buffer = '';
  reader.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    const lines = buffer.split(/\r\n|\r|\n/);
    buffer = lines.pop();
    if (buffer.length > 1024) buffer = ''; // garde-fou : jamais de ligne aussi longue
    for (const line of lines) {
      const response = parseModemResponse(line);
      if (response && pendingCommand) {
        const { resolve, timer } = pendingCommand;
        pendingCommand = null;
        clearTimeout(timer);
        resolve(response);
        continue;
      }
      if (/^\s*(RING|DATE|TIME|NMBR|NAME)/i.test(line)) lastCallActivityAt = Date.now();
      tracker.feed(line);
    }
  });

  const lost = (reason) => {
    console.error(`[CallerID] Modem perdu (${reason}), nouvel essai dans ${RETRY_MS / 1000}s`);
    closePort();
    scheduleRetry(onCall);
  };
  reader.on('error', (err) => lost(err.message));
  reader.on('close', () => lost('fermé'));

  // Laisser le modem se réveiller (juste après le branchement / démarrage)
  await pause(WAKE_DELAY_MS);
  if (fd === null) return;

  const ready = await applySettings({ wake: true });
  if (!ready) {
    await resetUsb('Modem figé au démarrage');
    return;
  }
  console.log('☎️  Identification des appels active');
  startHealthChecks();
}

/**
 * Démarre la surveillance du modem.
 * @param {(call: {number: string|null, presentation: string, name: string|null, at: string}) => void} onCall
 */
function start(onCall) {
  if (process.env.CALLERID_DISABLED === 'true') {
    console.log('[CallerID] Désactivé (CALLERID_DISABLED=true)');
    return;
  }
  openModem(onCall);
}

function isActive() {
  return currentDevice !== null;
}

module.exports = { start, isActive, findModem };
