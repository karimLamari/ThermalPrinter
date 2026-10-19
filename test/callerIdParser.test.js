/**
 * Tests de la lecture du modem (sans matériel) : node --test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLine,
  interpretNumber,
  createCallTracker,
  WAIT_FOR_NUMBER_MS,
  CALL_GAP_MS,
} = require('../src/callerIdParser');

// Horloge et minuteurs manuels : on avance le temps à la main.
function fakeClock() {
  let t = Date.parse('2026-10-16T12:00:00Z');
  const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const timer = { fn, at: t + ms, done: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { if (timer) timer.done = true; },
    advance(ms) {
      t += ms;
      for (const timer of timers) {
        if (!timer.done && timer.at <= t) {
          timer.done = true;
          timer.fn();
        }
      }
    },
  };
}

function tracker() {
  const clock = fakeClock();
  const calls = [];
  const { feed } = createCallTracker({
    onCall: (call) => calls.push(call),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { feed, calls, clock };
}

test('parseLine : sonnerie, champs avec ou sans espaces, lignes ignorées', () => {
  assert.deepEqual(parseLine('RING'), { kind: 'ring' });
  assert.deepEqual(parseLine('  ring \r'), { kind: 'ring' });
  assert.deepEqual(parseLine('NMBR = 0612345678'), { kind: 'field', key: 'NMBR', value: '0612345678' });
  assert.deepEqual(parseLine('NMBR=0612345678'), { kind: 'field', key: 'NMBR', value: '0612345678' });
  assert.deepEqual(parseLine('DATE = 1016'), { kind: 'field', key: 'DATE', value: '1016' });
  assert.equal(parseLine('OK'), null);
  assert.equal(parseLine('AT+VCID=1'), null);
  assert.equal(parseLine(''), null);
});

test('interpretNumber : numéro, masqué, indisponible', () => {
  assert.deepEqual(interpretNumber('0612345678'), { number: '0612345678', presentation: 'number' });
  assert.deepEqual(interpretNumber('06 12 34 56 78'), { number: '0612345678', presentation: 'number' });
  assert.deepEqual(interpretNumber('+33612345678'), { number: '+33612345678', presentation: 'number' });
  assert.deepEqual(interpretNumber('P'), { number: null, presentation: 'private' });
  assert.deepEqual(interpretNumber('O'), { number: null, presentation: 'unavailable' });
  assert.deepEqual(interpretNumber(''), { number: null, presentation: 'unavailable' });
});

test('numéro avant la première sonnerie (cas France) → un seul appel signalé', () => {
  const { feed, calls, clock } = tracker();
  feed('DATE = 1016');
  feed('TIME = 1200');
  feed('NMBR = 0612345678');
  feed('RING');
  clock.advance(5000);
  feed('RING');
  clock.advance(5000);
  feed('RING');
  clock.advance(WAIT_FOR_NUMBER_MS);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].number, '0612345678');
  assert.equal(calls[0].presentation, 'number');
  assert.equal(calls[0].at, '2026-10-16T12:00:00.000Z');
});

test('numéro entre la 1re et la 2e sonnerie → signalé avec le numéro, pas en « indisponible »', () => {
  const { feed, calls, clock } = tracker();
  feed('RING');
  clock.advance(1500);
  feed('NMBR = 0561000000');
  clock.advance(WAIT_FOR_NUMBER_MS);
  feed('RING');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].number, '0561000000');
  assert.equal(calls[0].at, '2026-10-16T12:00:00.000Z'); // heure de la 1re sonnerie
});

test('aucun numéro reçu → appel signalé quand même après le délai', () => {
  const { feed, calls, clock } = tracker();
  feed('RING');
  clock.advance(WAIT_FOR_NUMBER_MS - 1);
  assert.equal(calls.length, 0);
  clock.advance(1);

  assert.equal(calls.length, 1);
  assert.deepEqual(
    { number: calls[0].number, presentation: calls[0].presentation },
    { number: null, presentation: 'unavailable' }
  );
});

test('numéro masqué', () => {
  const { feed, calls } = tracker();
  feed('NMBR = P');
  feed('RING');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].presentation, 'private');
  assert.equal(calls[0].number, null);
});

test('deux appels successifs séparés par un silence → deux appels', () => {
  const { feed, calls, clock } = tracker();
  feed('NMBR = 0612345678');
  feed('RING');
  clock.advance(CALL_GAP_MS + 1);
  feed('NMBR = 0698765432');
  feed('RING');

  assert.equal(calls.length, 2);
  assert.equal(calls[1].number, '0698765432');
});

test('sonneries suivantes sans nouveau numéro → pas de second signalement', () => {
  const { feed, calls, clock } = tracker();
  feed('NMBR = 0612345678');
  for (let i = 0; i < 6; i += 1) {
    feed('RING');
    clock.advance(5000);
  }
  assert.equal(calls.length, 1);
});
