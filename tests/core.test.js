/* Run with: node tests/core.test.js */
'use strict';
const assert = require('assert');
const path = require('path');
const core = require(path.join(__dirname, '..', 'js', 'app.js'));
const { ANSWERS, VALID } = require(path.join(__dirname, '..', 'js', 'words.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const C = 'correct', P = 'present', A = 'absent';

console.log('Scoring (TZ=' + (process.env.TZ || 'system') + ')');
const cases = [
  ['abbey', 'babes', [P, P, C, C, A]],
  ['crane', 'eerie', [A, A, P, A, C]],
  ['abbey', 'kebab', [A, P, C, P, P]],
  ['those', 'geese', [A, A, A, C, C]],
  ['array', 'radar', [P, P, A, C, P]],
  ['robot', 'books', [P, C, P, A, A]],
  ['speed', 'abide', [A, A, A, P, P]],
  ['elder', 'eerie', [C, P, P, A, A]],
  ['lever', 'eerie', [P, C, P, A, A]],
  ['crane', 'crane', [C, C, C, C, C]],
  ['tight', 'motto', [A, A, P, P, A]],
  ['ample', 'eerie', [A, A, A, A, C]],
];
for (const [answer, guess, expected] of cases) {
  test(`answer ${answer} / guess ${guess} -> ${expected.join(',')}`, () => {
    assert.deepStrictEqual(core.scoreGuess(guess, answer), expected);
  });
}
test('scoring is case-insensitive', () => {
  assert.deepStrictEqual(core.scoreGuess('BABES', 'Abbey'), [P, P, C, C, A]);
});

console.log('Keyboard best-colour merge');
test('green beats yellow beats grey, never downgrades', () => {
  const m = {};
  core.mergeKeyStates(m, 'babes', core.scoreGuess('babes', 'abbey')); // b present+correct
  assert.strictEqual(m.b, C);
  assert.strictEqual(m.a, P);
  assert.strictEqual(m.s, A);
  core.mergeKeyStates(m, 'abbey', core.scoreGuess('abbey', 'zzzzz'));
  assert.strictEqual(m.a, P);
  core.mergeKeyStates(m, 'aaaaa', core.scoreGuess('aaaaa', 'abbey'));
  assert.strictEqual(m.a, C);
});

console.log('Daily answer');
test('epoch day (1 Jan 2026 local) is index 0 / puzzle #1', () => {
  assert.strictEqual(core.dayIndex(new Date(2026, 0, 1, 0, 0, 1)), 0);
  assert.strictEqual(core.dayIndex(new Date(2026, 0, 1, 23, 59, 59)), 0);
  assert.strictEqual(core.puzzleNumber(core.dayIndex(new Date(2026, 0, 2))), 2);
});
test('same local day -> same index & answer at any time of day', () => {
  const a = new Date(2026, 9, 6, 0, 0, 1), b = new Date(2026, 9, 6, 23, 59, 59);
  assert.strictEqual(core.dayIndex(a), core.dayIndex(b));
  assert.strictEqual(core.dailyAnswer(a, ANSWERS), core.dailyAnswer(b, ANSWERS));
});
test('DST transitions advance by exactly one day', () => {
  for (const [y, m, d] of [[2026, 2, 28], [2026, 2, 29], [2026, 9, 24], [2026, 9, 25], [2026, 2, 7], [2026, 10, 1]]) {
    assert.strictEqual(core.dayIndex(new Date(y, m, d + 1, 12)) - core.dayIndex(new Date(y, m, d, 12)), 1);
  }
});
test('daily answer for 6 Oct 2026 is stable (fresh shuffle each time)', () => {
  const idx = core.dayIndex(new Date(2026, 9, 6, 12));
  assert.strictEqual(idx, 278);
  const s1 = core.seededShuffle(ANSWERS, core.SHUFFLE_SEED);
  const s2 = core.seededShuffle(ANSWERS, core.SHUFFLE_SEED);
  assert.deepStrictEqual(s1, s2);
  assert.strictEqual(core.answerForDay(idx, ANSWERS), s1[idx]);
  console.log('       (puzzle #' + core.puzzleNumber(idx) + ' answer: ' + s1[idx] + ')');
});
test('shuffle is a permutation; one full cycle has no repeats', () => {
  const seen = new Set();
  for (let i = 0; i < ANSWERS.length; i++) seen.add(core.answerForDay(i, ANSWERS));
  assert.strictEqual(seen.size, ANSWERS.length);
  assert.strictEqual(core.answerForDay(ANSWERS.length, ANSWERS), core.answerForDay(0, ANSWERS));
  assert.strictEqual(core.answerForDay(-1, ANSWERS), core.answerForDay(ANSWERS.length - 1, ANSWERS));
});

console.log('Word lists');
const validSet = new Set(VALID);
test(`ANSWERS has >= 1500 words (${ANSWERS.length})`, () => assert.ok(ANSWERS.length >= 1500));
test(`VALID has >= 8000 words (${VALID.length})`, () => assert.ok(VALID.length >= 8000));
test('every word is exactly 5 lowercase a-z letters', () => {
  const bad = ANSWERS.concat(VALID).filter(w => !/^[a-z]{5}$/.test(w));
  assert.deepStrictEqual(bad, []);
});
test('no duplicates in either list', () => {
  assert.strictEqual(new Set(ANSWERS).size, ANSWERS.length);
  assert.strictEqual(validSet.size, VALID.length);
});
test('ANSWERS is a subset of VALID', () => {
  assert.deepStrictEqual(ANSWERS.filter(w => !validSet.has(w)), []);
});
test('British spellings accepted', () => {
  for (const w of ['odour', 'metre', 'litre', 'fibre', 'sabre', 'ochre', 'mould', 'tyres', 'mitre']) assert.ok(validSet.has(w), w);
});
test('sample offensive words excluded', () => {
  for (const w of ['bitch', 'whore', 'pussy', 'dildo', 'squaw', 'kikes', 'chink', 'dykes', 'spick']) {
    assert.ok(!validSet.has(w) && !ANSWERS.includes(w), w);
  }
});

console.log('Share text');
test('daily share text format, dark mode', () => {
  const t = core.buildShareText('123', ['crane', 'abbey'], 'abbey', true, { dark: true, contrast: false });
  assert.strictEqual(t, 'Five Square 123 2/6\n\n\u2B1B\u2B1B\uD83D\uDFE8\u2B1B\uD83D\uDFE8\n\uD83D\uDFE9\uD83D\uDFE9\uD83D\uDFE9\uD83D\uDFE9\uD83D\uDFE9');
});
test('loss shows X/6; light mode ⬜; high contrast 🟧🟦', () => {
  const g = ['babes', 'babes', 'babes', 'babes', 'babes', 'babes'];
  const t = core.buildShareText('Practice', g, 'abbey', false, { dark: false, contrast: true });
  const lines = t.split('\n');
  assert.strictEqual(lines[0], 'Five Square Practice X/6');
  assert.strictEqual(lines.length, 8);
  assert.strictEqual(lines[2], '\uD83D\uDFE6\uD83D\uDFE6\uD83D\uDFE7\uD83D\uDFE7\u2B1C');
});
test('countdown formatting', () => {
  assert.strictEqual(core.formatCountdown(3723000), '01:02:03');
  const ms = core.msUntilNextLocalMidnight(new Date(2026, 9, 6, 23, 0, 0));
  assert.strictEqual(ms, 3600000);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
