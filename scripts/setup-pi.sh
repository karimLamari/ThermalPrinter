#!/bin/bash

# =============================================
# BimiPrint - Setup complet d'un nouveau Pi
# =============================================
# Usage: bash setup-pi.sh <IP_DU_PI> <RESTAURANT_CODE> <DOMAINE>
#
# Exemple:
#   bash setup-pi.sh 172.20.10.3 MEREO mereo.quxly.fr
#
# Ce script fait tout automatiquement :
#   1. Installe Node.js 20
#   2. Copie bimiprint sur le Pi
#   3. Configure le .env
#   4. Installe le service systemd
#   5. Installe Tailscale
#   6. Lance bimiprint

set -e

# =============================================
# Arguments
# =============================================
PI_IP=${1:-}
RESTAURANT_CODE=${2:-}
DOMAIN=${3:-}
PI_USER="bimi"

if [ -z "$PI_IP" ] || [ -z "$RESTAURANT_CODE" ] || [ -z "$DOMAIN" ]; then
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║     BimiPrint - Setup nouveau Pi         ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""
    echo "Usage: bash setup-pi.sh <IP_DU_PI> <RESTAURANT_CODE> <DOMAINE>"
    echo ""
    echo "Exemples:"
    echo "  bash setup-pi.sh 172.20.10.3 MEREO mereo.quxly.fr"
    echo "  bash setup-pi.sh 192.168.1.50 BIMI bimisushi.fr"
    echo "  bash setup-pi.sh 172.20.10.5 SAKURA sakura-sushi.fr"
    echo ""
    echo "Prérequis:"
    echo "  1. Raspberry Pi flashé avec Raspberry Pi OS Desktop"
    echo "  2. Utilisateur 'bimi' créé"
    echo "  3. Pi connecté au WiFi"
    echo "  4. SSH activé sur le Pi"
    echo ""
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIMIPRINT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     BimiPrint - Setup nouveau Pi         ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Pi:         $PI_USER@$PI_IP"
echo "  Restaurant: $RESTAURANT_CODE"
echo "  Domaine:    $DOMAIN"
echo ""

# =============================================
# Vérification connexion
# =============================================
echo "[0/6] Vérification de la connexion au Pi..."
if ! ping -c 1 -W 3 "$PI_IP" &> /dev/null; then
    echo "❌ Impossible de joindre le Pi à $PI_IP"
    echo ""
    echo "Vérifiez que :"
    echo "  - Le Pi est allumé et connecté au WiFi"
    echo "  - Vous êtes sur le même réseau"
    echo "  - SSH est activé sur le Pi"
    exit 1
fi
echo "✓ Pi accessible"
echo ""

# =============================================
# 1. Installation Node.js
# =============================================
echo "[1/6] Installation de Node.js 20..."
ssh "$PI_USER@$PI_IP" "
    if command -v node &> /dev/null; then
        echo '✓ Node.js déjà installé:' \$(node --version)
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
        sudo apt-get install -y nodejs
        echo '✓ Node.js installé:' \$(node --version)
    fi
"
echo ""

# =============================================
# 2. Copie de bimiprint
# =============================================
echo "[2/6] Copie de bimiprint sur le Pi..."
ssh "$PI_USER@$PI_IP" "mkdir -p ~/bimiprint"
scp -r "$BIMIPRINT_DIR/src" "$PI_USER@$PI_IP:~/bimiprint/"
scp -r "$BIMIPRINT_DIR/web" "$PI_USER@$PI_IP:~/bimiprint/" 2>/dev/null || true
scp "$BIMIPRINT_DIR/package.json" "$PI_USER@$PI_IP:~/bimiprint/"
scp "$BIMIPRINT_DIR/package-lock.json" "$PI_USER@$PI_IP:~/bimiprint/" 2>/dev/null || true
scp "$BIMIPRINT_DIR/.env.example" "$PI_USER@$PI_IP:~/bimiprint/"
scp "$BIMIPRINT_DIR/bimiprint.service" "$PI_USER@$PI_IP:~/bimiprint/"
echo "✓ Fichiers copiés"
echo ""

# =============================================
# 3. Configuration .env
# =============================================
echo "[3/6] Configuration du .env..."
ssh "$PI_USER@$PI_IP" "cat > ~/bimiprint/.env << 'ENVEOF'
# BimiPrint Configuration - $RESTAURANT_CODE
VPS_URL=wss://$DOMAIN/print
RESTAURANT_CODE=$RESTAURANT_CODE
PRINTER_TYPE=network
PRINTER_ADDRESS=
ENVEOF"
echo "✓ .env configuré (VPS_URL=wss://$DOMAIN/print, CODE=$RESTAURANT_CODE)"
echo ""

# =============================================
# 4. Installation des dépendances + permissions USB
# =============================================
echo "[4/6] Installation des dépendances npm + permissions USB..."
ssh "$PI_USER@$PI_IP" "cd ~/bimiprint && npm install --production"
# Ajouter l'utilisateur au groupe lp pour accès /dev/usb/lp*
ssh "$PI_USER@$PI_IP" "
    sudo usermod -aG lp $PI_USER
    echo '✓ Permissions USB (groupe lp) configurées'
"
echo "✓ Dépendances installées"
echo ""

# =============================================
# 5. Installation du service systemd
# =============================================
echo "[5/6] Installation du service systemd..."
ssh "$PI_USER@$PI_IP" "
    sudo cp ~/bimiprint/bimiprint.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable bimiprint
    sudo systemctl restart bimiprint
"
sleep 3
echo "✓ Service installé et démarré"
echo ""

# =============================================
# 6. Installation Tailscale
# =============================================
echo "[6/6] Installation de Tailscale..."
ssh "$PI_USER@$PI_IP" "
    if command -v tailscale &> /dev/null; then
        echo '✓ Tailscale déjà installé'
    else
        curl -fsSL https://tailscale.com/install.sh | sh
        echo '✓ Tailscale installé'
    fi
"
echo ""

# =============================================
# Vérification finale
# =============================================
echo "═══════════════════════════════════════════"
echo "  Vérification du service BimiPrint"
echo "═══════════════════════════════════════════"
echo ""
ssh "$PI_USER@$PI_IP" "sudo systemctl status bimiprint --no-pager -l 2>&1 | head -20"
echo ""

# =============================================
# Résumé
# =============================================
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║          Setup terminé !                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  ✓ Node.js installé"
echo "  ✓ BimiPrint installé et configuré"
echo "  ✓ Service systemd actif"
echo "  ✓ Tailscale installé"
echo ""
echo "  Reste à faire :"
echo "  ─────────────────────────────────────────"
echo "  1. Connecter Tailscale :"
echo "     ssh $PI_USER@$PI_IP"
echo "     sudo tailscale up"
echo "     → Ouvrir le lien et se connecter"
echo ""
echo "  2. Configurer l'IP de l'imprimante :"
echo "     → Via le portail web : http://$PI_IP"
echo "     → Ou modifier le .env :"
echo "       ssh $PI_USER@$PI_IP"
echo "       nano ~/bimiprint/.env"
echo "       sudo systemctl restart bimiprint"
echo ""
echo "  3. Côté site web (si pas déjà fait) :"
echo "     → Ajouter VITE_PRINTER_CODE=$RESTAURANT_CODE"
echo "       dans les .env frontend + deploy"
echo ""
