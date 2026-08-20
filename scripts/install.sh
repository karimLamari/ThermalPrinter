#!/bin/bash

# BimiPrint - Script d'installation pour Raspberry Pi
# Usage: sudo ./install.sh

set -e

echo "================================="
echo "  BimiPrint - Installation"
echo "================================="

# Vérifie qu'on est root
if [ "$EUID" -ne 0 ]; then
  echo "Erreur: Exécutez avec sudo"
  exit 1
fi

# Mise à jour du système
echo "[1/7] Mise à jour du système..."
apt-get update -qq

# Installation des dépendances
echo "[2/7] Installation des dépendances..."
apt-get install -y -qq \
  hostapd \
  dnsmasq \
  nodejs \
  npm \
  bluetooth \
  bluez \
  bluez-tools

# Arrête les services pour la configuration
systemctl stop hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

# Copie du projet
echo "[3/7] Installation de BimiPrint..."
mkdir -p /opt/bimiprint
cp -r ../src /opt/bimiprint/
cp -r ../web /opt/bimiprint/
cp ../package.json /opt/bimiprint/

# Installation des modules Node.js
echo "[4/7] Installation des modules Node.js..."
cd /opt/bimiprint
npm install --production --silent

# Configuration hostapd
echo "[5/7] Configuration hostapd..."
cat > /etc/default/hostapd << EOF
DAEMON_CONF="/etc/hostapd/hostapd.conf"
EOF

# Désactive hostapd et dnsmasq au démarrage (géré par bimiprint)
systemctl disable hostapd
systemctl disable dnsmasq
systemctl unmask hostapd

# Active le watchdog hardware
echo "[6/7] Configuration watchdog..."
if ! grep -q "dtparam=watchdog=on" /boot/config.txt; then
  echo "dtparam=watchdog=on" >> /boot/config.txt
fi

# Installation du service systemd
echo "[7/7] Installation du service..."
cp /opt/bimiprint/scripts/bimiprint.service /etc/systemd/system/ 2>/dev/null || \
cp scripts/bimiprint.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable bimiprint
systemctl start bimiprint

echo ""
echo "================================="
echo "  Installation terminée!"
echo "================================="
echo ""
echo "Le Pi va redémarrer en mode configuration."
echo "Connectez-vous au WiFi 'BimiPrint-XXXX'"
echo "puis ouvrez http://192.168.4.1"
echo ""

# Redémarre après 5 secondes
sleep 5
reboot
