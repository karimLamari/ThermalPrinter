const WebSocket = require('ws');
const { VPS_URL, BIMIPRINT_TOKEN, loadConfig } = require('./config');
const { print } = require('./printer');

let ws = null;
let reconnectTimeout = null;
let reconnectDelay = 1000; // Démarre à 1 sec, max 60 sec

// Watchdog anti-connexion "zombie" : le serveur ping toutes les 30s et
// termine son côté si le Pi ne répond pas (bimiprint.server.js), mais si le
// NAT du routeur du resto a coupé le mapping entretemps, ce close ne nous
// parvient jamais- le socket reste "OPEN" ici sans plus jamais rien recevoir,
// et scheduleReconnect() n'est donc jamais déclenché. On vérifie nous-mêmes
// qu'un pong arrive régulièrement, sinon on force la reconnexion.
const WATCHDOG_INTERVAL = 15000;
const STALE_THRESHOLD = 45000; // > 30s de ping serveur, avec marge
let watchdogInterval = null;
let lastPongAt = null;

function connect() {
  const config = loadConfig();

  if (!config.restaurantCode) {
    console.error('Code restaurant non configuré');
    return;
  }

  // Ajoute le code restaurant à l'URL. ack=1 : on confirme chaque impression au serveur
  // (print:ack) → il ne marque un ticket "imprimé" que s'il est vraiment parti.
  const url = `${VPS_URL}?code=${encodeURIComponent(config.restaurantCode)}&ack=1`;

  console.log(`Connexion WebSocket: ${VPS_URL}`);

  // Secret partagé en header (pas dans l'URL : les URLs finissent dans les logs du serveur)
  const headers = BIMIPRINT_TOKEN ? { 'x-bimiprint-token': BIMIPRINT_TOKEN } : {};

  ws = new WebSocket(url, { headers });

  ws.on('open', () => {
    console.log('✓ WebSocket connecté');
    reconnectDelay = 1000; // Reset le délai
    lastPongAt = Date.now();
    startWatchdog();

    // Envoie un message d'identification
    ws.send(JSON.stringify({
      type: 'identify',
      code: config.restaurantCode
    }));
  });

  ws.on('pong', () => {
    lastPongAt = Date.now();
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'print' && message.data) {
        console.log('📄 Job d\'impression reçu');
        await handlePrintJob(message);
      } else if (message.type === 'connected') {
        console.log('✓ Enregistré sur le serveur');
      }
    } catch (err) {
      console.error('Erreur traitement message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('✗ WebSocket déconnecté');
    stopWatchdog();
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('Erreur WebSocket:', err.message);
    // 'close' suit normalement 'error', mais scheduleReconnect() est
    // idempotent (guard sur reconnectTimeout)- double filet de sécurité si
    // jamais 'close' ne se déclenchait pas dans ce cas précis.
    scheduleReconnect();
  });
}

/**
 * Imprime un job et renvoie l'accusé de réception au serveur.
 * jobId absent = ancien serveur : on imprime sans accusé, comme avant.
 */
async function handlePrintJob(message) {
  let ack = { ok: true };
  try {
    await print(message.data);
  } catch (err) {
    // (print() a déjà journalisé l'erreur)
    ack = { ok: false, error: err.message };
  }

  if (!message.jobId) return;

  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'print:ack', jobId: message.jobId, ...ack }));
    }
  } catch (err) {
    console.error('Envoi accusé de réception impossible:', err.message);
  }
}

function startWatchdog() {
  stopWatchdog();
  watchdogInterval = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (Date.now() - lastPongAt > STALE_THRESHOLD) {
      console.log('✗ Connexion zombie détectée (pas de pong reçu), reconnexion forcée');
      ws.terminate(); // déclenche 'close' localement → scheduleReconnect()
      return;
    }

    ws.ping();
  }, WATCHDOG_INTERVAL);
}

function stopWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;

  console.log(`⟳ Reconnexion dans ${reconnectDelay / 1000}s...`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, reconnectDelay);

  // Augmente le délai (max 60 sec)
  reconnectDelay = Math.min(reconnectDelay * 2, 60000);
}

function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  stopWatchdog();

  if (ws) {
    ws.close();
    ws = null;
  }
}

function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

module.exports = {
  connect,
  disconnect,
  isConnected
};
