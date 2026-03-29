/**
 * wifi.js - Gestion WiFi avec NetworkManager (nmcli)
 *
 * REFONTE COMPLÈTE - Utilise nmcli au lieu de wpa_supplicant.conf
 * Résout le conflit NetworkManager vs wpa_supplicant
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Nom de la connexion hotspot
const HOTSPOT_NAME = 'BimiPrint-Hotspot';

/**
 * Exécute une commande shell avec gestion d'erreur silencieuse
 */
async function execSafe(command) {
  try {
    const { stdout } = await execAsync(command);
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message, output: err.stdout || '' };
  }
}

/**
 * Génère un SSID unique pour le mode AP basé sur l'adresse MAC
 */
async function getAPSSID() {
  try {
    const { stdout } = await execAsync("cat /sys/class/net/wlan0/address | tail -c 9 | tr -d ':' | tr '[:lower:]' '[:upper:]'");
    return `BimiPrint-${stdout.trim().slice(-4)}`;
  } catch {
    return 'BimiPrint-0000';
  }
}

/**
 * Scanner les réseaux WiFi disponibles
 * @returns {Promise<Array<{ssid: string, signal: number, security: string}>>}
 */
async function scanNetworks() {
  try {
    // Forcer un rescan
    await execSafe('sudo nmcli device wifi rescan');
    await new Promise(r => setTimeout(r, 3000)); // Attendre le scan

    // Lister les réseaux
    const { stdout } = await execAsync('sudo nmcli -t -f SSID,SIGNAL,SECURITY device wifi list');

    const networks = stdout.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [ssid, signal, security] = line.split(':');
        return { ssid, signal: parseInt(signal) || 0, security: security || 'open' };
      })
      .filter(n => n.ssid) // Filtrer les SSID vides
      .filter((n, i, arr) => arr.findIndex(x => x.ssid === n.ssid) === i) // Unique
      .sort((a, b) => b.signal - a.signal); // Trier par signal

    console.log(`✓ ${networks.length} réseaux WiFi trouvés`);
    return networks;
  } catch (err) {
    console.error('Erreur scan WiFi:', err.message);
    return [];
  }
}

/**
 * Lister les connexions WiFi enregistrées dans NetworkManager
 * @returns {Promise<string[]>}
 */
async function listSavedConnections() {
  try {
    const { stdout } = await execAsync('sudo nmcli -t -f NAME,TYPE connection show');
    const connections = stdout.split('\n')
      .filter(line => line.includes(':wifi') || line.includes(':802-11-wireless'))
      .map(line => line.split(':')[0])
      .filter(name => name && name !== HOTSPOT_NAME);

    return connections;
  } catch {
    return [];
  }
}

/**
 * Supprimer une connexion WiFi enregistrée
 * @param {string} name - Nom de la connexion
 */
async function deleteConnection(name) {
  const result = await execSafe(`sudo nmcli connection delete "${name}"`);
  if (result.success) {
    console.log(`✓ Connexion "${name}" supprimée`);
  }
  return result.success;
}

/**
 * Supprimer toutes les connexions WiFi (sauf hotspot)
 */
async function deleteAllWifiConnections() {
  const connections = await listSavedConnections();
  for (const conn of connections) {
    await deleteConnection(conn);
  }
  console.log(`✓ ${connections.length} connexion(s) WiFi supprimée(s)`);
}

/**
 * Connecter à un réseau WiFi
 * @param {string} ssid - Nom du réseau
 * @param {string} password - Mot de passe (vide pour réseau ouvert)
 * @returns {Promise<boolean>}
 */
async function connectToWifi(ssid, password) {
  console.log(`Connexion à "${ssid}"...`);

  try {
    // Arrêter le hotspot si actif
    await stopAPMode();

    // Supprimer TOUTES les anciennes connexions WiFi
    // Évite que le Pi se reconnecte à un ancien réseau (ex: hotspot iPhone du setup)
    await deleteAllWifiConnections();

    // Créer la nouvelle connexion
    let addCmd;
    if (password && password.trim()) {
      // WiFi avec mot de passe WPA/WPA2
      addCmd = `sudo nmcli connection add type wifi ifname wlan0 con-name "${ssid}" ssid "${ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${password}"`;
    } else {
      // WiFi ouvert (sans mot de passe)
      addCmd = `sudo nmcli connection add type wifi ifname wlan0 con-name "${ssid}" ssid "${ssid}"`;
    }

    const addResult = await execSafe(addCmd);
    if (!addResult.success) {
      console.error('Erreur création connexion:', addResult.error);
      return false;
    }

    // Activer la connexion
    const upResult = await execSafe(`sudo nmcli connection up "${ssid}"`);
    if (!upResult.success) {
      console.error('Erreur activation connexion:', upResult.error);
      // Supprimer la connexion ratée
      await execSafe(`sudo nmcli connection delete "${ssid}"`);
      return false;
    }

    console.log(`✓ Connecté à "${ssid}"`);
    return true;
  } catch (err) {
    console.error(`✗ Échec connexion à "${ssid}":`, err.message);
    return false;
  }
}

/**
 * Obtenir le SSID actuellement connecté
 * @returns {Promise<string|null>}
 */
