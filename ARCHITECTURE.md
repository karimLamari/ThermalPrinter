# Architecture BimiPrint - Système d'impression thermique WiFi

## Vue d'ensemble

BimiPrint est un service Node.js qui tourne sur Raspberry Pi pour recevoir des jobs d'impression depuis un serveur VPS via WebSocket et les envoyer à une imprimante thermique (Bluetooth ou réseau).

## Problèmes de l'architecture actuelle

### ❌ Problème 1 : Boucle de redémarrage infinie
- Le service vérifie le WiFi immédiatement au démarrage
- wpa_supplicant n'a pas le temps de se connecter
- Timeout après 30 secondes
- Le service se marque comme "non configuré" et redémarre
- systemd le redémarre automatiquement → boucle infinie

### ❌ Problème 2 : Manipulation directe du réseau
- Le service Node.js exécute des commandes sudo pour gérer wpa_supplicant
- Conflits entre le service et le système
- Erreurs si wpa_supplicant est occupé ou pas prêt

### ❌ Problème 3 : Pas de patience au démarrage
- Attend seulement 30 secondes pour le WiFi
- Sur un Pi lent ou réseau faible, ça peut prendre 1-2 minutes
- Pas de retry si la connexion échoue temporairement

## ✅ Architecture correcte

### Principes fondamentaux

1. **Séparation des responsabilités**
   - Le **système** (wpa_supplicant/NetworkManager) gère le WiFi
   - Le **service Node.js** attend passivement et se connecte au backend

2. **Deux modes clairement séparés**
   - **Mode AP** (non configuré) : Portail web de configuration seulement
   - **Mode Client** (configuré) : Attente WiFi + connexion backend

3. **Patience et résilience**
   - Attendre jusqu'à **3 minutes** pour le WiFi au démarrage
   - **Ne jamais** marquer comme "non configuré" automatiquement
   - Réessayer la connexion WebSocket indéfiniment

### Flux de démarrage (Mode Client)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Service démarre                                      │
│    - Charge la config                                   │
│    - Mode: configuré                                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────┐
│ 2. Démarre le portail web (port 80)                    │
│    - Pour permettre la reconfiguration si besoin       │
│    - Non bloquant                                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────┐
│ 3. Attente passive du WiFi (max 3 minutes)            │
│    - Vérifie toutes les 5 secondes                     │
│    - Utilise un simple ping vers 8.8.8.8               │
│    - NE TOUCHE PAS à wpa_supplicant                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├─ WiFi OK ─────────────────┐
                 │                            v
                 │              ┌─────────────────────────────┐
                 │              │ 4. Connecte au WebSocket    │
                 │              │    - wss://server/print      │
                 │              │    - Retry automatique       │
                 │              └──────────────┬──────────────┘
                 │                             v
                 │              ┌─────────────────────────────┐
                 │              │ 5. Prêt à imprimer          │
                 │              │    - Écoute les jobs         │
                 │              └─────────────────────────────┘
                 │
                 └─ WiFi KO après 3 min ────┐
                                             v
                            ┌─────────────────────────────────┐
                            │ Log erreur, mais NE PAS redémarrer│
                            │ Réessayer toutes les 30 secondes │
                            └─────────────────────────────────┘
```

**Important :**
- ❌ **NE JAMAIS** marquer `configured=false` automatiquement
- ❌ **NE JAMAIS** redémarrer le service automatiquement
- ✅ Continuer à réessayer indéfiniment
- ✅ L'utilisateur peut reconfigurer via le portail web (http://IP_DU_PI)

### Flux de configuration (Mode AP)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Service démarre                                      │
│    - configured=false                                   │
│    - Mode: AP                                           │
└────────────────┬────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────┐
│ 2. Configure l'interface réseau en AP                  │
│    - Crée le point d'accès BimiPrint-XXXX              │
│    - IP: 192.168.4.1                                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────┐
│ 3. Démarre le portail web                              │
│    - Interface de configuration                         │
│    - http://192.168.4.1                                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────┐
│ 4. Utilisateur se connecte au WiFi BimiPrint          │
│    - Ouvre http://192.168.4.1                          │
│    - Remplit le formulaire                              │
│    - Clique "Enregistrer"                               │
└────────────────┬────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────┐
│ 5. Écriture de la configuration                        │
│    - Écrit /etc/wpa_supplicant/wpa_supplicant.conf    │
│    - Marque configured=true                             │
│    - Redémarre le système (sudo reboot)                │
└─────────────────────────────────────────────────────────┘
```

