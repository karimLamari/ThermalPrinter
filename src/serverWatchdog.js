/**
 * serverWatchdog.js - Filet de sécurité : le Pi doit rester relié au serveur.
 *
 * Cas réel (Rajpoot, 2026-10-20) : le Pi avait internet mais n'était plus
 * relié au serveur pendant 1 h 30 - ni tickets ni appels - jusqu'à ce qu'on
 * le débranche à la main. Désormais :
 *   - pas relié au serveur depuis 10 min ALORS qu'internet marche
 *       → redémarrage du service (systemd le relance en 10 s) ;
 *   - toujours rien après 3 redémarrages de suite
 *       → redémarrage complet du Pi, au plus une fois par heure.
 * Sans internet, on ne fait rien ici : c'est la box ou le WiFi, pas le Pi
 * (le mode secours s'en occupe).
 *
 * L'état (redémarrages ratés, dernier reboot) survit aux redémarrages dans
 * /var/lib/bimiprint/watchdog.json.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const STATE_PATH = process.env.WATCHDOG_STATE_PATH || '/var/lib/bimiprint/watchdog.json';
const CHECK_INTERVAL_MS = 60 * 1000;
const STALE_MS = 10 * 60 * 1000;
const MAX_SERVICE_RESTARTS = 3;
const MIN_REBOOT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Décision pure (testée dans test/serverWatchdog.test.js).
 * @param {Object} p
 * @param {boolean} p.connected - WebSocket ouvert et vivant
 * @param {boolean} p.internet - le Pi joint internet
 * @param {number} p.lastHealthyAt - dernière fois relié au serveur (ms)
 * @param {number} p.now
 * @param {{failedRestarts: number, lastRebootAt: number|null}} p.state
 * @returns {'ok'|'wait'|'restart'|'reboot'}
 */
function decide({ connected, internet, lastHealthyAt, now, state }) {
  if (connected) return 'ok';
  if (now - lastHealthyAt < STALE_MS) return 'wait';
  if (!internet) return 'wait';

  const rebootAllowed = !state.lastRebootAt || now - state.lastRebootAt >= MIN_REBOOT_INTERVAL_MS;
  if (state.failedRestarts + 1 >= MAX_SERVICE_RESTARTS && rebootAllowed) return 'reboot';
  return 'restart';
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { failedRestarts: Number(data.failedRestarts) || 0, lastRebootAt: data.lastRebootAt || null };
  } catch {
    return { failedRestarts: 0, lastRebootAt: null };
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch (err) {
    console.error('[Watchdog] État non enregistré:', err.message);
  }
}

/**
 * @param {Object} deps
 * @param {() => boolean} deps.isConnected
 * @param {() => Promise<boolean>} deps.hasInternet
 */
function start({ isConnected, hasInternet }) {
  let lastHealthyAt = Date.now(); // délai de grâce au démarrage
  let busy = false;

  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      const connected = isConnected();
      const state = readState();

      if (connected) {
        lastHealthyAt = now;
        if (state.failedRestarts > 0) writeState({ ...state, failedRestarts: 0 });
        return;
      }

      const internet = now - lastHealthyAt >= STALE_MS ? await hasInternet() : true;
      const action = decide({ connected, internet, lastHealthyAt, now, state });

      if (action === 'reboot') {
        console.error('[Watchdog] Toujours pas relié au serveur après plusieurs redémarrages : redémarrage du Pi');
        writeState({ failedRestarts: 0, lastRebootAt: now });
        execFile('systemctl', ['reboot'], (err) => {
          if (err) {
            console.error('[Watchdog] Reboot impossible:', err.message);
            process.exit(1);
          }
        });
      } else if (action === 'restart') {
        console.error(`[Watchdog] Pas relié au serveur depuis ${Math.round((now - lastHealthyAt) / 60000)} min avec internet OK : redémarrage du service`);
        writeState({ ...state, failedRestarts: state.failedRestarts + 1 });
        process.exit(1); // systemd relance (Restart=always)
      }
    } finally {
      busy = false;
    }
  }, CHECK_INTERVAL_MS);
}

module.exports = {
  start,
  decide,
  STALE_MS,
  MAX_SERVICE_RESTARTS,
  MIN_REBOOT_INTERVAL_MS,
};
