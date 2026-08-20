const WebSocket = require('ws');
const { VPS_URL, loadConfig } = require('./config');
const { print } = require('./printer');

let ws = null;
let reconnectTimeout = null;
let reconnectDelay = 1000; // Démarre à 1 sec, max 60 sec

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

    // Envoie un message d'identification
    ws.send(JSON.stringify({
      type: 'identify',
      code: config.restaurantCode
    }));
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
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('Erreur WebSocket:', err.message);
  });
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
