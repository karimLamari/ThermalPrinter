/**
 * portal.js - Portail web de configuration BimiPrint
 *
 * REFONTE v2 - Utilise NetworkManager via wifi.js
 */

const express = require('express');
const path = require('path');
const { loadConfig, saveConfig } = require('./config');
const {
  scanNetworks,
  connectToWifi,
  listSavedConnections,
  deleteConnection,
  getWifiStatus,
  runDiagnostic,
  hasInternet
} = require('./wifi');
const { listBluetoothDevices, testNetworkPrinter, listUSBPrinters, testUSBPrinter } = require('./printer');

const app = express();
const PORT = 80;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../web')));

// ════════════════════════════════════════
// Pages
// ════════════════════════════════════════

// Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/index.html'));
});

// Captive portal - redirige vers config
app.get('/generate_204', (req, res) => res.redirect('/'));
app.get('/hotspot-detect.html', (req, res) => res.redirect('/'));
app.get('/connecttest.txt', (req, res) => res.redirect('/'));

// ════════════════════════════════════════
// API: Configuration
// ════════════════════════════════════════

// GET /api/config - Configuration actuelle
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json({
    wifiSSID: config.wifiSSID || '',
    restaurantCode: config.restaurantCode || '',
    printerType: config.printerType || '',
    printerAddress: config.printerAddress || '',
    configured: config.configured || false
  });
});

// POST /api/config - Enregistrer la configuration
app.post('/api/config', async (req, res) => {
  const { wifiSSID, wifiPassword, restaurantCode, printerType, printerAddress } = req.body;

  // Validation
  if (!wifiSSID || !restaurantCode) {
    return res.status(400).json({ error: 'WiFi et code restaurant requis' });
  }

  console.log(`Configuration: WiFi="${wifiSSID}", Restaurant="${restaurantCode}"`);

  try {
    // Sauvegarder la configuration AVANT de changer le WiFi
    const config = {
      wifiSSID,
      wifiPassword: wifiPassword || '',
      restaurantCode,
      printerType: printerType || '',
      printerAddress: printerAddress || '',
      configured: true
    };

    if (!saveConfig(config)) {
      return res.status(500).json({ error: 'Erreur sauvegarde configuration' });
    }

    console.log('✓ Configuration sauvegardée');

    // Envoyer la réponse AVANT de couper le hotspot
    // (sinon le client perd la connexion et reçoit une erreur)
    res.json({
      success: true,
      message: `Connexion au WiFi "${wifiSSID}" en cours... Le boîtier redémarre automatiquement.`
    });

    // Attendre que la réponse soit envoyée, puis connecter le WiFi
    setTimeout(async () => {
      console.log(`Connexion au WiFi "${wifiSSID}"...`);
      const connected = await connectToWifi(wifiSSID, wifiPassword);

      if (connected) {
        const internet = await hasInternet();
        console.log(`✓ WiFi connecté (internet: ${internet ? 'oui' : 'non'})`);
      } else {
        console.error('✗ Échec connexion WiFi, retour en mode AP au prochain redémarrage');
        // Marquer comme non configuré pour repasser en mode AP
        config.configured = false;
        saveConfig(config);
      }

      // Redémarrer le service pour appliquer la config
      console.log('Redémarrage du service...');
      const { exec } = require('child_process');
      exec('sudo systemctl restart bimiprint');
    }, 1000);

  } catch (err) {
    console.error('Erreur configuration:', err.message);
    res.status(500).json({
      error: 'Erreur lors de la configuration',
      details: err.message
    });
  }
});

// ════════════════════════════════════════
// API: WiFi
// ════════════════════════════════════════

// GET /api/networks - Scanner les réseaux WiFi
app.get('/api/networks', async (req, res) => {
  try {
    const networks = await scanNetworks();
    res.json(networks);
  } catch (err) {
    res.status(500).json({ error: 'Erreur scan WiFi' });
  }
});

// GET /api/wifi/status - Statut WiFi actuel
app.get('/api/wifi/status', async (req, res) => {
  try {
    const status = await getWifiStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Erreur statut WiFi' });
  }
});

// GET /api/wifi/connections - Connexions enregistrées
app.get('/api/wifi/connections', async (req, res) => {
  try {
    const connections = await listSavedConnections();
    res.json(connections);
  } catch (err) {
    res.status(500).json({ error: 'Erreur liste connexions' });
  }
});

// DELETE /api/wifi/connections/:name - Supprimer une connexion
app.delete('/api/wifi/connections/:name', async (req, res) => {
  try {
    const deleted = await deleteConnection(req.params.name);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression connexion' });
  }
});

