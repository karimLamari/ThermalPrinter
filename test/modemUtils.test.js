const test = require('node:test');
const assert = require('node:assert/strict');
const { parseModemResponse, usbDeviceFromSysPath } = require('../src/modemUtils');

test('réponses finales du modem', () => {
  assert.equal(parseModemResponse('OK'), 'OK');
  assert.equal(parseModemResponse('  ok \r'), 'OK');
  assert.equal(parseModemResponse('ERROR'), 'ERROR');
  assert.equal(parseModemResponse('RING'), null);
  assert.equal(parseModemResponse('NMBR = 0612345678'), null);
  assert.equal(parseModemResponse('AT+VCID=1'), null); // écho de la commande
  assert.equal(parseModemResponse('+GCI: 3D'), null);
});

test('identifiant USB depuis le chemin sysfs', () => {
  assert.equal(usbDeviceFromSysPath('/sys/devices/platform/soc/20980000.usb/usb1/1-1/1-1.2/1-1.2:1.0'), '1-1.2');
  assert.equal(usbDeviceFromSysPath('/sys/devices/platform/soc/20980000.usb/usb1/1-1/1-1:1.0'), '1-1');
  assert.equal(usbDeviceFromSysPath('/sys/devices/virtual/tty'), null);
  assert.equal(usbDeviceFromSysPath(''), null);
});
