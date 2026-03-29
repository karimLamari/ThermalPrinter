# BimiPrint

> Impression thermique depuis une web app via Raspberry Pi — sans app native

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry_Pi-Zero_2W+-C51A4A?logo=raspberry-pi&logoColor=white)](https://www.raspberrypi.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Le problème

Les navigateurs ne peuvent pas communiquer directement avec les imprimantes thermiques ESC/POS. Les solutions natives sont lourdes, les services cloud sont chers.

## La solution

Un Raspberry Pi à ~20€ fait le pont entre le backend et l'imprimante. Le serveur envoie les jobs d'impression via WebSocket, le Pi les reçoit et les transmet à l'imprimante en TCP.

```
Frontend (PWA) ──► Backend (VPS) ──► Raspberry Pi ──► Imprimante thermique
                    Socket.IO         WebSocket        TCP/9100 (ESC/POS)
```

## Fonctionnalités

- Connexion WebSocket au backend avec auto-reconnect
- Support imprimantes ESC/POS (réseau TCP/9100)
- Mode AP WiFi pour configuration initiale
- Portail web de configuration (port 80)
- Accès distant via Tailscale
- Service systemd (démarrage automatique)

## Matériel requis

| Composant | Recommandé |
|-----------|-----------|
| Raspberry Pi | Zero 2 W, 3, 4 ou 5 |
| Carte microSD | 8 Go minimum |
| Imprimante | ESC/POS réseau (port 9100) |
| Câble | Ethernet RJ45 (imprimante → box) |

---

## Setup rapide (script automatisé)

### Prérequis

1. Carte SD flashée avec **Raspberry Pi OS Desktop**
2. Utilisateur **bimi** créé (dans Raspberry Pi Imager)
3. Pi connecté au **WiFi** et **SSH activé**

### Lancer le setup

Depuis ton PC, dans le dossier `bimiprint/scripts/` :

```bash
bash setup-pi.sh <IP_DU_PI> <RESTAURANT_CODE> <DOMAINE>
```

Exemples :

```bash
bash setup-pi.sh 172.20.10.3 MEREO mereo.quxly.fr
bash setup-pi.sh 192.168.1.50 BIMI bimisushi.fr
bash setup-pi.sh 172.20.10.5 SAKURA sakura-sushi.fr
```

Le script fait tout automatiquement :
1. Installe Node.js 20
2. Copie bimiprint sur le Pi
3. Configure le `.env`
4. Installe les dépendances npm
5. Active le service systemd
6. Installe Tailscale

### Préparer l'envoi au restaurant

Avant d'envoyer le boîtier, supprimer les WiFi enregistrés pendant le setup (sinon le Pi cherchera ton WiFi au lieu de passer en hotspot) :

```bash
ssh bimi@<IP_DU_PI> "sudo nmcli -t -f NAME,TYPE connection show | grep wifi | cut -d: -f1 | grep -v BimiPrint-Hotspot | xargs -I{} sudo nmcli connection delete '{}'"
```

Au démarrage chez le restaurateur, le Pi ne trouvera aucun WiFi connu et passera directement en hotspot `BimiPrint-XXXX`. Le restaurateur n'a qu'à :
1. Se connecter au WiFi `BimiPrint-XXXX` depuis son téléphone
2. Ouvrir `http://192.168.4.1`
3. Sélectionner le WiFi du restaurant et entrer le mot de passe

### Après le script

**Connecter Tailscale** (accès distant) :

```bash
ssh bimi@<IP_DU_PI>
sudo tailscale up
# → Ouvrir le lien affiché et se connecter avec le même compte
```

**Configurer l'IP de l'imprimante** (quand elle est branchée) :

```bash
# Option 1 : Via le portail web
http://<IP_DU_PI>

# Option 2 : Via le .env
ssh bimi@<IP_DU_PI>
nano ~/bimiprint/.env   # Remplir PRINTER_ADDRESS=192.168.x.x
sudo systemctl restart bimiprint
```

**Trouver l'IP de l'imprimante** :
- Éteindre l'imprimante
- Maintenir le bouton **Feed** enfoncé
- Allumer l'imprimante en gardant le bouton appuyé
- Relâcher → elle imprime une page avec son **IP address**

---

## Setup manuel (étape par étape)

### 1. Flasher la carte SD

- Ouvrir **Raspberry Pi Imager**
- OS : **Raspberry Pi OS Desktop** (64-bit)
- Configurer : username `bimi`, mot de passe, WiFi, activer SSH
- Flasher

### 2. Connecter le Pi

```bash
ssh bimi@raspberrypi.local
# ou ssh bimi@<IP_DU_PI>
```

> Si SSH ne fonctionne pas : brancher écran + clavier, connecter le WiFi via le bureau, ouvrir un terminal (`Ctrl+Alt+T`) et lancer `sudo systemctl enable --now ssh`

### 3. Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

### 4. Copier bimiprint (depuis ton PC)

```bash
scp -r /chemin/vers/bimiprint bimi@<IP_DU_PI>:~/bimiprint
```

### 5. Configurer

```bash
cd ~/bimiprint
cp .env.example .env
nano .env
```

```env
VPS_URL=wss://domaine-client.fr/print
RESTAURANT_CODE=CODE_CLIENT
PRINTER_TYPE=network
PRINTER_ADDRESS=192.168.x.x
```

### 6. Installer et lancer

```bash
cd ~/bimiprint
npm install
sudo cp bimiprint.service /etc/systemd/system/
sudo systemctl enable --now bimiprint
```

### 7. Installer Tailscale (accès distant)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

---

## Côté site web

Pour chaque nouveau client, ajouter la variable `VITE_PRINTER_CODE` :

| Fichier | Variable |
|---------|----------|
| `.env.{client}` (dev local) | `VITE_PRINTER_CODE=CODE_CLIENT` |
| `deploy/clients/{client}/.env` | `VITE_PRINTER_CODE=CODE_CLIENT` |
| `deploy/clients/{client}/docker-compose.yml` | Déjà inclus via template |

Le code restaurant côté frontend doit correspondre au `RESTAURANT_CODE` dans le `.env` du Pi.

---

## Configuration

### Variables .env du Pi

| Variable | Description | Exemple |
|----------|-------------|---------|
| `VPS_URL` | URL WebSocket du backend | `wss://mereo.quxly.fr/print` |
| `RESTAURANT_CODE` | Identifiant unique du restaurant | `MEREO` |
| `PRINTER_TYPE` | Type de connexion | `network` |
| `PRINTER_ADDRESS` | IP de l'imprimante | `192.168.1.100` |
| `WIFI_SSID` | WiFi (optionnel, configurable via portail) | |
| `WIFI_PASSWORD` | Mot de passe WiFi (optionnel) | |

### Portail web

Accessible sur `http://<IP_DU_PI>` — permet de configurer WiFi, imprimante et code restaurant sans toucher au terminal.

---

## Commandes utiles

```bash
# Statut du service
sudo systemctl status bimiprint

# Logs en temps réel
sudo journalctl -u bimiprint -f

# Redémarrer le service
sudo systemctl restart bimiprint

# IP Tailscale du Pi
tailscale ip -4

# Statut Tailscale
tailscale status
```

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `scripts/setup-pi.sh` | Setup complet automatisé d'un nouveau Pi |
| `scripts/deploy-to-pi.sh` | Mise à jour de bimiprint sur un Pi existant |
| `scripts/install.sh` | Installation manuelle sur le Pi |
| `scripts/install-tailscale.sh` | Installation Tailscale seule |

## Dépannage

| Problème | Solution |
|----------|----------|
| SSH "Connection refused" | Activer SSH : `sudo systemctl enable --now ssh` |
| Pi pas trouvé sur le réseau | Brancher écran, connecter WiFi via GUI |
| WebSocket ne se connecte pas | Vérifier `VPS_URL` dans `.env` et que le backend tourne |
| Impression ne sort pas | Vérifier `PRINTER_ADDRESS` et que l'imprimante est allumée/branchée |
| Tailscale ne voit pas le Pi | Vérifier que les deux appareils sont sur le même compte Tailscale |

## License

MIT
