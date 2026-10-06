# Five Square

An original, offline-first word game for phones: guess the hidden five-letter word in six tries.
Plain HTML/CSS/JS. No framework, no build step, no CDN, no network calls.

## Features
- **Daily**: one word per local calendar day, the same for everyone. The word comes from the
  number of days since 1 January 2026 (puzzle #1), used as an index into the answer list after a
  fixed-seed shuffle (mulberry32 + Fisher–Yates, seed `20260101`). Progress survives reloads.
  When you finish, you see your result and a countdown to the next word (local midnight).
- **Practice**: unlimited random words with a **New word** button. Practice has its own small
  tally and never touches your daily stats or streak.
- Fair colouring for repeated letters (two passes: exact matches first, then "in the word" limited
  by how many of that letter are left).
- On-screen QWERTY keyboard that keeps the best colour seen for each key (green > yellow > grey),
  plus physical keyboard support (letters, Enter, Backspace).
- Checks guesses against a word list. An invalid word shakes the row and shows "Not in word list".
- Stats (stored in `localStorage`): played, win %, current and max streak, and a guess
  distribution chart with your latest win highlighted. Stats open on their own when a daily game ends.
- Share: e.g. `Five Square 279 4/6` plus an emoji grid (⬛ in dark mode, ⬜ in light, 🟧🟦 in high
  contrast). Uses the phone's share sheet when it can, otherwise copies to the clipboard.
- Settings: dark mode (follows the phone until you change it; "Auto" resets that) and high
  contrast (orange/blue). Both are saved.
- Animations: a pop as you type, a staggered 3D flip on reveal, a shake for invalid words and a
  bounce when you win. All of these are off when the phone's Reduce Motion setting is on.
- Layout fits portrait phones from iPhone SE to Pro Max with no scrolling (`100dvh`, safe-area
  insets, board resized to the space left, keys at least 44 px tall, `touch-action: manipulation`).
- Accessibility: aria-labels on tiles and keys (including colour state), an aria-live region for
  toasts, and spoken guess results.

## Files
```
index.html           app shell (viewport-fit=cover, PWA/apple meta tags)
css/style.css        styles, themes, animations
js/words.js          ANSWERS (2,200) and VALID (11,434) word lists
js/app.js            game logic + UI (pure core functions are exported for Node tests)
sw.js                service worker: versioned cache-first precache of every app file
manifest.json        web app manifest (standalone, portrait, maskable icon)
icons/               192, 512, maskable 512, 180 apple-touch-icon, 32 favicon (PNG)
tests/core.test.js   Node tests for scoring, daily index, word lists and share text
```

## Running locally
```
python3 -m http.server 8772 --directory wordle-phone
# open http://127.0.0.1:8772/
node wordle-phone/tests/core.test.js
```
Opening `index.html` straight from disk (file://) also works for play, but the service worker
(the offline cache) only registers over `https://` or on `localhost`/`127.0.0.1`.

## Installing on a phone
Service workers, and so true offline install, need a **secure origin (HTTPS)**. A phone
reaching this box over plain `http://<LAN-IP>` will run the game, but it won't cache it for offline use.
To install, serve the folder from any HTTPS static host or HTTPS local server you control, then:
- **iPhone (Safari)**: Share → *Add to Home Screen*.
- **Android (Chrome)**: menu → *Install app* / *Add to Home screen*.
After the first load it works fully offline.

To ship an update, change `CACHE_VERSION` in `sw.js`. Old caches are deleted when the new worker activates.

## Word lists
Built from the Debian `wbritish`/`wamerican` dictionaries (small, large and huge), keeping words of
exactly five lowercase a–z letters (which drops proper nouns and abbreviations) and removing
duplicates, Roman numerals and offensive words.
- `VALID` (11,434): the union of those lists, with British spellings such as odour, metre, litre,
  fibre, sabre, ochre, mould, mitre and tyres.
- `ANSWERS` (2,200): taken from the common-word (small) dictionaries and ranked by everyday
  frequency (the `wordfreq` package, used only at build time). Plurals and inflections (-s, -ed,
  -ing, comparatives), US-only spellings (color, favor…), names, slang and sensitive words were
  removed. `ANSWERS` is a subset of `VALID`.

## Data stored on the device
`localStorage` keys: `fs-settings`, `fs-daily`, `fs-practice`, `fs-stats`, `fs-practice-stats`,
`fs-mode`, `fs-seen-help`. Nothing leaves the device.

"Five Square" is an original name and implementation. It isn't affiliated with any other word game.
