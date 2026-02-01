# Guide Rapide - Mise à jour BimiPrint

## Ce qui a été corrigé

✅ **Plus de crash en boucle** - Le Pi revient automatiquement en mode configuration si le WiFi échoue
✅ **Interface toujours accessible** - Vous pouvez toujours voir les logs et modifier les paramètres
✅ **Test WiFi avant sauvegarde** - Le système teste la connexion avant de valider
✅ **Modification facile de l'imprimante** - Changez l'IP sans tout reconfigurer
✅ **Logs visibles** - Bouton pour voir ce qui se passe en temps réel
✅ **Bouton Reset** - Revenez en mode configuration quand vous voulez

## Mise à jour rapide

### Option 1 : Depuis votre PC (si le Pi est accessible en SSH)

```bash
cd "/home/quxly/Bureau/BIMI /Resto/bimiprint/scripts"
bash deploy-to-pi.sh <IP_DU_PI>
```

Exemple :
```bash
bash deploy-to-pi.sh 192.168.1.100
```

C'est tout ! Le script fait tout automatiquement.

### Option 2 : Manuellement (si pas d'accès SSH)

1. **Réinitialisez le Pi en mode AP** (pour pouvoir accéder via HDMI+clavier) :
   ```bash
   sudo rm /etc/bimiprint/config.json
   sudo systemctl restart bimiprint
   ```

2. **Copiez les fichiers via SCP ou clé USB**

3. **Redémarrez** :
   ```bash
   sudo systemctl restart bimiprint
   ```

## Installer Tailscale (recommandé)

Sur le Pi :
```bash
cd ~/bimiprint/scripts
sudo bash install-tailscale.sh
sudo tailscale up
```

Un lien s'affichera, ouvrez-le pour autoriser l'appareil.

**Avantage** : Vous pourrez accéder au Pi depuis n'importe où, même s'il est bloqué !

## Test au restaurant

1. **Avant de partir**, réinitialisez le Pi en mode AP :
   ```bash
   sudo rm /etc/bimiprint/config.json
   sudo systemctl restart bimiprint
   ```

2. **Au restaurant** :
   - Connectez-vous au WiFi "BimiPrint-RYPI"
   - Ouvrez http://192.168.4.1
   - Cliquez sur "Scanner les réseaux"
   - Sélectionnez le WiFi du restaurant
   - **IMPORTANT** : Vérifiez que c'est du 2.4GHz (pas 5GHz)
   - Entrez le mot de passe
   - Testez l'imprimante d'abord
   - Enregistrez

3. **Si ça échoue** :
   - Attendez 30 secondes
   - Le Pi revient automatiquement en mode AP
   - Reconnectez-vous et cliquez sur "Voir les logs"
   - Corrigez le problème et réessayez

## Nouvelles fonctionnalités de l'interface

Une fois configuré, vous pouvez accéder à l'interface web :
- Depuis le réseau du restaurant : http://<IP_DU_PI>
- Depuis n'importe où avec Tailscale : http://<IP_TAILSCALE>

Dans la section "Administration" :
- **Voir les logs** : Voir ce qui se passe en temps réel
- **Modifier l'imprimante** : Changer l'IP sans tout reconfigurer
- **Réinitialiser** : Revenir en mode configuration

## Aide rapide

**Le WiFi BimiPrint-RYPI n'apparaît pas** :
```bash
sudo systemctl restart bimiprint
sudo systemctl restart hostapd
```

**Voir les logs en direct** :
```bash
sudo journalctl -u bimiprint -f
```

**Forcer le mode AP** :
```bash
sudo rm /etc/bimiprint/config.json
sudo systemctl restart bimiprint
```

**Trouver l'IP du Pi** :
```bash
hostname -I
```

**Trouver l'IP Tailscale** :
```bash
tailscale ip -4
```

## Checklist avant le restaurant

- [ ] Pi mis à jour avec les nouveaux fichiers
- [ ] Tailscale installé (recommandé)
- [ ] Pi réinitialisé en mode AP
- [ ] WiFi BimiPrint-RYPI visible
- [ ] Interface accessible sur http://192.168.4.1
- [ ] Vous connaissez le WiFi du restaurant (nom + mot de passe)
- [ ] Vous connaissez l'IP de l'imprimante
- [ ] Vous avez vérifié que le WiFi est en 2.4GHz

Bon test ! 🚀
