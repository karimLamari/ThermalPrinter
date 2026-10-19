/**
 * callerIdParser.js - Lecture des lignes du modem (identification de l'appelant).
 *
 * Fonctions pures + un petit automate sans accès matériel : testable sans modem
 * (test/callerIdParser.test.js). L'accès au port série est dans callerId.js.
 *
 * Ce qu'écrit un modem Conexant (CX93010) après AT+VCID=1, à chaque appel :
 *
 *   RING
 *   DATE = 1016
 *   TIME = 1432
 *   NMBR = 0612345678     (P = numéro masqué, O = indisponible)
 *   NAME = ...            (rarement envoyé en France)
 *   RING
 *
 * En France le numéro arrive souvent AVANT la première sonnerie : l'automate
 * ouvre donc un appel sur la première ligne utile, qu'elle soit RING ou NMBR.
 */

// Délai sans numéro après la première sonnerie avant de signaler l'appel
// quand même (ligne sans présentation du numéro, ou numéro non décodé).
const WAIT_FOR_NUMBER_MS = 7000;
// Au-delà de ce silence, la ligne suivante appartient à un NOUVEL appel
// (les sonneries d'un même appel reviennent toutes les 5 s environ ; assez
// court pour ne pas fusionner un client qui rappelle aussitôt).
const CALL_GAP_MS = 8000;

/**
 * Découpe une ligne du modem.
 * @param {string} line
 * @returns {{kind: 'ring'} | {kind: 'field', key: string, value: string} | null}
 */
function parseLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  if (/^RING$/i.test(text)) return { kind: 'ring' };

  const match = text.match(/^(DATE|TIME|NMBR|NAME|DDN_NMBR)\s*=\s*(.*)$/i);
  if (!match) return null; // OK, ERROR, écho des commandes AT, etc.
  return { kind: 'field', key: match[1].toUpperCase(), value: match[2].trim() };
}

/**
 * Interprète la valeur NMBR.
 * @param {string} value
 * @returns {{number: string|null, presentation: 'number'|'private'|'unavailable'}}
 */
function interpretNumber(value) {
  const raw = String(value || '').trim();
  if (/^P$/i.test(raw)) return { number: null, presentation: 'private' };
  if (!raw || /^O$/i.test(raw)) return { number: null, presentation: 'unavailable' };

  const number = raw.replace(/[^\d+]/g, '');
  if (number.replace(/\D/g, '').length < 3) return { number: null, presentation: 'unavailable' };
  return { number, presentation: 'number' };
}

/**
 * Regroupe les lignes du modem en appels et signale chaque appel UNE fois.
 *
 * @param {Object} opts
 * @param {(call: {number: string|null, presentation: string, name: string|null, at: string}) => void} opts.onCall
 * @param {() => number} [opts.now]
 * @param {Function} [opts.setTimer]
 * @param {Function} [opts.clearTimer]
 * @returns {{ feed: (line: string) => void }}
 */
function createCallTracker({
  onCall,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let current = null; // { startedAt, lastActivityAt, announced, timer, name }

  function announce(call, { number, presentation }) {
    if (call.announced) return;
    call.announced = true;
    if (call.timer) {
      clearTimer(call.timer);
      call.timer = null;
    }
    onCall({
      number,
      presentation,
      name: call.name || null,
      at: new Date(call.startedAt).toISOString(),
    });
  }

  function activeCall() {
    const t = now();
    if (!current || t - current.lastActivityAt > CALL_GAP_MS) {
      if (current && current.timer) clearTimer(current.timer);
      current = { startedAt: t, lastActivityAt: t, announced: false, timer: null, name: null };
    }
    current.lastActivityAt = t;
    return current;
  }

  function feed(line) {
    const parsed = parseLine(line);
    if (!parsed) return;

    const call = activeCall();

    if (parsed.kind === 'ring') {
      // Pas encore de numéro : on attend un peu qu'il arrive, sinon on signale
      // l'appel sans numéro (mieux que rien : le personnel voit qu'un appel arrive).
      if (!call.announced && !call.timer) {
        call.timer = setTimer(() => {
          call.timer = null;
          announce(call, { number: null, presentation: 'unavailable' });
        }, WAIT_FOR_NUMBER_MS);
      }
      return;
    }

    if (parsed.key === 'NAME') {
      call.name = parsed.value || null;
      return;
    }

    if (parsed.key === 'NMBR') {
      announce(call, interpretNumber(parsed.value));
    }
  }

  return { feed };
}

module.exports = {
  parseLine,
  interpretNumber,
  createCallTracker,
  WAIT_FOR_NUMBER_MS,
  CALL_GAP_MS,
};
