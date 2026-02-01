const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/bimiprint/config.json';
const CONFIG_DIR = path.dirname(CONFIG_PATH);

// Variables depuis .env
const VPS_URL = process.env.VPS_URL || 'wss://your-backend.com/print';
const RESTAURANT_CODE = process.env.RESTAURANT_CODE || 'RESTAURANT';
const PRINTER_TYPE = process.env.PRINTER_TYPE || 'network';
const PRINTER_ADDRESS = process.env.PRINTER_ADDRESS || '';

const defaultConfig = {
  wifiSSID: process.env.WIFI_SSID || '',
  wifiPassword: process.env.WIFI_PASSWORD || '',
  restaurantCode: RESTAURANT_CODE,
  printerType: PRINTER_TYPE,
  printerAddress: PRINTER_ADDRESS,
  configured: false
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Erreur lecture config:', err.message);
  }
  return { ...defaultConfig };
}

function saveConfig(config) {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('Erreur sauvegarde config:', err.message);
    return false;
  }
}

function isConfigured() {
  const config = loadConfig();
  return config.configured && config.wifiSSID && config.restaurantCode;
}

module.exports = {
  VPS_URL,
  RESTAURANT_CODE,
  PRINTER_TYPE,
  PRINTER_ADDRESS,
  CONFIG_PATH,
  CONFIG_DIR,
  loadConfig,
  saveConfig,
  isConfigured
};
