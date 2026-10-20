/**
 * Filet de sécurité serveur : quand redémarrer le service, quand redémarrer le Pi.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, STALE_MS, MIN_REBOOT_INTERVAL_MS } = require('../src/serverWatchdog');

const NOW = Date.parse('2026-10-20T12:00:00Z');
const fresh = { failedRestarts: 0, lastRebootAt: null };

test('relié au serveur → rien à faire', () => {
  assert.equal(decide({ connected: true, internet: true, lastHealthyAt: NOW - 3600000, now: NOW, state: fresh }), 'ok');
});

test('coupure de moins de 10 min → on laisse la reconnexion normale faire', () => {
  assert.equal(decide({ connected: false, internet: true, lastHealthyAt: NOW - STALE_MS + 1000, now: NOW, state: fresh }), 'wait');
});

test('pas d\'internet du tout → on ne redémarre pas (box ou WiFi en cause, pas le Pi)', () => {
  assert.equal(decide({ connected: false, internet: false, lastHealthyAt: NOW - 2 * STALE_MS, now: NOW, state: fresh }), 'wait');
});

test('internet OK mais plus relié depuis 10 min → redémarrage du service', () => {
  assert.equal(decide({ connected: false, internet: true, lastHealthyAt: NOW - STALE_MS, now: NOW, state: fresh }), 'restart');
  assert.equal(decide({ connected: false, internet: true, lastHealthyAt: NOW - STALE_MS, now: NOW, state: { failedRestarts: 1, lastRebootAt: null } }), 'restart');
});

test('3e échec de suite → redémarrage complet du Pi', () => {
  assert.equal(decide({ connected: false, internet: true, lastHealthyAt: NOW - STALE_MS, now: NOW, state: { failedRestarts: 2, lastRebootAt: null } }), 'reboot');
});

test('déjà redémarré il y a moins d\'une heure → pas de boucle de reboots, service seulement', () => {
  const state = { failedRestarts: 5, lastRebootAt: NOW - MIN_REBOOT_INTERVAL_MS + 60000 };
  assert.equal(decide({ connected: false, internet: true, lastHealthyAt: NOW - STALE_MS, now: NOW, state }), 'restart');
});

test('dernier reboot il y a plus d\'une heure → reboot de nouveau autorisé', () => {
  const state = { failedRestarts: 2, lastRebootAt: NOW - MIN_REBOOT_INTERVAL_MS };
  assert.equal(decide({ connected: false, internet: true, lastHealthyAt: NOW - STALE_MS, now: NOW, state }), 'reboot');
});
