/**
 * modemUtils.js - Fonctions pures pour dialoguer avec le modem (testées sans
 * matériel : test/modemUtils.test.js).
 */

/**
 * Réponse finale d'une commande AT, ou null si la ligne n'en est pas une.
 * @param {string} line
 * @returns {'OK'|'ERROR'|null}
 */
function parseModemResponse(line) {
  const text = String(line || '').trim().toUpperCase();
  if (text === 'OK') return 'OK';
  if (text === 'ERROR' || text.startsWith('+CME ERROR')) return 'ERROR';
  return null;
}

/**
 * Identifiant USB du modem (ex. « 1-1.2 ») à partir du chemin sysfs de son
 * interface (ex. /sys/devices/platform/soc/.../usb1/1-1/1-1.2/1-1.2:1.0).
 * Sert à le réinitialiser via /sys/bus/usb/drivers/usb/{unbind,bind}.
 * @param {string} sysPath
 * @returns {string|null}
 */
function usbDeviceFromSysPath(sysPath) {
  const parts = String(sysPath || '').split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (/^\d+-[\d.]+$/.test(parts[i])) return parts[i];
  }
  return null;
}

module.exports = { parseModemResponse, usbDeviceFromSysPath };
