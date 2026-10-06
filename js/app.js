/* Five Square — game logic and UI. Plain JS, no dependencies. */
(function (root) {
  'use strict';

  /* ===================== Pure core (also used by Node tests) ===================== */

  var WORD_LEN = 5;
  var MAX_GUESSES = 6;
  var GAME_NAME = 'Five Square';
  var EPOCH_UTC = Date.UTC(2026, 0, 1); // Puzzle #1 is 1 January 2026 (local calendar day)
  var SHUFFLE_SEED = 20260101;
  var RANK = { absent: 1, present: 2, correct: 3 };

  /**
   * Two-pass scoring: exact matches first, then "present" limited by the
   * number of each letter still unmatched in the answer.
   */
  function scoreGuess(guess, answer) {
    guess = String(guess).toLowerCase();
    answer = String(answer).toLowerCase();
    var n = answer.length;
    var result = new Array(n);
    var remaining = {};
    var i, ch;
    for (i = 0; i < n; i++) {
      if (guess[i] === answer[i]) {
        result[i] = 'correct';
      } else {
        ch = answer[i];
        remaining[ch] = (remaining[ch] || 0) + 1;
      }
    }
    for (i = 0; i < n; i++) {
      if (result[i]) continue;
      ch = guess[i];
      if (remaining[ch] > 0) {
        result[i] = 'present';
        remaining[ch]--;
      } else {
        result[i] = 'absent';
      }
    }
    return result;
  }

  /** Whole days between the epoch and the given date's LOCAL calendar day (DST-safe). */
  function dayIndex(date) {
    var d = date || new Date();
    var utcMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((utcMidnight - EPOCH_UTC) / 86400000);
  }

  function puzzleNumber(idx) { return idx + 1; }

  /** Small deterministic PRNG. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Fisher–Yates shuffle with a fixed seed; returns a new array. */
  function seededShuffle(list, seed) {
    var arr = list.slice();
    var rnd = mulberry32(seed);
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  var shuffledCache = null;
  var shuffledSource = null;
  function shuffledAnswers(answers) {
    if (shuffledSource !== answers) {
      shuffledCache = seededShuffle(answers, SHUFFLE_SEED);
      shuffledSource = answers;
    }
    return shuffledCache;
  }

  function answerForDay(idx, answers) {
    var list = shuffledAnswers(answers);
    var n = list.length;
    return list[((idx % n) + n) % n];
  }

  function dailyAnswer(date, answers) {
    return answerForDay(dayIndex(date), answers);
  }

  /** Merge evaluations into a key-state map, keeping the best colour seen. */
  function mergeKeyStates(map, guess, evals) {
    for (var i = 0; i < guess.length; i++) {
      var ch = guess[i];
      var st = evals[i];
      if (!map[ch] || RANK[st] > RANK[map[ch]]) map[ch] = st;
    }
    return map;
  }

  function emojiFor(state, opts) {
    opts = opts || {};
    if (state === 'correct') return opts.contrast ? '\uD83D\uDFE7' : '\uD83D\uDFE9'; // 🟧 / 🟩
    if (state === 'present') return opts.contrast ? '\uD83D\uDFE6' : '\uD83D\uDFE8'; // 🟦 / 🟨
    return opts.dark ? '\u2B1B' : '\u2B1C'; // ⬛ / ⬜
  }

  /**
   * Build share text, e.g. "Five Square 123 4/6\n\n🟩⬛..."
   * label: puzzle number (daily) or "Practice".
   */
  function buildShareText(label, guesses, answer, won, opts) {
    var score = won ? guesses.length : 'X';
    var lines = [GAME_NAME + ' ' + label + ' ' + score + '/' + MAX_GUESSES, ''];
    for (var i = 0; i < guesses.length; i++) {
      var ev = scoreGuess(guesses[i], answer);
      lines.push(ev.map(function (s) { return emojiFor(s, opts); }).join(''));
    }
    return lines.join('\n');
  }

  function msUntilNextLocalMidnight(now) {
    var d = now || new Date();
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - d.getTime();
  }

  function formatCountdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return p(h) + ':' + p(m) + ':' + p(sec);
  }

  var core = {
    WORD_LEN: WORD_LEN, MAX_GUESSES: MAX_GUESSES, GAME_NAME: GAME_NAME,
    EPOCH_UTC: EPOCH_UTC, SHUFFLE_SEED: SHUFFLE_SEED,
    scoreGuess: scoreGuess, dayIndex: dayIndex, puzzleNumber: puzzleNumber,
    mulberry32: mulberry32, seededShuffle: seededShuffle,
    answerForDay: answerForDay, dailyAnswer: dailyAnswer,
    mergeKeyStates: mergeKeyStates, emojiFor: emojiFor, buildShareText: buildShareText,
    msUntilNextLocalMidnight: msUntilNextLocalMidnight, formatCountdown: formatCountdown
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = core;
  }
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  /* ===================== Browser UI ===================== */

  var WORDS = root.FS_WORDS || { ANSWERS: [], VALID: [] };
  var ANSWERS = WORDS.ANSWERS;
  var VALID_SET = new Set(WORDS.VALID);
  ANSWERS.forEach(function (w) { VALID_SET.add(w); });

  var KEYS = {
    settings: 'fs-settings', daily: 'fs-daily', practice: 'fs-practice',
    stats: 'fs-stats', pstats: 'fs-practice-stats', mode: 'fs-mode', seenHelp: 'fs-seen-help'
  };

  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode / quota */ }
  }

  var $ = function (id) { return document.getElementById(id); };
  var reducedMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function reducedMotion() { return !!(reducedMotionMQ && reducedMotionMQ.matches); }

  var FLIP_MS = 500;      // full flip per tile
  var STAGGER_MS = 280;   // delay between tiles

  var settings = Object.assign({ dark: null, contrast: false }, load(KEYS.settings, {}));
  var stats = Object.assign({
    played: 0, won: 0, cur: 0, max: 0, dist: [0, 0, 0, 0, 0, 0],
    lastWinDay: null, lastResult: null
  }, load(KEYS.stats, {}));
  var pstats = Object.assign({ played: 0, won: 0 }, load(KEYS.pstats, {}));

  var mode = load(KEYS.mode, 'daily') === 'practice' ? 'practice' : 'daily';
  var daily = null;
  var practice = null;
  var typed = '';
  var busy = false;
  var skipArmedUntil = 0;
  var tiles = [];   // tiles[row][col]
  var rows = [];
  var keyEls = {};

  /* ---------- Settings / theme ---------- */

  function effectiveDark() {
    return typeof settings.dark === 'boolean' ? settings.dark : !!(darkMQ && darkMQ.matches);
  }
  function applyTheme() {
    var c = document.documentElement.classList;
    var dark = effectiveDark();
    c.toggle('dark', dark);
    c.toggle('contrast', !!settings.contrast);
    $('sw-dark').setAttribute('aria-checked', String(dark));
    $('sw-contrast').setAttribute('aria-checked', String(!!settings.contrast));
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute('content', dark ? '#121213' : '#ffffff');
      metas[i].removeAttribute('media');
    }
  }
  if (darkMQ) {
    var onScheme = function () { if (typeof settings.dark !== 'boolean') applyTheme(); };
    if (darkMQ.addEventListener) darkMQ.addEventListener('change', onScheme);
    else if (darkMQ.addListener) darkMQ.addListener(onScheme);
  }

  /* ---------- Game state ---------- */

  function sanitizeGuesses(g) {
    return Array.isArray(g) ? g.filter(function (w) {
      return typeof w === 'string' && /^[a-z]{5}$/.test(w);
    }).slice(0, MAX_GUESSES) : [];
  }

  function statusFor(guesses, answer) {
    if (guesses.length && guesses[guesses.length - 1] === answer) return 'won';
    if (guesses.length >= MAX_GUESSES) return 'lost';
    return 'playing';
  }

  function loadDaily() {
    var today = dayIndex(new Date());
    var answer = answerForDay(today, ANSWERS);
    var saved = load(KEYS.daily, null);
    var g = (saved && saved.day === today) ? sanitizeGuesses(saved.guesses) : [];
    daily = {
      kind: 'daily', day: today, answer: answer, guesses: g,
      status: statusFor(g, answer),
      counted: !!(saved && saved.day === today && saved.counted)
    };
    // If a finished game somehow wasn't counted (e.g. closed mid-save), count it now.
    if (daily.status !== 'playing' && !daily.counted) recordDailyResult();
    saveDaily();
  }
  function saveDaily() {
    save(KEYS.daily, { day: daily.day, guesses: daily.guesses, status: daily.status, counted: daily.counted });
  }

  function randomPracticeAnswer() {
    var avoid = daily ? daily.answer : '';
    var w;
    do { w = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]; } while (w === avoid && ANSWERS.length > 1);
    return w;
  }
  function loadPractice() {
    var saved = load(KEYS.practice, null);
    if (saved && typeof saved.answer === 'string' && ANSWERS.indexOf(saved.answer) !== -1) {
      var g = sanitizeGuesses(saved.guesses);
      practice = { kind: 'practice', answer: saved.answer, guesses: g, status: statusFor(g, saved.answer), counted: !!saved.counted };
    } else {
      newPractice(true);
    }
  }
  function newPractice(silent) {
    practice = { kind: 'practice', answer: randomPracticeAnswer(), guesses: [], status: 'playing', counted: false };
    savePractice();
    if (!silent) {
      typed = '';
      render();
    }
  }
  function savePractice() {
    save(KEYS.practice, { answer: practice.answer, guesses: practice.guesses, counted: practice.counted });
  }

  function game() { return mode === 'daily' ? daily : practice; }
  function saveGame(g) { if (g.kind === 'daily') saveDaily(); else savePractice(); }

  /* ---------- Stats ---------- */

  function refreshStreak() {
    var today = dayIndex(new Date());
    if (stats.lastWinDay === null || (stats.lastWinDay !== today && stats.lastWinDay !== today - 1)) {
      if (stats.cur !== 0) { stats.cur = 0; save(KEYS.stats, stats); }
    }
  }

  function recordDailyResult() {
    if (daily.counted) return;
    var won = daily.status === 'won';
    stats.played++;
    if (won) {
      stats.won++;
      stats.dist[daily.guesses.length - 1]++;
      stats.cur = (stats.lastWinDay === daily.day - 1) ? stats.cur + 1 : 1;
      stats.max = Math.max(stats.max, stats.cur);
      stats.lastWinDay = daily.day;
    } else {
      stats.cur = 0;
    }
    stats.lastResult = { day: daily.day, won: won, n: daily.guesses.length };
    daily.counted = true;
    save(KEYS.stats, stats);
  }

  function recordPracticeResult() {
    if (practice.counted) return;
    pstats.played++;
    if (practice.status === 'won') pstats.won++;
    practice.counted = true;
    save(KEYS.pstats, pstats);
  }

  /* ---------- Build DOM ---------- */

  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    tiles = []; rows = [];
    for (var r = 0; r < MAX_GUESSES; r++) {
      var row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      row.setAttribute('aria-label', 'Guess ' + (r + 1));
      var rowTiles = [];
      for (var c = 0; c < WORD_LEN; c++) {
        var t = document.createElement('div');
        t.className = 'tile';
        t.setAttribute('role', 'gridcell');
        row.appendChild(t);
        rowTiles.push(t);
      }
      board.appendChild(row);
      rows.push(row);
      tiles.push(rowTiles);
    }
  }

  var BACKSPACE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>';

  function buildKeyboard() {
    var layout = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
    var kb = $('keyboard');
    kb.innerHTML = '';
    layout.forEach(function (line, idx) {
      var row = document.createElement('div');
      row.className = 'kb-row';
      if (idx === 1) row.appendChild(spacer());
      line.split('').forEach(function (ch) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        if (ch === '+') {
          b.className += ' wide';
          b.textContent = 'Enter';
          b.dataset.key = 'Enter';
          b.setAttribute('aria-label', 'Enter');
        } else if (ch === '-') {
          b.className += ' wide';
          b.innerHTML = BACKSPACE_SVG;
          b.dataset.key = 'Backspace';
          b.setAttribute('aria-label', 'Backspace');
        } else {
          b.textContent = ch;
          b.dataset.key = ch;
          b.setAttribute('aria-label', ch.toUpperCase());
          keyEls[ch] = b;
        }
        row.appendChild(b);
      });
      if (idx === 1) row.appendChild(spacer());
      kb.appendChild(row);
    });
    function spacer() { var s = document.createElement('div'); s.className = 'kb-spacer'; return s; }

    // Keep focus off keys so physical Enter doesn't also "click" a focused key.
    kb.addEventListener('mousedown', function (e) { if (e.target.closest('.key')) e.preventDefault(); });
    kb.addEventListener('click', function (e) {
      var b = e.target.closest('.key');
      if (!b) return;
      handleKey(b.dataset.key);
    });
  }

  /* ---------- Rendering ---------- */

  var STATE_WORD = { correct: 'correct', present: 'in the word, wrong spot', absent: 'not in the word' };

  function setTile(r, c, letter, state) {
    var t = tiles[r][c];
    t.textContent = letter ? letter.toUpperCase() : '';
    t.dataset.state = state || (letter ? 'filled' : 'empty');
    var label = 'Row ' + (r + 1) + ', letter ' + (c + 1) + ': ';
    if (!letter) label += 'empty';
    else label += letter.toUpperCase() + (state && STATE_WORD[state] ? ', ' + STATE_WORD[state] : '');
    t.setAttribute('aria-label', label);
  }

  function renderKeys(g) {
    var map = {};
    g.guesses.forEach(function (w) { mergeKeyStates(map, w, scoreGuess(w, g.answer)); });
    Object.keys(keyEls).forEach(function (ch) {
      var st = map[ch];
      var el = keyEls[ch];
      if (st) el.dataset.state = st; else delete el.dataset.state;
      el.setAttribute('aria-label', ch.toUpperCase() + (st ? ', ' + STATE_WORD[st] : ''));
    });
  }

  function render() {
    var g = game();
    for (var r = 0; r < MAX_GUESSES; r++) {
      rows[r].classList.remove('shake');
      var word = r < g.guesses.length ? g.guesses[r] : (r === g.guesses.length && g.status === 'playing' ? typed : '');
      var evals = r < g.guesses.length ? scoreGuess(word, g.answer) : null;
      for (var c = 0; c < WORD_LEN; c++) {
        tiles[r][c].className = 'tile';
        setTile(r, c, word[c] || '', evals ? evals[c] : null);
      }
    }
    renderKeys(g);
    renderModeBar();
  }

  function renderModeBar() {
    var isDaily = mode === 'daily';
    $('tab-daily').classList.toggle('active', isDaily);
    $('tab-practice').classList.toggle('active', !isDaily);
    $('tab-daily').setAttribute('aria-selected', String(isDaily));
    $('tab-practice').setAttribute('aria-selected', String(!isDaily));
    $('daily-num').textContent = '#' + puzzleNumber(daily.day);
    var g = game();
    var done = g.status !== 'playing';
    $('btn-new').classList.toggle('hidden', isDaily);
    $('btn-share-inline').classList.toggle('hidden', !done || busy);
  }

  /* ---------- Toasts / announcements ---------- */

  function toast(msg, ms) {
    var box = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    box.insertBefore(el, box.firstChild);
    while (box.children.length > 3) box.removeChild(box.lastChild);
    if (ms !== Infinity) {
      setTimeout(function () {
        el.classList.add('fade');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
      }, ms || 1500);
    }
    return el;
  }
  function announce(msg) {
    var live = $('sr-live');
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 50);
  }

  /* ---------- Input ---------- */

  function anyModalOpen() {
    return !!document.querySelector('.modal:not([hidden])');
  }

  function handleKey(key) {
    if (busy || anyModalOpen()) return;
    var g = game();
    if (g.status !== 'playing') return;
    if (key === 'Enter') return submit();
    if (key === 'Backspace') {
      if (!typed.length) return;
      typed = typed.slice(0, -1);
      var r = g.guesses.length;
      setTile(r, typed.length, '', null);
      return;
    }
    if (/^[a-z]$/.test(key) && typed.length < WORD_LEN) {
      var row = g.guesses.length;
      var col = typed.length;
      typed += key;
      setTile(row, col, key, null);
      if (!reducedMotion()) {
        var t = tiles[row][col];
        t.classList.remove('pop');
        void t.offsetWidth; // restart animation
        t.classList.add('pop');
      }
    }
  }

  function shakeRow(r) {
    var row = rows[r];
    if (reducedMotion()) return;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    setTimeout(function () { row.classList.remove('shake'); }, 650);
  }

  var PRAISE = ['Genius!', 'Magnificent!', 'Brilliant!', 'Splendid!', 'Great!', 'Phew!'];

  function submit() {
    var g = game();
    var r = g.guesses.length;
    if (typed.length < WORD_LEN) {
      shakeRow(r);
      toast('Not enough letters');
      return;
    }
    if (!VALID_SET.has(typed)) {
      shakeRow(r);
      toast('Not in word list');
      return;
    }
    var guess = typed;
    var evals = scoreGuess(guess, g.answer);
    g.guesses.push(guess);
    g.status = statusFor(g.guesses, g.answer);
    typed = '';
    // Persist (and count stats) immediately, so a reload mid-animation is safe.
    if (g.status !== 'playing') {
      if (g.kind === 'daily') recordDailyResult(); else recordPracticeResult();
    }
    saveGame(g);

    busy = true;
    revealRow(r, guess, evals, function () {
      busy = false;
      renderKeys(g);
      announce(guess.toUpperCase() + ': ' + evals.map(function (s, i) {
        return guess[i].toUpperCase() + ' ' + STATE_WORD[s];
      }).join(', '));
      if (g.status === 'won') {
        bounceRow(r);
        toast(PRAISE[r] || 'Well done!', 2000);
        afterGameEnd(g, 1700);
      } else if (g.status === 'lost') {
        toast('The word was ' + g.answer.toUpperCase(), g.kind === 'daily' ? 3500 : 4000);
        afterGameEnd(g, 1800);
      }
      renderModeBar();
    });
  }

  function afterGameEnd(g, delay) {
    if (g.kind === 'daily') {
      setTimeout(function () { if (mode === 'daily' && !anyModalOpen()) openStats(); }, reducedMotion() ? 600 : delay);
    } else {
      var nb = $('btn-new');
      nb.classList.remove('pulse');
      void nb.offsetWidth;
      nb.classList.add('pulse');
    }
  }

  function revealRow(r, guess, evals, done) {
    if (reducedMotion()) {
      for (var c = 0; c < WORD_LEN; c++) setTile(r, c, guess[c], evals[c]);
      setTimeout(done, 50);
      return;
    }
    evals.forEach(function (st, c) {
      var t = tiles[r][c];
      setTimeout(function () {
        t.classList.remove('pop', 'flip-out');
        t.classList.add('flip-in');
        setTimeout(function () {
          setTile(r, c, guess[c], st);
          t.classList.remove('flip-in');
          t.classList.add('flip-out');
        }, FLIP_MS / 2);
      }, c * STAGGER_MS);
    });
    setTimeout(function () {
      tiles[r].forEach(function (t) { t.classList.remove('flip-out'); });
      done();
    }, (WORD_LEN - 1) * STAGGER_MS + FLIP_MS + 30);
  }

  function bounceRow(r) {
    if (reducedMotion()) return;
    tiles[r].forEach(function (t, c) {
      setTimeout(function () {
        t.classList.add('bounce');
        setTimeout(function () { t.classList.remove('bounce'); }, 950);
      }, c * 100);
    });
  }

  /* ---------- Modals ---------- */

  var lastFocus = null;
  function openModal(id) {
    closeModals();
    lastFocus = document.activeElement;
    var m = $(id);
    m.hidden = false;
    var close = m.querySelector('[data-close]');
    if (close) close.focus({ preventScroll: true });
  }
  function closeModals() {
    var open = document.querySelectorAll('.modal:not([hidden])');
    for (var i = 0; i < open.length; i++) open[i].hidden = true;
    if (open.length && lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  function openStats() {
    renderStats();
    openModal('modal-stats');
  }

  function renderStats() {
    refreshStreak();
    $('st-played').textContent = stats.played;
    $('st-win').textContent = stats.played ? Math.round(100 * stats.won / stats.played) : 0;
    $('st-cur').textContent = stats.cur;
    $('st-max').textContent = stats.max;

    var dist = $('dist');
    dist.innerHTML = '';
    var maxCount = Math.max.apply(null, stats.dist.concat([1]));
    var hl = stats.lastResult && stats.lastResult.won ? stats.lastResult.n : 0;
    for (var i = 0; i < MAX_GUESSES; i++) {
      var row = document.createElement('div');
      row.className = 'dist-row';
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(i + 1);
      var bar = document.createElement('span');
      bar.className = 'dist-bar' + (hl === i + 1 ? ' hl' : '');
      bar.style.width = Math.max(7, Math.round(100 * stats.dist[i] / maxCount)) + '%';
      bar.textContent = stats.dist[i];
      row.setAttribute('aria-label', (i + 1) + ' guess' + (i ? 'es' : '') + ': ' + stats.dist[i] + (hl === i + 1 ? ' (latest win)' : ''));
      row.appendChild(n);
      row.appendChild(bar);
      dist.appendChild(row);
    }

    $('practice-tally').textContent = 'Practice (not counted above): ' + pstats.played + ' played, ' + pstats.won + ' won' +
      (pstats.played ? ' (' + Math.round(100 * pstats.won / pstats.played) + '%)' : '');

    var g = game();
    var done = g.status !== 'playing';
    var line = $('result-line');
    if (done) {
      var what = g.kind === 'daily' ? 'Daily #' + puzzleNumber(g.day) : 'Practice';
      line.textContent = g.status === 'won'
        ? what + ': solved in ' + g.guesses.length + '/' + MAX_GUESSES
        : what + ': the word was ' + g.answer.toUpperCase();
      line.hidden = false;
    } else {
      line.hidden = true;
    }
    $('btn-share').hidden = !done;
    $('countdown-box').hidden = daily.status === 'playing';
    updateCountdown();
  }

  function updateCountdown() {
    var el = $('countdown');
    if (el) el.textContent = formatCountdown(msUntilNextLocalMidnight(new Date()));
  }

  /* ---------- Share ---------- */

  function shareResult() {
    var g = game();
    if (g.status === 'playing') return;
    var label = g.kind === 'daily' ? String(puzzleNumber(g.day)) : 'Practice';
    var text = buildShareText(label, g.guesses, g.answer, g.status === 'won',
      { dark: effectiveDark(), contrast: !!settings.contrast });
    if (navigator.share && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
      navigator.share({ text: text }).catch(function (err) {
        if (!err || err.name !== 'AbortError') copyText(text);
      });
    } else {
      copyText(text);
    }
  }

  function copyText(text) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        toast(ok ? 'Copied' : 'Could not copy');
      } catch (e) { toast('Could not copy'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- Mode switching / day rollover ---------- */

  function setMode(m) {
    if (busy || m === mode) return;
    mode = m;
    save(KEYS.mode, mode);
    typed = '';
    render();
  }

  function checkDayRollover() {
    if (busy) return;
    var today = dayIndex(new Date());
    if (daily && daily.day !== today) {
      loadDaily();
      refreshStreak();
      if (mode === 'daily') {
        typed = '';
        render();
        closeModals();
      } else {
        renderModeBar();
      }
      toast('A new daily word is ready');
    }
  }

  /* ---------- Layout: size the board to the available space ---------- */

  function fitBoard() {
    var wrap = $('board-wrap');
    var gap = 5;
    var h = wrap.clientHeight - 8;
    var w = Math.min(wrap.clientWidth - 20, 420);
    var size = Math.floor(Math.min((h - gap * (MAX_GUESSES - 1)) / MAX_GUESSES, (w - gap * (WORD_LEN - 1)) / WORD_LEN, 64));
    size = Math.max(26, size);
    document.documentElement.style.setProperty('--tile', size + 'px');
  }

  /* ---------- Init ---------- */

  function init() {
    buildBoard();
    buildKeyboard();
    applyTheme();
    loadDaily();
    loadPractice();
    refreshStreak();
    render();
    fitBoard();

    if (window.ResizeObserver) new ResizeObserver(fitBoard).observe($('board-wrap'));
    window.addEventListener('resize', fitBoard);
    window.addEventListener('orientationchange', function () { setTimeout(fitBoard, 200); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && anyModalOpen()) { closeModals(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (anyModalOpen()) return;
      var k = e.key;
      if (k === 'Enter' || k === 'Backspace') {
        e.preventDefault();
        handleKey(k);
      } else if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault();
        handleKey(k.toLowerCase());
      }
    });

    $('btn-help').addEventListener('click', function () { openModal('modal-help'); });
    $('btn-stats').addEventListener('click', openStats);
    $('btn-settings').addEventListener('click', function () { applyTheme(); openModal('modal-settings'); });
    $('btn-share').addEventListener('click', shareResult);
    $('btn-share-inline').addEventListener('click', shareResult);
    $('tab-daily').addEventListener('click', function () { setMode('daily'); });
    $('tab-practice').addEventListener('click', function () { setMode('practice'); });
    $('btn-new').addEventListener('click', function () {
      if (busy) return;
      if (practice.status === 'playing' && practice.guesses.length > 0 && Date.now() > skipArmedUntil) {
        skipArmedUntil = Date.now() + 3000;
        toast('Tap again to skip this word');
        return;
      }
      skipArmedUntil = 0;
      if (practice.status === 'playing' && practice.guesses.length > 0) {
        toast('The word was ' + practice.answer.toUpperCase(), 2500);
      }
      $('btn-new').classList.remove('pulse');
      newPractice(false);
    });

    var modals = document.querySelectorAll('.modal');
    for (var i = 0; i < modals.length; i++) {
      modals[i].addEventListener('click', function (e) {
        if (e.target === e.currentTarget || e.target.closest('[data-close]')) closeModals();
      });
    }

    $('sw-dark').addEventListener('click', function () {
      settings.dark = !effectiveDark();
      save(KEYS.settings, settings);
      applyTheme();
    });
    $('sw-contrast').addEventListener('click', function () {
      settings.contrast = !settings.contrast;
      save(KEYS.settings, settings);
      applyTheme();
    });
    $('btn-theme-auto').addEventListener('click', function () {
      settings.dark = null;
      save(KEYS.settings, settings);
      applyTheme();
      toast('Theme follows your device');
    });

    setInterval(function () {
      if (!$('modal-stats').hidden) updateCountdown();
      checkDayRollover();
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checkDayRollover();
    });

    if (!load(KEYS.seenHelp, false)) {
      save(KEYS.seenHelp, true);
      openModal('modal-help');
    } else if (mode === 'daily' && daily.status !== 'playing') {
      setTimeout(openStats, 300);
    }

    registerServiceWorker();
  }

  function registerServiceWorker() {
    try {
      if (!('serviceWorker' in navigator)) return;
      var proto = location.protocol;
      var host = location.hostname;
      var secure = proto === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      if (!secure || proto === 'file:') return;
      var doRegister = function () {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () { /* offline cache unavailable */ });
      };
      if (document.readyState === 'complete') doRegister();
      else window.addEventListener('load', doRegister);
    } catch (e) { /* ignore: e.g. file:// or sandboxed contexts */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof self !== 'undefined' ? self : this);
