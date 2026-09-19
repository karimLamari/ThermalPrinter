const { exec } = require('child_process');
const fs = require('fs');
const net = require('net');
const { loadConfig } = require('./config');

// Port standard pour imprimantes réseau ESC/POS
const NETWORK_PRINTER_PORT = 9100;

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// Délai max d'une écriture vers l'imprimante. Une imprimante hors ligne / sans papier peut
// bloquer l'écriture indéfiniment : on coupe pour pouvoir le signaler au serveur (print:ack).
const DEVICE_WRITE_TIMEOUT = 10000;

/**
 * Écrit des octets ESC/POS sur un périphérique caractère (/dev/usb/lp0, /dev/rfcomm0).
 * Rejette si le périphérique est absent (imprimante éteinte/débranchée) ou si l'écriture
 * ne se termine pas dans le délai.
 */
function writeToDevice(buffer, device, label) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(device);
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        console.error(`Erreur impression ${label}:`, err.message);
        stream.destroy();
        reject(err);
      } else {
        stream.end();
        console.log(`Impression ${label} OK`);
        resolve(true);
      }
    };

    const timer = setTimeout(
      () => finish(new Error(`Imprimante ${label} bloquée (pas de réponse en ${DEVICE_WRITE_TIMEOUT / 1000}s)`)),
      DEVICE_WRITE_TIMEOUT
    );

    stream.on('error', finish);
    stream.write(buffer, (err) => finish(err || null));
  });
}

// Envoie des données ESC/POS via Bluetooth (port série /dev/rfcomm0 déjà appairé).
// Écriture directe : les données ne transitent JAMAIS par un shell (l'ancien
// `exec('echo "<data>" | base64 -d ...')` permettait une injection de commande).
async function printBluetooth(data) {
  return writeToDevice(Buffer.from(data, 'base64'), '/dev/rfcomm0', 'Bluetooth');
}

// Envoie des données ESC/POS via réseau (WiFi/Ethernet)
async function printNetwork(data, ipAddress) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(data, 'base64');

    const socket = new net.Socket();
    socket.setTimeout(10000);

    socket.connect(NETWORK_PRINTER_PORT, ipAddress, () => {
      socket.write(buffer, () => {
        socket.end();
        console.log('Impression réseau OK');
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      console.error('Erreur impression réseau:', err.message);
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout impression réseau'));
    });
  });
}

// Envoie des données ESC/POS via USB (/dev/usb/lp*)
async function printUSB(data, devicePath) {
  return writeToDevice(Buffer.from(data, 'base64'), devicePath || '/dev/usb/lp0', 'USB');
}

// Liste les imprimantes USB détectées (/dev/usb/lp*)
async function listUSBPrinters() {
  const devices = [];

  for (let i = 0; i < 4; i++) {
    const devicePath = `/dev/usb/lp${i}`;
    if (fs.existsSync(devicePath)) {
      let name = `Imprimante USB ${i}`;
      try {
        const info = await execAsync(`udevadm info --query=property --name=${devicePath} 2>/dev/null | grep ID_MODEL= | cut -d= -f2`);
        if (info.trim()) name = info.trim();
      } catch (e) { /* pas grave, on garde le nom générique */ }
      devices.push({ path: devicePath, name });
    }
  }

  return devices;
}

// Test d'accès à une imprimante USB
async function testUSBPrinter(devicePath) {
  const device = devicePath || '/dev/usb/lp0';
  try {
    fs.accessSync(device, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

// Fonction principale d'impression
async function print(base64Data) {
  const config = loadConfig();

  if (!config.printerType) {
    throw new Error('Imprimante non configurée');
  }

  // USB n'a pas forcément besoin d'une adresse (défaut: /dev/usb/lp0)
  if (config.printerType !== 'usb' && !config.printerAddress) {
    throw new Error('Adresse imprimante non configurée');
  }

  try {
    if (config.printerType === 'bluetooth') {
      await printBluetooth(base64Data, config.printerAddress);
    } else if (config.printerType === 'wifi') {
      await printNetwork(base64Data, config.printerAddress);
    } else if (config.printerType === 'usb') {
      await printUSB(base64Data, config.printerAddress || '/dev/usb/lp0');
    } else {
      throw new Error(`Type d'imprimante inconnu: ${config.printerType}`);
    }
    return true;
  } catch (err) {
    console.error('Erreur impression:', err.message);
    throw err;
  }
}

// Liste les appareils Bluetooth appairés
async function listBluetoothDevices() {
  try {
    const result = await execAsync('bluetoothctl paired-devices');
    const devices = result
      .split('\n')
      .filter(line => line.startsWith('Device'))
      .map(line => {
        const parts = line.split(' ');
        return {
          mac: parts[1],
          name: parts.slice(2).join(' ')
        };
      });
    return devices;
  } catch (err) {
    console.error('Erreur liste Bluetooth:', err.message);
    return [];
  }
}

// Test de connexion à une imprimante réseau
async function testNetworkPrinter(ipAddress) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(NETWORK_PRINTER_PORT, ipAddress, () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

module.exports = {
  print,
  printBluetooth,
  printNetwork,
  printUSB,
  listBluetoothDevices,
  listUSBPrinters,
  testNetworkPrinter,
  testUSBPrinter
};
