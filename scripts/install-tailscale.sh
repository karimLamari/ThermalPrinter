#!/bin/bash

# Script d'installation Tailscale pour BimiPrint
# Usage: sudo bash install-tailscale.sh

set -e

echo "=========================================="
echo "  Installation Tailscale pour BimiPrint"
echo "=========================================="
echo ""

# Vérifie si déjà installé
if command -v tailscale &> /dev/null; then
    echo "✓ Tailscale est déjà installé"
    tailscale version
    echo ""
    echo "Pour se connecter: sudo tailscale up"
    echo "Pour voir le statut: tailscale status"
    exit 0
fi

echo "Installation de Tailscale..."

# Ajoute le repo Tailscale
curl -fsSL https://pkgs.tailscale.com/stable/raspbian/bullseye.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/raspbian/bullseye.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list

# Installe Tailscale
echo "Mise à jour des paquets..."
sudo apt-get update

echo "Installation de Tailscale..."
sudo apt-get install -y tailscale

echo ""
echo "✓ Tailscale installé avec succès!"
echo ""
echo "=========================================="
echo "  Configuration"
echo "=========================================="
echo ""
echo "Pour connecter ce Pi à votre réseau Tailscale:"
echo "  sudo tailscale up"
echo ""
echo "Un lien d'authentification s'affichera."
echo "Ouvrez-le dans votre navigateur pour autoriser l'appareil."
echo ""
echo "Pour voir l'adresse IP Tailscale du Pi:"
echo "  tailscale ip -4"
echo ""
echo "Pour voir le statut:"
echo "  tailscale status"
echo ""
echo "Ensuite, vous pourrez accéder au Pi depuis n'importe où via SSH:"
echo "  ssh pi@<ip-tailscale>"
echo ""
