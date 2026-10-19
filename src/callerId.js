/**
 * callerId.js - Identification de l'appelant via un modem USB branché sur la
 * ligne téléphonique de la box (en parallèle du téléphone du restaurant).
 *
 * Facultatif : sans modem branché, ce module ne fait rien et l'impression
 * fonctionne comme avant. Si le modem est débranché ou plante, on réessaie
 * toutes les 30 s, sans jamais bloquer l'impression.
 *
 * Modem testé : StarTech USB56KEMH2 (Conexant CX93010), vu par Linux en
 * /dev/ttyACM0 sans pilote. Réglages envoyés à chaque ouverture :
 *   - AT+GCI=3D : pays France (sinon le format français du numéro n'est pas lu)
 *   - AT+VCID=1 : afficher le numéro des appels entrants
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

const RETRY_MS = 30000;
const BY_ID_DIR = '/dev/serial/by-id';
const COUNTRY = (process.env.CALLERID_COUNTRY || '3D').replace(/[^0-9A-Fa-f]/g, '') || '3D';

let fd = null;
let reader = null;
let retryTimer = null;
let currentDevice = null;

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

function sendCommand(command) {
  return new Promise((resolve) => {
    if (fd === null) return resolve();
    fs.write(fd, `${command}\r`, (err) => {
      if (err) console.error(`[CallerID] Envoi "${command}" impossible:`, err.message);
      resolve();
    });
  });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function initModem() {
  await sendCommand('ATZ');
  await pause(1500);
  await sendCommand('ATE0');
  await pause(300);
  await sendCommand(`AT+GCI=${COUNTRY}`);
  await pause(300);
  await sendCommand('AT+VCID=1');
}

function closePort() {
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
  console.log(`☎️  Modem détecté (${device}), identification des appels active`);

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
    for (const line of lines) tracker.feed(line);
  });

  const lost = (reason) => {
    console.error(`[CallerID] Modem perdu (${reason}), nouvel essai dans ${RETRY_MS / 1000}s`);
    closePort();
    scheduleRetry(onCall);
  };
  reader.on('error', (err) => lost(err.message));
  reader.on('close', () => lost('fermé'));

  await initModem();
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
