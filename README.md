# ThermalPrinter

> Raspberry Pi print server for restaurants via WebSocket

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry_Pi-Zero_2W+-C51A4A?logo=raspberry-pi&logoColor=white)](https://www.raspberrypi.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- WebSocket connection to your backend
- ESC/POS thermal printer support (TCP port 9100)
- WiFi AP mode for easy configuration
- Web portal setup interface
- Auto-reconnect & fallback modes

## Architecture

```
Frontend (PWA) ──► Backend (VPS) ──► Raspberry Pi ──► Thermal Printer
                    Socket.IO         WebSocket        TCP/9100
```

## Quick Start

```bash
# On Raspberry Pi
git clone https://github.com/karimLamari/ThermalPrinter.git
cd ThermalPrinter
npm install

# Configure
cp .env.example .env
nano .env  # Set VPS_URL, RESTAURANT_CODE, PRINTER_ADDRESS

# Install service
sudo cp bimiprint.service /etc/systemd/system/
sudo systemctl enable --now bimiprint
```

## Configuration

```env
VPS_URL=wss://your-backend.com/print
RESTAURANT_CODE=MYRESTAURANT
PRINTER_TYPE=network
PRINTER_ADDRESS=192.168.1.100
```

## Hardware

- Raspberry Pi Zero 2 W (or 3/4)
- 8GB+ microSD
- ESC/POS thermal printer (network)

## License

MIT
