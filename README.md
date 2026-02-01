# BimiPrint

> Raspberry Pi print server for restaurants - WebSocket-based automatic order printing

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry_Pi-Zero_2W+-C51A4A?logo=raspberry-pi&logoColor=white)](https://www.raspberrypi.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lightweight print server that connects to your backend via WebSocket and automatically prints orders on a thermal printer. Perfect for restaurants needing reliable, real-time order printing.

## Architecture Globale

```
┌─────────────┐     Socket.IO      ┌─────────────┐     WebSocket      ┌─────────────┐
│   PWA       │ ──────────────────▶│   Backend   │ ──────────────────▶│ Raspberry   │
│  (Frontend) │                    │   (VPS)     │                    │     Pi      │
└─────────────┘                    └─────────────┘                    └──────┬──────┘
                                                                             │
                                                                        TCP/9100
                                                                             │
                                                                      ┌──────▼──────┐
                                                                      │ Imprimante  │
                                                                      │  Thermique  │
                                                                      └─────────────┘
```

## Matériel requis

- **Raspberry Pi Zero 2 W** (ou Pi 3/4, 512MB RAM minimum)
- **Carte microSD** 8GB+
- **Alimentation USB** 5V/2A
- **Imprimante thermique réseau** (ex: EPSON TM-T20III, port 9100)

## Modes de fonctionnement

1. **Mode Configuration** : WiFi `BimiPrint-XXXX` actif, portail web pour configurer
2. **Mode Normal** : Connecté au WiFi du restaurant, prêt à imprimer
3. **Mode Fallback** : Problème de connexion → WiFi AP actif + tentatives de reconnexion en arrière-plan

---

## Installation complète

### Etape 1 : Préparer la carte SD

1. Télécharger **Raspberry Pi Imager** : https://www.raspberrypi.com/software/
2. Choisir **Raspberry Pi OS (64-bit) avec Desktop**
   - **IMPORTANT** : La version Desktop inclut NetworkManager (nécessaire pour la gestion WiFi)
3. Cliquer sur l'engrenage (⚙️) pour les options avancées :
   - ✅ Nom d'hôte : `raspberrypi`
   - ✅ Activer SSH (mot de passe)
   - ✅ Utilisateur : `bimi` / Mot de passe : (au choix)
   - ✅ WiFi : configurer un réseau temporaire (partage de connexion téléphone ou box)
   - ✅ Fuseau horaire : Europe/Paris
4. Flasher la carte SD

### Etape 2 : Premier démarrage

1. Insérer la carte SD dans le Pi
2. Brancher l'alimentation
3. Attendre 2-3 minutes (premier boot plus long)

### Etape 3 : Trouver l'IP du Pi

Depuis ton PC (sur le même réseau) :

```bash
# Option 1 : Scanner le réseau avec nmap
nmap -sn 192.168.1.0/24

# Option 2 : Avec arp-scan
sudo apt install arp-scan
sudo arp-scan --localnet

# Option 3 : Nom mDNS
ping raspberrypi.local
```

### Etape 4 : Se connecter en SSH

```bash
ssh bimi@<IP_DU_PI>
# Mot de passe : celui défini à l'étape 1
```

Si SSH est refusé, activer SSH via `raspi-config` (avec écran/clavier sur le Pi) :
```bash
sudo raspi-config
# Interface Options → SSH → Enable
```

### Etape 5 : Copier les fichiers BimiPrint

**Depuis ton PC** (pas sur le Pi) :

```bash
# Créer le dossier sur le Pi
ssh bimi@<IP_DU_PI> "mkdir -p ~/bimiprint"

# Copier les fichiers (depuis le dossier bimiprint local)
cd /chemin/vers/bimiprint
scp -r src web package.json config.json bimiprint.service bimi@<IP_DU_PI>:~/bimiprint/
```

### Etape 6 : Installer Node.js

**Sur le Pi** (via SSH) :

```bash
# Installer Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Vérifier l'installation
node --version   # v20.x.x
npm --version
```

### Etape 7 : Installer les dépendances npm

```bash
cd ~/bimiprint
npm install
```

### Etape 8 : Configurer BimiPrint

```bash
cd ~/bimiprint

# Copier et éditer le fichier .env
cp .env.example .env
nano .env
```

Remplir les variables :
```env
VPS_URL=wss://your-backend.com/print
RESTAURANT_CODE=MYRESTAURANT
PRINTER_TYPE=network
PRINTER_ADDRESS=192.168.1.100
```

Puis créer la config système :
```bash
sudo mkdir -p /etc/bimiprint
sudo cp config.json /etc/bimiprint/
```

### Etape 9 : Installer le service systemd

```bash
# Copier le fichier service
sudo cp ~/bimiprint/bimiprint.service /etc/systemd/system/

# Recharger systemd
sudo systemctl daemon-reload

# Activer le démarrage automatique
sudo systemctl enable bimiprint

# Démarrer le service
sudo systemctl start bimiprint

# Vérifier le statut
sudo systemctl status bimiprint
```

### Etape 10 : Installer Tailscale (accès distant)

```bash
# Installer Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authentifier (ouvrir le lien affiché)
sudo tailscale up

# Noter l'IP Tailscale (fixe, accessible partout)
tailscale ip -4
```

---

## Configuration du restaurant

### Via le portail web (première configuration)

1. Le Pi crée un WiFi **BimiPrint-XXXX** (car `configured: false`)
2. Se connecter à ce WiFi avec un téléphone/PC
3. Ouvrir **http://192.168.4.1** dans un navigateur
4. Remplir :
   - Nom du restaurant (ex: BIMI)
   - WiFi du restaurant (SSID + mot de passe, ou cocher "Réseau ouvert")
   - IP de l'imprimante (ex: 192.168.1.188)
5. Cliquer **"Enregistrer"**
6. Le Pi se connecte au WiFi et passe en mode normal

### Reconfigurer un Pi déjà configuré

**Option 1 - Via SSH :**
```bash
# Éditer la config
sudo nano /etc/bimiprint/config.json
# Changer "configured": true → "configured": false

# Redémarrer le service
sudo systemctl restart bimiprint
```

**Option 2 - Via le portail web :**
- Accéder à http://<IP_DU_PI> (si accessible sur le réseau)
- Modifier les paramètres

---

## Commandes utiles

### Service BimiPrint

```bash
# Logs en temps réel
sudo journalctl -u bimiprint -f

# Redémarrer
sudo systemctl restart bimiprint

# Arrêter
sudo systemctl stop bimiprint

# Statut
sudo systemctl status bimiprint
```

### Diagnostic WiFi (NetworkManager)

```bash
# Connexions enregistrées
nmcli connection show

# WiFi actuel
nmcli device wifi show

# Scanner les réseaux
nmcli device wifi list

# Se connecter manuellement
sudo nmcli device wifi connect "NOM_WIFI" password "MOT_DE_PASSE"

# Se connecter à un réseau ouvert
sudo nmcli device wifi connect "NOM_WIFI"
```

### Diagnostic réseau

```bash
# Test internet
ping -c 3 google.com

# IP locale
hostname -I

# IP Tailscale
tailscale ip -4

# Test connexion imprimante
nc -zv <IP_IMPRIMANTE> 9100
```

---

## Structure des fichiers

```
bimiprint/
├── src/
│   ├── index.js       # Point d'entrée, gestion des modes
│   ├── config.js      # Lecture/écriture /etc/bimiprint/config.json
│   ├── wifi.js        # Gestion WiFi via NetworkManager (nmcli)
│   ├── portal.js      # Serveur web de configuration (port 80)
│   ├── websocket.js   # Connexion WebSocket au VPS
│   └── printer.js     # Communication imprimante (TCP port 9100)
├── web/
│   └── index.html     # Interface web du portail
├── package.json
├── config.json        # Config initiale (copier dans /etc/bimiprint/)
├── bimiprint.service  # Service systemd
└── README.md          # Ce fichier
```

### Fichiers sur le Pi

| Chemin | Description |
|--------|-------------|
| `/home/bimi/bimiprint/` | Code source |
| `/etc/bimiprint/config.json` | Configuration restaurant |
| `/etc/systemd/system/bimiprint.service` | Service systemd |

---

## Dépannage

### Le Pi ne crée pas le WiFi BimiPrint

1. Vérifier que NetworkManager est actif :
   ```bash
   systemctl status NetworkManager
   ```
2. Vérifier les logs :
   ```bash
   sudo journalctl -u bimiprint -n 50
   ```
3. Vérifier la config :
   ```bash
   cat /etc/bimiprint/config.json
   ```

### Erreur "WebSocket not connected"

1. Vérifier la connexion internet :
   ```bash
   ping -c 3 google.com
   ```
2. Vérifier l'URL dans la variable d'environnement `VPS_URL` ou `src/config.js`

### L'imprimante n'imprime pas

1. Vérifier que l'imprimante est allumée et sur le réseau
2. Tester la connexion :
   ```bash
   nc -zv <IP_IMPRIMANTE> 9100
   ```
3. Vérifier l'IP dans la config :
   ```bash
   cat /etc/bimiprint/config.json | grep printerAddress
   ```

### Réinitialisation complète

```bash
# Supprimer toutes les connexions WiFi
sudo nmcli connection delete $(nmcli -t -f NAME connection show | grep -v "lo")

# Remettre config à zéro
sudo bash -c 'cat > /etc/bimiprint/config.json << EOF
{
  "configured": false,
  "restaurantName": "",
  "printerType": "network",
  "printerAddress": ""
}
EOF'

# Redémarrer
sudo systemctl restart bimiprint
```

---

## Événements Socket.IO (Frontend ↔ Backend)

| Événement | Direction | Description |
|-----------|-----------|-------------|
| `print:request` | Frontend → Backend | Demande d'impression |
| `print:status` | Frontend → Backend | Vérifier disponibilité |
| `print:success` | Backend → Frontend | Impression OK |
| `print:error` | Backend → Frontend | Erreur |
| `printer:status` | Backend → Frontend | Status imprimante |

## Messages WebSocket (Backend ↔ Pi)

| Message | Direction | Description |
|---------|-----------|-------------|
| `connected` | Backend → Pi | Confirmation connexion |
| `print` | Backend → Pi | Job d'impression (base64) |
| `identify` | Pi → Backend | Identification restaurant |
| `ping/pong` | Bidirectionnel | Heartbeat |

---

## Checklist nouveau restaurant

```
[ ] Flasher Raspberry Pi OS Desktop sur carte SD
[ ] Configurer user "bimi" + SSH dans Imager
[ ] Premier boot, trouver l'IP (nmap -sn 192.168.1.0/24)
[ ] SSH : ssh bimi@<IP>
[ ] Copier fichiers BimiPrint (scp -r ...)
[ ] Installer Node.js (curl ... | sudo bash)
[ ] npm install
[ ] sudo mkdir -p /etc/bimiprint
[ ] sudo cp config.json /etc/bimiprint/
[ ] sudo cp bimiprint.service /etc/systemd/system/
[ ] sudo systemctl daemon-reload && sudo systemctl enable bimiprint && sudo systemctl start bimiprint
[ ] Installer Tailscale
[ ] Se connecter au WiFi BimiPrint-XXXX
[ ] Configurer via http://192.168.4.1
[ ] Vérifier logs : sudo journalctl -u bimiprint -f
[ ] Noter l'IP Tailscale pour accès distant
```

---

## Raspberry Pi compatibles

| Modèle | RAM | WiFi | Prix | Recommandation |
|--------|-----|------|------|----------------|
| **Pi Zero 2 W** | 512MB | ✅ | ~18€ | **Idéal** - compact et économique |
| Pi 3 Model B+ | 1GB | ✅ | ~40€ | OK si déjà disponible |
| Pi 4 Model B | 2-8GB | ✅ | ~50€+ | Overkill mais fonctionne |

**Kit minimum :** Pi Zero 2 W + microSD 8GB + alim USB ≈ 35€

---

## Licence

MIT
