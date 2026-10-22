#!/bin/bash
# bimi-modem-guard - gardien du modem d'identification d'appel (Rajpoot).
# Tourne à côté de bimiprint SANS l'arrêter : si le modem est figé (une
# écriture ne se termine pas), réinitialisation USB puis renvoi des réglages
# (pays France + affichage du numéro). Renvoie aussi les réglages toutes les 30 min.
LOG() { logger -t bimi-modem "$*"; }
DEV=$(ls /dev/serial/by-id/*Conexant* 2>/dev/null | head -1)
[ -n "$DEV" ] || exit 0
REAL=$(realpath "$DEV")
USBID=$(basename "$(dirname "$(realpath /sys/class/tty/$(basename "$REAL")/device)")")
RESET_STAMP=/run/bimi-modem-reset
SETTINGS_STAMP=/run/bimi-modem-settings

send_settings() {
  ( printf 'AT+GCI=3D\r' > "$DEV"; sleep 2; printf 'AT+VCID=1\r' > "$DEV" ) &
  local pid=$!
  for _ in 1 2 3 4 5 6; do sleep 1; kill -0 $pid 2>/dev/null || { touch $SETTINGS_STAMP; return 0; }; done
  return 1
}

# Le modem répond-il ? (écriture en arrière-plan : si elle reste bloquée,
# on n'attend pas, le processus coincé est abandonné)
( printf 'AT\r' > "$DEV" ) &
PID=$!
FROZEN=1
for _ in 1 2 3 4 5; do sleep 1; kill -0 $PID 2>/dev/null || { FROZEN=0; break; }; done

if [ $FROZEN -eq 1 ]; then
  if [ -f $RESET_STAMP ] && [ $(( $(date +%s) - $(stat -c %Y $RESET_STAMP) )) -lt 300 ]; then
    LOG "modem figé, réinitialisation déjà faite il y a moins de 5 min"
    exit 0
  fi
  touch $RESET_STAMP
  LOG "modem figé : réinitialisation USB ($USBID)"
  echo "$USBID" > /sys/bus/usb/drivers/usb/unbind 2>/dev/null
  sleep 3
  echo "$USBID" > /sys/bus/usb/drivers/usb/bind 2>/dev/null
  sleep 45   # bimiprint rouvre le modem 30 s après l'avoir perdu
  DEV=$(ls /dev/serial/by-id/*Conexant* 2>/dev/null | head -1)
  [ -n "$DEV" ] && send_settings && LOG "réglages renvoyés après réinitialisation" || LOG "réglages NON renvoyés après réinitialisation"
  exit 0
fi

# Modem vivant : réglages renvoyés toutes les 30 min
if [ ! -f $SETTINGS_STAMP ] || [ $(( $(date +%s) - $(stat -c %Y $SETTINGS_STAMP) )) -ge 1800 ]; then
  send_settings && LOG "réglages renvoyés (contrôle 30 min)" || LOG "réglages bloqués"
fi
