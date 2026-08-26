const WebSocket = require('ws');
const { VPS_URL, loadConfig } = require('./config');
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

  // Ajoute le code restaurant à l'URL
  const url = `${VPS_URL}?code=${config.restaurantCode}`;

  console.log(`Connexion WebSocket: ${VPS_URL}`);

  ws = new WebSocket(url);

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
        await print(message.data);
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
