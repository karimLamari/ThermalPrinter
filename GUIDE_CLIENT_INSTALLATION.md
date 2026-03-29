# BimiPrint - Guide d'installation rapide

## Contenu du kit

- 1 boitier BimiPrint (Raspberry Pi)
- 1 cable d'alimentation micro-USB
- 1 carte microSD (pre-configuree)

**Prerequis :** une imprimante thermique WiFi (port 9100), connectee a votre reseau local.

---

## Pourquoi ce boitier ?

Votre imprimante thermique ne peut pas recevoir de commandes directement depuis votre site. Le boitier BimiPrint, connecte a votre WiFi, fait le lien entre votre site d'administration et votre imprimante.

## Comment ca fonctionne ?

Quand vous acceptez une commande depuis votre interface d'administration, le ticket est automatiquement envoye au boitier qui l'imprime sur votre imprimante thermique. Aucune action supplementaire n'est necessaire.

```
Commande acceptee (interface admin)  →  Boitier BimiPrint  →  Imprimante thermique
```

---

## Etape 1 - Brancher le boitier

1. Branchez le cable d'alimentation au boitier
2. Branchez l'autre extremite a une prise electrique
3. Le voyant vert s'allume : le boitier demarre (environ 30 secondes)

> Le boitier cree automatiquement un reseau WiFi temporaire pour la configuration.

---

## Etape 2 - Se connecter au boitier

Sur votre telephone ou ordinateur :

1. Ouvrez les parametres WiFi
2. Connectez-vous au reseau **BimiPrint-XXXX** (les 4 derniers caracteres varient)
3. Aucun mot de passe requis
4. Une page de configuration s'ouvre automatiquement

> Si la page ne s'ouvre pas, ouvrez votre navigateur et tapez : **http://192.168.4.1**

---

## Etape 3 - Connecter au WiFi du restaurant

Sur la page de configuration :

1. La liste des reseaux WiFi disponibles s'affiche
2. Selectionnez le WiFi de votre restaurant
3. Entrez le mot de passe WiFi
4. Appuyez sur **Connecter**

> Important : utilisez votre reseau WiFi principal (celui auquel votre imprimante est connectee).

---

## Etape 4 - Configurer l'imprimante

Toujours sur la page de configuration :

1. **Code restaurant** : laissez la valeur pre-remplie (ex: BIMI)
2. **Type d'imprimante** : selectionnez **WiFi**
3. **Adresse imprimante** : entrez l'adresse IP de l'imprimante (ex: 192.168.1.100)
4. Appuyez sur **Tester** pour verifier la connexion
5. Appuyez sur **Enregistrer**

> Le boitier redemarre automatiquement et se connecte a votre reseau.

### Comment trouver l'adresse IP de l'imprimante ?

La plupart des imprimantes thermiques permettent d'imprimer une page de configuration :

- Maintenez le bouton **FEED** enfonce pendant 5 secondes a l'allumage
- L'adresse IP apparait sur le ticket imprime (ex: 192.168.1.100)

> Consultez le manuel de votre imprimante si cette methode ne fonctionne pas.

---

## Etape 5 - Verifier que tout fonctionne

Une fois le boitier redemarre :

1. Votre telephone se reconnecte au WiFi du restaurant
2. Sur votre interface d'administration, lancez une impression test
3. Le ticket doit sortir de l'imprimante

> L'impression est automatique : chaque nouvelle commande acceptee declenche l'impression du ticket.

---

## En cas de probleme

| Probleme                                | Solution                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Le reseau BimiPrint-XXXX n'apparait pas | Debranchez puis rebranchez le boitier. Attendez 30 secondes.                                                             |
| La page de configuration ne s'ouvre pas | Tapez **http://192.168.4.1** dans le navigateur.                                                                         |
| Le WiFi du restaurant ne s'affiche pas  | Verifiez que le boitier est a portee du routeur WiFi.                                                                    |
| L'imprimante ne repond pas au test      | Verifiez que l'imprimante est allumee et connectee au meme reseau WiFi.                                                  |
| Les tickets ne s'impriment plus         | Debranchez puis rebranchez le boitier. Il se reconnecte automatiquement.                                                 |
| Changement de WiFi ou d'imprimante      | Debranchez le boitier 10 secondes, rebranchez. Si le WiFi echoue, le reseau BimiPrint-XXXX reapparait pour reconfigurer. |

---

## Informations utiles

- Le boitier doit rester branche en permanence
- Il se reconnecte automatiquement en cas de coupure WiFi ou electrique
- Le voyant vert fixe = fonctionnement normal
- Aucune maintenance requise