**Important :**
- ✅ **Redémarre le système complet** (pas juste le service)
- ✅ Cela permet à wpa_supplicant de démarrer proprement
- ✅ Pas de conflit entre mode AP et mode client

## Modifications nécessaires

### 1. `src/index.js` - Flux de démarrage

**AVANT (problématique) :**
```javascript
const wifiOk = await isWifiConnected();
if (!wifiOk) {
  await waitForWifi(30); // 30 sec seulement
}
// Si échec:
saveConfig({ ...config, configured: false }); // ← BUG
process.exit(0); // ← BUG
```

**APRÈS (correct) :**
```javascript
// Attendre patiemment le WiFi (3 minutes)
const wifiOk = await waitForInternet(180); // 3 minutes

if (!wifiOk) {
  console.error('⚠️ Pas de connexion internet après 3 minutes');
  console.log('Le service va continuer à réessayer...');
  // NE PAS marquer configured=false
  // NE PAS redémarrer
  // Juste logger et continuer
}

// Connexion WebSocket avec retry automatique
connectWebSocketWithRetry();
```

### 2. `src/wifi.js` - Gestion passive

**AVANT (problématique) :**
```javascript
// Manipule wpa_supplicant directement
await execAsync('sudo systemctl restart wpa_supplicant');
await execAsync('sudo wpa_cli -i wlan0 reconfigure');
```

**APRÈS (correct) :**
```javascript
// Vérifie passivement la connexion
async function hasInternet() {
  try {
    // Simple ping vers Google DNS
    await execAsync('ping -c 1 -W 2 8.8.8.8');
    return true;
  } catch (e) {
    return false;
  }
}

// Attendre patiemment la connexion
async function waitForInternet(maxSeconds = 180) {
  for (let i = 0; i < maxSeconds / 5; i++) {
    if (await hasInternet()) return true;
    await sleep(5000); // Vérifier toutes les 5 secondes
  }
  return false;
}
```

### 3. `src/portal.js` - Configuration simplifiée

**AVANT (problématique) :**
```javascript
// Teste la connexion AVANT de sauvegarder
await connectToWifi(wifiSSID, wifiPassword); // ← Prend 30-40 sec
saveConfig(config);
```

**APRÈS (correct) :**
```javascript
// Sauvegarde SANS tester, puis redémarre le système
writeWpaSupplicantConfig(wifiSSID, wifiPassword);
saveConfig({ ...config, configured: true });

// Redémarre le SYSTÈME (pas juste le service)
setTimeout(() => {
  exec('sudo reboot');
}, 2000);
```

### 4. `src/websocket.js` - Retry automatique

**Ajouter un retry infini avec backoff exponentiel :**

```javascript
function connectWithRetry() {
  const ws = new WebSocket(url);

  ws.on('error', (err) => {
    console.error('Erreur WebSocket:', err.message);
    // Retry après délai exponentiel (1s, 2s, 4s, ..., max 30s)
    const delay = Math.min(reconnectDelay, 30000);
    setTimeout(connectWithRetry, delay);
    reconnectDelay *= 2;
  });
}
```

## Résumé des changements

| Fichier | Changement principal |
|---------|---------------------|
| `index.js` | Attendre 3 min au lieu de 30 sec, NE JAMAIS redémarrer |
| `wifi.js` | Vérification passive (ping), pas de manipulation wpa_supplicant |
| `portal.js` | Redémarrer le système après config, pas tester avant |
| `websocket.js` | Retry infini avec backoff exponentiel |
| `bimiprint.service` | Watchdog désactivé (déjà fait) |

## Tests à effectuer

1. **Test démarrage à froid** : Débrancher le Pi, le rebrancher, vérifier qu'il se connecte (peut prendre 1-2 min)
2. **Test perte WiFi** : Couper le routeur, vérifier que le service réessaie sans crasher
3. **Test reconfiguration** : Via http://IP_DU_PI, changer le réseau WiFi
4. **Test impression** : Envoyer un job depuis le backend

## Bénéfices de cette architecture

✅ **Pas de boucle infinie** : Le service ne redémarre jamais automatiquement
✅ **Résilient** : Continue à fonctionner même en cas d'erreur temporaire
✅ **Simple** : Laisse le système gérer le WiFi
✅ **Débogable** : Logs clairs, pas d'opérations cachées
✅ **Production-ready** : Tolérant aux pannes réseau
