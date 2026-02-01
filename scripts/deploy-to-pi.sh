#!/bin/bash

# Script de déploiement BimiPrint vers le Raspberry Pi
# Usage: bash deploy-to-pi.sh <IP_DU_PI>

if [ -z "$1" ]; then
    echo "Usage: bash deploy-to-pi.sh <IP_DU_PI>"
    echo "Exemple: bash deploy-to-pi.sh 192.168.1.100"
    exit 1
fi

PI_IP=$1
PI_USER="pi"

echo "=========================================="
echo "  Déploiement BimiPrint vers le Pi"
echo "=========================================="
echo ""
echo "IP cible: $PI_IP"
echo "Utilisateur: $PI_USER"
echo ""

# Vérifie que le Pi est accessible
echo "Vérification de la connexion..."
if ! ping -c 1 -W 2 "$PI_IP" &> /dev/null; then
    echo "❌ Impossible de joindre le Pi à l'adresse $PI_IP"
    echo ""
    echo "Vérifiez que :"
    echo "  - Le Pi est allumé"
    echo "  - Vous êtes sur le même réseau"
    echo "  - L'adresse IP est correcte"
    exit 1
fi

echo "✓ Pi accessible"
echo ""

# Sauvegarde sur le Pi
echo "Création d'une sauvegarde sur le Pi..."
ssh "$PI_USER@$PI_IP" "cp -r ~/bimiprint ~/bimiprint-backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
echo "✓ Sauvegarde créée"
echo ""

# Transfert des fichiers
echo "Transfert des fichiers..."
echo "  → src/"
scp -r ../src "$PI_USER@$PI_IP:~/bimiprint/"
echo "  → web/"
scp -r ../web "$PI_USER@$PI_IP:~/bimiprint/"
echo "  → scripts/"
scp -r ../scripts "$PI_USER@$PI_IP:~/bimiprint/"
echo "✓ Fichiers transférés"
echo ""

# Mise à jour du service systemd
echo "Mise à jour du service systemd..."
ssh "$PI_USER@$PI_IP" "sudo cp ~/bimiprint/scripts/bimiprint.service /etc/systemd/system/ && sudo systemctl daemon-reload"
echo "✓ Service systemd mis à jour"
echo ""

# Redémarrage du service
echo "Redémarrage du service BimiPrint..."
ssh "$PI_USER@$PI_IP" "sudo systemctl restart bimiprint"
sleep 2
echo "✓ Service redémarré"
echo ""

# Vérification du statut
echo "Vérification du statut..."
ssh "$PI_USER@$PI_IP" "sudo systemctl status bimiprint --no-pager -l" | head -15
echo ""

echo "=========================================="
echo "  Déploiement terminé !"
echo "=========================================="
echo ""
echo "Pour voir les logs en temps réel :"
echo "  ssh $PI_USER@$PI_IP"
echo "  sudo journalctl -u bimiprint -f"
echo ""
echo "Pour accéder à l'interface web :"
echo "  http://$PI_IP"
echo ""
