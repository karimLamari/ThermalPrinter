const { exec } = require('child_process');
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

// Envoie des données ESC/POS via Bluetooth
async function printBluetooth(data, macAddress) {
  return new Promise((resolve, reject) => {
    // Utilise rfcomm pour envoyer via Bluetooth SPP
    const command = `echo -n "${data}" | base64 -d | sudo rfcomm connect hci0 ${macAddress} 1`;

    // Alternative: utiliser bluetoothctl et /dev/rfcomm0
    const altCommand = `echo "${data}" | base64 -d > /dev/rfcomm0`;

    exec(altCommand, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Erreur impression Bluetooth:', error.message);
        reject(error);
      } else {
        console.log('Impression Bluetooth OK');
        resolve(true);
      }
    });
  });
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

// Fonction principale d'impression
async function print(base64Data) {
  const config = loadConfig();

  if (!config.printerType || !config.printerAddress) {
    throw new Error('Imprimante non configurée');
  }

  try {
    if (config.printerType === 'bluetooth') {
      await printBluetooth(base64Data, config.printerAddress);
    } else if (config.printerType === 'wifi') {
      await printNetwork(base64Data, config.printerAddress);
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
  listBluetoothDevices,
  testNetworkPrinter
};