async function getCurrentSSID() {
  try {
    const { stdout } = await execAsync('iwgetid -r');
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Vérifier si connecté à internet
 * @returns {Promise<boolean>}
 */
async function hasInternet() {
  // Essayer plusieurs serveurs
  const servers = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];

  for (const server of servers) {
    const result = await execSafe(`ping -c 1 -W 3 ${server}`);
    if (result.success) return true;
  }

  return false;
}

/**
 * Attendre la connexion internet
 * @param {number} maxSeconds - Temps max d'attente
 * @returns {Promise<boolean>}
 */
async function waitForInternet(maxSeconds = 60) {
  const interval = 5;
  const checks = Math.floor(maxSeconds / interval);

  console.log(`Attente connexion internet (max ${maxSeconds}s)...`);

  for (let i = 0; i < checks; i++) {
    if (await hasInternet()) {
      console.log(`✓ Internet connecté après ${i * interval}s`);
      return true;
    }

    if (i > 0 && i % 6 === 0) {
      console.log(`  Attente... ${i * interval}s`);
    }

    await new Promise(r => setTimeout(r, interval * 1000));
  }

  console.error(`✗ Pas d'internet après ${maxSeconds}s`);
  return false;
}

/**
 * Démarrer le mode AP (hotspot)
 * @returns {Promise<string>} - SSID du hotspot
 */
async function startAPMode() {
  const ssid = await getAPSSID();

  console.log(`Démarrage mode AP: ${ssid}...`);

  try {
    // Supprimer l'ancien hotspot si existe
    await execSafe(`sudo nmcli connection delete "${HOTSPOT_NAME}"`);

    // Créer le hotspot avec NetworkManager
    // Note: mode ap + ipv4.method shared crée automatiquement un DHCP
    const createCmd = `sudo nmcli connection add type wifi ifname wlan0 con-name "${HOTSPOT_NAME}" autoconnect no ssid "${ssid}" mode ap wifi.band bg wifi.channel 7 ipv4.method shared ipv4.addresses 192.168.4.1/24`;

    const createResult = await execSafe(createCmd);
    if (!createResult.success) {
      throw new Error(`Erreur création hotspot: ${createResult.error}`);
    }

    // Activer le hotspot
    const upResult = await execSafe(`sudo nmcli connection up "${HOTSPOT_NAME}"`);
    if (!upResult.success) {
      throw new Error(`Erreur activation hotspot: ${upResult.error}`);
    }

    console.log(`✓ Mode AP activé: ${ssid}`);
    console.log(`  Adresse: http://192.168.4.1`);

    return ssid;
  } catch (err) {
    console.error('✗ Échec mode AP:', err.message);
    throw err;
  }
}

/**
 * Arrêter le mode AP
 */
async function stopAPMode() {
  const result = await execSafe(`sudo nmcli connection down "${HOTSPOT_NAME}"`);
  if (result.success) {
    console.log('✓ Mode AP désactivé');
  }
  return result.success;
}

/**
 * Vérifier si le mode AP est actif
 * @returns {Promise<boolean>}
 */
async function isAPModeActive() {
  const ssid = await getCurrentSSID();
  const apSSID = await getAPSSID();
  return ssid === apSSID;
}

/**
 * Obtenir le statut WiFi complet
 * @returns {Promise<object>}
 */
async function getWifiStatus() {
  const currentSSID = await getCurrentSSID();
  const internet = await hasInternet();
  const savedConnections = await listSavedConnections();
  const apActive = await isAPModeActive();

  return {
    connected: !!currentSSID,
    ssid: currentSSID,
    internet,
    apMode: apActive,
    savedConnections
  };
}

/**
 * Diagnostic complet du WiFi
 * @returns {Promise<object>}
 */
async function runDiagnostic() {
  console.log('=== Diagnostic WiFi ===');

  const diagnostic = {
    timestamp: new Date().toISOString(),
    wlan0: { exists: false, up: false },
    networkManager: { running: false },
    wifi: { connected: false, ssid: null },
    internet: { ok: false, latency: null },
    savedConnections: []
  };

  // Vérifier wlan0
  const wlan0Check = await execSafe('ip link show wlan0');
  diagnostic.wlan0.exists = wlan0Check.success;
  diagnostic.wlan0.up = wlan0Check.output.includes('state UP');

  // Vérifier NetworkManager
  const nmCheck = await execSafe('systemctl is-active NetworkManager');
  diagnostic.networkManager.running = nmCheck.output === 'active';

  // Vérifier connexion WiFi
  diagnostic.wifi.ssid = await getCurrentSSID();
  diagnostic.wifi.connected = !!diagnostic.wifi.ssid;

  // Vérifier internet
  const pingStart = Date.now();
  diagnostic.internet.ok = await hasInternet();
  diagnostic.internet.latency = diagnostic.internet.ok ? Date.now() - pingStart : null;

  // Connexions enregistrées
  diagnostic.savedConnections = await listSavedConnections();

  console.log('Diagnostic:', JSON.stringify(diagnostic, null, 2));

  return diagnostic;
}

module.exports = {
  // Configuration
  getAPSSID,

  // Scan
  scanNetworks,

  // Connexions
  connectToWifi,
  listSavedConnections,
  deleteConnection,
  deleteAllWifiConnections,

  // Statut
  getCurrentSSID,
  hasInternet,
  waitForInternet,
  getWifiStatus,

  // Mode AP
  startAPMode,
  stopAPMode,
  isAPModeActive,

  // Diagnostic
  runDiagnostic
};
