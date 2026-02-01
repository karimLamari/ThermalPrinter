# ThermalPrinter

> Print to thermal printers from any web app — no native app required

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry_Pi-Zero_2W+-C51A4A?logo=raspberry-pi&logoColor=white)](https://www.raspberrypi.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## The Problem

Printing to thermal printers from web apps (PWA, React, etc.) is a nightmare:
- Browsers can't talk directly to ESC/POS printers
- WebUSB/WebSerial have limited support and permissions issues
- Native apps require separate development and deployment
- Cloud print services are expensive and add latency

## The Solution

A $20 Raspberry Pi acts as a bridge between your web backend and the printer. Your server sends print jobs via WebSocket, the Pi receives them and forwards to the thermal printer over TCP.

**No native app. No browser plugins. Just works.**

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
