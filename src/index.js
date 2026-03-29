/**
 * index.js - Point d'entrée BimiPrint
 *
 * REFONTE v2 - Logique de connexion fiable avec mode secours
 *
 * Flux:
 * 1. Si non configuré → Mode AP (configuration)
 * 2. Si configuré → Tenter connexion WiFi
 *    - Si OK → Mode normal (WebSocket + impression)
 *    - Si échec → Mode AP secours + retry en arrière-plan
 */

const { isConfigured, loadConfig } = require('./config');
const {
  startAPMode,
  waitForInternet,
  hasInternet,
  getWifiStatus,
  connectToWifi
} = require('./wifi');
const { connect: connectWebSocket } = require('./websocket');
const { start: startPortal } = require('./portal');

// Configuration
const WIFI_TIMEOUT = 60; // Secondes avant de passer en mode secours
const RETRY_INTERVAL = 60000; // Réessayer WiFi toutes les 60 secondes en mode secours

console.log('');
console.log('╔═══════════════════════════════════════╗');
console.log('║     BimiPrint v2 - Impression WiFi    ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

/**
 * Mode secours: Active le mode AP et réessaie le WiFi en arrière-plan
 */
async function startFallbackMode(config) {
  console.log('');
  console.log('┌─────────────────────────────────────┐');
  console.log('│  MODE SECOURS - Pas de connexion    │');
  console.log('└─────────────────────────────────────┘');

  try {
    // Activer le mode AP
    const ssid = await startAPMode();
    console.log(`WiFi de secours: ${ssid}`);
    console.log('Accès configuration: http://192.168.4.1');

    // Démarrer le portail web
    await startPortal();

    // Réessayer la connexion WiFi en arrière-plan
    console.log(`Retry automatique toutes les ${RETRY_INTERVAL / 1000}s...`);

    const retryInterval = setInterval(async () => {
      console.log('Tentative reconnexion WiFi...');

      // Essayer de se connecter au WiFi configuré
      if (config.wifiSSID) {
        const connected = await connectToWifi(config.wifiSSID, config.wifiPassword);

        if (connected && await hasInternet()) {
          console.log('');
          console.log('✓ WiFi rétabli ! Redémarrage du service...');
          clearInterval(retryInterval);

          // Redémarrer proprement pour passer en mode normal
          setTimeout(() => {
            process.exit(0); // systemd va redémarrer le service
          }, 2000);
        }
      }
    }, RETRY_INTERVAL);

  } catch (err) {
    console.error('Erreur mode secours:', err.message);
  }
}

/**
 * Mode normal: Connecté au WiFi, WebSocket actif
 */
async function startNormalMode(config) {
  console.log('');
  console.log('┌─────────────────────────────────────┐');
  console.log('│  MODE NORMAL - Connecté             │');
  console.log('└─────────────────────────────────────┘');
  console.log(`Restaurant: ${config.restaurantCode}`);
  console.log(`Imprimante: ${config.printerType || 'Non configurée'} ${config.printerAddress || ''}`);

  // Démarrer le portail web (accessible via IP locale ou Tailscale)
  startPortal().then(() => {
    console.log('Interface web accessible');
  }).catch(err => {
    console.error('Erreur portail:', err.message);
  });

  // Connecter au VPS via WebSocket
  connectWebSocket();

  console.log('');
  console.log('✓ Prêt à recevoir les impressions');

  // Surveiller la connexion internet
  startConnectionMonitor(config);
}

/**
 * Surveille la connexion et passe en mode secours si déconnecté
 */
function startConnectionMonitor(config) {
  let consecutiveFailures = 0;
  const MAX_FAILURES = 3;

  const monitor = setInterval(async () => {
    const internet = await hasInternet();

    if (!internet) {
      consecutiveFailures++;
      console.log(`⚠️ Pas d'internet (${consecutiveFailures}/${MAX_FAILURES})`);

      if (consecutiveFailures >= MAX_FAILURES) {
        console.log('Connexion perdue. Redémarrage pour passer en mode secours...');
        clearInterval(monitor);
        // Redémarrer le service → systemd relance → repasse par main()
        // Si le WiFi n'est plus dispo, il passera en mode secours (hotspot)
        process.exit(1);
      }
    } else {
      if (consecutiveFailures > 0) {
        console.log('✓ Connexion rétablie');
      }
      consecutiveFailures = 0;
    }
  }, 30000); // Vérifier toutes les 30 secondes
}

/**
 * Point d'entrée principal
 */
async function main() {
  const configured = isConfigured();
  const config = loadConfig();

  // Afficher le statut actuel
  const status = await getWifiStatus();
  console.log('Statut WiFi:', status.connected ? `Connecté à "${status.ssid}"` : 'Non connecté');
  console.log('Internet:', status.internet ? 'OK' : 'Non disponible');
  console.log('Connexions enregistrées:', status.savedConnections.join(', ') || 'Aucune');
  console.log('');

  if (!configured) {
    // ════════════════════════════════════════
    // MODE CONFIGURATION (première utilisation)
    // ════════════════════════════════════════
    console.log('Mode: CONFIGURATION INITIALE');

    try {
      const ssid = await startAPMode();
      console.log('');
      console.log('┌─────────────────────────────────────┐');
      console.log('│  Configuration requise              │');
      console.log('└─────────────────────────────────────┘');
      console.log(`1. Connectez-vous au WiFi: ${ssid}`);
      console.log('2. Ouvrez http://192.168.4.1');
      console.log('3. Configurez le WiFi et le restaurant');
      console.log('');

      await startPortal();
    } catch (err) {
      console.error('Erreur démarrage:', err.message);
      process.exit(1);
    }

  } else {
    // ════════════════════════════════════════
    // MODE OPÉRATION (déjà configuré)
    // ════════════════════════════════════════
    console.log('Mode: OPÉRATION');
    console.log(`WiFi configuré: ${config.wifiSSID}`);

    // Vérifier si on a déjà internet
    if (await hasInternet()) {
      console.log('✓ Internet déjà disponible');
      await startNormalMode(config);
      return;
    }

    // Sinon, attendre la connexion WiFi
    console.log('Connexion au WiFi...');
    const connected = await waitForInternet(WIFI_TIMEOUT);

    if (connected) {
      await startNormalMode(config);
    } else {
      // ════════════════════════════════════════
      // MODE SECOURS (WiFi échoué)
      // ════════════════════════════════════════
      console.log('');
      console.log('⚠️ Impossible de se connecter au WiFi configuré');
      console.log('');
      console.log('Causes possibles:');
      console.log('  • Le routeur WiFi est éteint');
      console.log('  • Le mot de passe WiFi a changé');
      console.log('  • Le réseau est hors de portée');
      console.log('');

      await startFallbackMode(config);
    }
  }
}

// Gestion des signaux
process.on('SIGTERM', () => {
  console.log('Arrêt demandé (SIGTERM)...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Interruption (SIGINT)...');
  process.exit(0);
});

// Gestion des erreurs non catchées
process.on('uncaughtException', (err) => {
  console.error('Erreur non gérée:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('Promise rejetée:', reason);
});

// Démarrage
main().catch((err) => {
  console.error('Erreur fatale:', err.message);
  console.error(err.stack);
  process.exit(1);
});