// POST /api/wifi/test - Tester une connexion WiFi
app.post('/api/wifi/test', async (req, res) => {
  const { ssid, password } = req.body;

  if (!ssid) {
    return res.status(400).json({ error: 'SSID requis' });
  }

  try {
    const connected = await connectToWifi(ssid, password);
    const internet = connected ? await hasInternet() : false;

    res.json({
      connected,
      internet,
      message: connected
        ? (internet ? 'Connexion réussie avec internet' : 'Connecté mais pas d\'internet')
        : 'Échec de connexion'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur test WiFi', details: err.message });
  }
});

// ════════════════════════════════════════
// API: Diagnostic
// ════════════════════════════════════════

// GET /api/diagnostic - Diagnostic complet
app.get('/api/diagnostic', async (req, res) => {
  try {
    const diagnostic = await runDiagnostic();
    res.json(diagnostic);
  } catch (err) {
    res.status(500).json({ error: 'Erreur diagnostic' });
  }
});

// GET /api/diagnostic/wifi - Test WiFi uniquement
app.get('/api/diagnostic/wifi', async (req, res) => {
  const status = await getWifiStatus();
  res.json({ connected: status.connected, ssid: status.ssid });
});

// GET /api/diagnostic/internet - Test internet uniquement
app.get('/api/diagnostic/internet', async (req, res) => {
  const ok = await hasInternet();
  res.json({ ok });
});

// ════════════════════════════════════════
// API: Imprimante
// ════════════════════════════════════════

// GET /api/bluetooth - Liste des appareils Bluetooth
app.get('/api/bluetooth', async (req, res) => {
  try {
    const devices = await listBluetoothDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: 'Erreur scan Bluetooth' });
  }
});

// POST /api/test-printer - Test imprimante réseau
app.post('/api/test-printer', async (req, res) => {
  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ error: 'Adresse IP requise' });
  }

  try {
    const ok = await testNetworkPrinter(ip);
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ error: 'Erreur test imprimante' });
  }
});

// GET /api/usb-printers - Liste des imprimantes USB
app.get('/api/usb-printers', async (req, res) => {
  try {
    const devices = await listUSBPrinters();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: 'Erreur détection USB' });
  }
});

// POST /api/test-usb-printer - Test imprimante USB
app.post('/api/test-usb-printer', async (req, res) => {
  const { devicePath } = req.body;
  if (!devicePath) {
    return res.status(400).json({ error: 'Chemin device requis' });
  }

  try {
    const ok = await testUSBPrinter(devicePath);
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ error: 'Erreur test USB' });
  }
});

// POST /api/update-printer - Modifier l'imprimante
app.post('/api/update-printer', (req, res) => {
  const { printerType, printerAddress } = req.body;
  const config = loadConfig();

  if (!config.configured) {
    return res.status(400).json({ error: 'Système non configuré' });
  }

  config.printerType = printerType || config.printerType;
  config.printerAddress = printerAddress || config.printerAddress;

  if (saveConfig(config)) {
    res.json({ success: true, message: 'Imprimante mise à jour. Redémarrage...' });
    setTimeout(() => {
      require('child_process').exec('sudo systemctl restart bimiprint');
    }, 2000);
  } else {
    res.status(500).json({ error: 'Erreur sauvegarde configuration' });
  }
});

// ════════════════════════════════════════
// API: Logs et Administration
// ════════════════════════════════════════

// GET /api/logs - Logs du service
app.get('/api/logs', async (req, res) => {
  const { exec } = require('child_process');
  exec('journalctl -u bimiprint -n 100 --no-pager', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Erreur lecture logs' });
    }
    res.json({ logs: stdout });
  });
});

// POST /api/reset - Réinitialiser en mode AP
app.post('/api/reset', (req, res) => {
  const config = loadConfig();
  config.configured = false;

  if (saveConfig(config)) {
    res.json({
      success: true,
      message: 'Réinitialisé. Redémarrage en mode configuration...'
    });

    setTimeout(() => {
      const { exec } = require('child_process');
      exec('sudo systemctl restart bimiprint');
    }, 2000);
  } else {
    res.status(500).json({ error: 'Erreur réinitialisation' });
  }
});

// POST /api/reboot - Redémarrer le système
app.post('/api/reboot', (req, res) => {
  res.json({ success: true, message: 'Redémarrage du système...' });

  setTimeout(() => {
    require('child_process').exec('sudo reboot');
  }, 2000);
});

// ════════════════════════════════════════
// Démarrage serveur
// ════════════════════════════════════════

function start() {
  return new Promise((resolve, reject) => {
    app.listen(PORT, () => {
      console.log(`Portail web démarré sur le port ${PORT}`);
      resolve();
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} déjà utilisé, portail probablement déjà actif`);
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

module.exports = { start, app };
