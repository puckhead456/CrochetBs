# Stitchkeeper (CrochetBs) — Technical Spec

A crochet row/round + stitch counter PWA. Plain HTML/CSS/JS, **no build step, no ES modules, no frameworks**.
Hosted on GitHub Pages at `https://puckhead456.github.io/CrochetBs/` (so all paths must be **relative**: `./css/app.css`, never `/css/app.css`).
Works on iPhone Safari, Android Chrome, and desktop. Installable as a PWA ("Add to Home Screen"). Works offline.

Every JS file attaches ONE global object to `window` (e.g. `window.Patterns`, `window.Celebrate`, `window.Themes`, `window.Store`, `window.App`). Script tags load in order in `index.html`. Use `'use strict'` inside an IIFE.

## File layout

```
index.html                  # single page, all screens/modals as sections
manifest.webmanifest
sw.js                       # service worker, cache-first for app shell + fonts
css/app.css                 # layout + components, uses ONLY the CSS variables below
css/themes.css              # the 6 themes: each sets the CSS variables on html[data-theme="..."]
js/themes.js                # window.Themes = metadata list (id, name, group, tagline, swatches, emoji, fonts)
js/patterns.js              # window.Patterns = pattern text parser (pure functions)
js/celebrate.js             # window.Celebrate = themed finish animations
js/audio.js                 # window.Feedback = haptics + synthesized tap sounds
js/store.js                 # window.Store = state, persistence (localStorage), undo, export/import
js/app.js                   # window.App = rendering + event handling (the UI)
icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png, icons/icon.svg
```

## Data model (localStorage key `stitchkeeper.v1`)

```js
State = {
  version: 1,
  settings: {
    theme: 'stardew-spring',        // one of the 6 theme ids
    haptics: true,
    sounds: true,
    keepAwake: false,               // screen wake lock preference
    autoAdvance: true,              // when a row's stitch target is hit, auto-complete the row
  },
  projects: Project[],
  activeProjectId: string|null,
}

Project = {
  id: string,                       // random id
  name: string,
  emoji: string,                    // e.g. '🐑' '🐉' '🧶'; user pickable from a small grid
  status: 'active'|'paused'|'finished'|'frogged',
  createdAt: number, updatedAt: number, finishedAt: number|null,
  countMode: 'rows'|'rounds',       // label only; both count identically
  groupSize: number,                // stitch group size, default 10, min 1
  notes: string,                    // project-wide notes (hook, yarn, pattern link)
  timer: { totalMs: number, runningSince: number|null },
  parts: Part[],                    // always >= 1 part. Single-piece projects have one part named 'Main'
  activePartId: string,
  checklist: { id: string, text: string, done: boolean }[],   // assembly checklist
  history: { ts: number, partId: string, partName: string, row: number }[], // one entry per completed row, newest last, cap 500
}

Part = {
  id: string,
  name: string,                     // 'Body', 'Wing', 'Main'
  makeCount: number,                // how many of this piece (wings = 2). default 1
  piecesDone: number,               // completed pieces of this part (0..makeCount)
  row: number,                      // current row/round number. 0 = not started. "row 5" means 5 rows completed
  stitch: number,                   // stitches completed in the current (in-progress) row
  targetRows: number|null,          // total rows for this part; enables progress bar
  repeat: { enabled: boolean, startRow: number, endRow: number, times: number },
  alerts: number[],                 // stitch numbers to flash+buzz at within a row, e.g. [40, 80]
  placementNotes: string,           // 'eyes between rnd 8-9, 6 sts apart'
  patternText: string,              // pasted pattern for this part; parsed by Patterns
}
```

### Counting semantics (Store implements these; App only calls them)

- `Store.tapStitch(projectId, partId)` → `stitch += 1`. If the current row (`row + 1`) has a stitch target from the pattern (`Patterns.targetFor`) and `stitch >= target` and `settings.autoAdvance` → completes the row (same as tapRow) and returns `{ event: 'rowAuto' }`. If stitch lands on a multiple of `groupSize` → returns `{ event: 'group' }`. If stitch is in `alerts` → returns `{ event: 'alert', stitch }`. Else `{ event: 'stitch' }`.
- `Store.untapStitch` → `stitch = max(0, stitch - 1)`.
- `Store.tapRow` → `row += 1`, `stitch = 0`, push history entry. If `targetRows` and `row >= targetRows`: if `piecesDone + 1 < makeCount` → `piecesDone += 1`, `row = 0` and return `{ event: 'pieceDone', piecesDone, makeCount }`; else `piecesDone = makeCount` and return `{ event: 'partDone' }`. If ALL parts are done (every part with a targetRows has piecesDone >= makeCount; parts without targetRows are ignored, and at least one part has a target) → return `{ event: 'projectDone' }` (App then sets status finished + Celebrate.play). Else `{ event: 'row' }`.
- `Store.untapRow` → `row = max(0, row - 1)`, `stitch = 0`, pop last history entry for that part if it matches.
- `Store.resetPart` → row 0, stitch 0 (keeps piecesDone).
- `Store.undo()` → every mutating call above first pushes a deep-copy snapshot of the project onto an undo stack (cap 50, in memory only). `undo()` pops and restores. Returns boolean.
- Repeat readout: if `repeat.enabled`, `len = endRow - startRow + 1`, current row number being worked is `r = row + 1`. If `r >= startRow && r < startRow + len * times`: `k = floor((r - startRow) / len) + 1` (which repeat, 1-based), `j = ((r - startRow) % len) + 1` (row within repeat), `patternRow = startRow + j - 1`. Else not inside repeat; `patternRow = r`. `Store.repeatInfo(part)` returns `{ inside, k, j, len, times, patternRow, workingRow: r }`. **Pattern line highlighting and stitch targets always use `patternRow`**, so a repeated section highlights correctly.
- Timer: `Store.toggleTimer(projectId)`. `Store.elapsedMs(project)` = `totalMs + (runningSince ? now - runningSince : 0)`. Only one project's timer runs at a time.
- `Store.save()` writes to localStorage (debounced ~150ms is fine; must also flush on `visibilitychange`/`pagehide`). `Store.load()` on boot; if missing, create default state with NO projects (the home screen shows an empty-state).
- `Store.exportJSON()` → string of the whole state. `Store.importJSON(str)` → validates `version`, merges projects by id (imported wins), returns count.
- Templates (`Store.templates`): array of `{ id, name, emoji, countMode, parts: [{name, makeCount}], checklist: string[] }`:
  - `blank` "Single piece" 🧶 rows, parts [Main]
  - `blob` "Blobby animal" 🐑 rounds, parts [Body, Head, Ears x2, Legs x4, Tail], checklist [Stuff body, Stuff head, Sew head to body, Attach safety eyes, Sew ears, Sew legs, Sew tail, Embroider face]
  - `dragon` "Dragon" 🐉 rounds, parts [Body, Head, Wings x2, Legs x4, Tail, Horns x2, Spikes], checklist [Stuff body, Stuff head, Sew head to body, Attach safety eyes, Sew wings, Sew legs, Sew tail, Sew horns, Sew spikes down back, Embroider nostrils]
  - `garment` "Garment" 🧥 rows, parts [Front, Back, Sleeves x2], checklist [Block pieces, Seam shoulders, Set in sleeves, Seam sides, Weave in ends]
  - `blanket` "Blanket / scarf" 🧣 rows, parts [Main], checklist [Weave in ends, Add border, Block]
- `Store.createProject({ name, emoji, templateId, groupSize, countMode })` → applies template.

## Patterns API (`window.Patterns`, pure, no DOM)

```js
Patterns.parse(text) → Line[]
Line = { index: number, text: string, row: number|null, stitches: number|null }
```
Rules: split on newlines. For each line, detect a row/round number at the START of the line (case-insensitive, optional leading whitespace/bullets): `Rnd 5`, `Round 5`, `R5`, `R 5`, `Row 5`, `Rows 5-8` (range → row=5, rowEnd=8; include `rowEnd` on the Line), `5.`, `5:`, `5)`. Then detect a stitch count at the END of the line: `(30)`, `[30]`, `(30 sts)`, `(30 sc)`, `= 30`, `- 30 sts`, `30 sts`. Lines like `Rnd 2: inc x6 (12)` → row 2, stitches 12. Lines with no row number → row null (headers, notes). Row ranges (`Rnd 6-10: sc around (30)`) apply to every row in the range.

```js
Patterns.targetFor(lines, rowNumber) → number|null   // stitch count for that row, honoring ranges
Patterns.lineFor(lines, rowNumber) → Line|null       // the line to highlight for that row (ranges match)
Patterns.summary(lines) → { rows: number, maxRow: number|null, hasTargets: boolean }
```

## Themes contract

`css/themes.css` defines, for each `html[data-theme="<id>"]`, ALL of these variables. `css/app.css` uses only these (plus its own layout numbers). Defaults for `:root` (no attribute) must equal `stardew-spring`.

```
--bg              page background color
--bg-image        page background: a CSS `background-image` value (subtle SVG data-URI pattern, or `none`)
--surface         cards / sheets
--surface-2       nested surfaces, inputs
--text            main text
--text-muted      secondary text
--border          1px border color
--primary         main button bg (the big stitch button)
--primary-text    text on primary
--primary-glow    box-shadow color for pressed/active primary
--accent          secondary button bg (row button)
--accent-text
--accent-2        highlights, progress bar fill, active tab
--danger          destructive
--success
--radius          card radius (e.g. 18px; pixel theme uses 0)
--radius-sm       small controls radius
--shadow          card box-shadow value
--font-body       font-family stack
--font-display    font-family for big numbers + headings
--counter-size    font-size of the big row number (e.g. 96px)
--tap-border      border shorthand for the big tap button (pixel theme: 4px solid ...)
--header-bg       app header background (may be a gradient)
--header-text
--mascot          `url("data:image/svg+xml,...")` — a small cute theme mascot SVG (junimo, stardrop, pumpkin, night fury, red dragon, pixel dragon) used as decoration in the header/empty state. ~64px.
--overlay         modal backdrop color (rgba)
--color-scheme    'light' or 'dark' (app.css does `color-scheme: var(--color-scheme)`)
```

Theme ids and directions:
| id | name | group | vibe |
|---|---|---|---|
| `stardew-spring` | Pelican Town Spring | stardew | cream/soft greens/peach, wooden accents, junimo mascot, rounded, light |
| `stardew-night` | Stardrop Night | stardew | deep navy/purple, stars bg, stardrop-purple primary, dark |
| `stardew-harvest` | Harvest Festival | stardew | warm autumn: pumpkin orange, mustard, barn red, wood brown; pumpkin/leaf mascot, light |
| `dragon-fury` | Night Fury | dragon | HTTYD Toothless: charcoal/black surfaces, toothless-green (#7bd389-ish) accents, soft round shapes, plasma-blue glow, dark |
| `dragon-throne` | Fire & Blood | dragon | GoT/Targaryen: parchment bg, deep crimson primary, black + gold accents, serif display font, subtle scale pattern, light |
| `dragon-pixel` | Pixel Wyrm | dragon | 8-bit: pixel font (Press Start 2P), 4px hard borders, radius 0, hard offset shadows, limited retro palette, image-rendering pixelated, dark |

Google Fonts are allowed (loaded from `<link>` in index.html); every family must have a system fallback. Suggested: Nunito (body, stardew), Fredoka (display, stardew), Cinzel (display, throne), Press Start 2P (pixel), Quicksand (fury).

`js/themes.js`:
```js
window.Themes = [ { id, name, group: 'stardew'|'dragon', tagline, emoji, swatches: [bg, primary, accent, accent2] }, ... ]
```

## Celebrate API (`window.Celebrate`)

```js
Celebrate.play(themeId, { kind: 'project'|'part'|'piece'|'row' })   // returns Promise resolved when done
Celebrate.stop()
```
Creates a fixed, full-screen, pointer-events:none overlay (`<div class="celebrate">`) and removes it when done. `kind: 'project'` is the big one (2.5–3.5s): junimos hopping + confetti (stardew-spring), stardrops + shooting stars (stardew-night), leaves + pumpkins (stardew-harvest), a Night Fury flying across with plasma glow (dragon-fury), fire + falling embers with a dragon silhouette (dragon-throne), pixel fire + pixel dragon sprite (dragon-pixel). `part`/`piece` is a smaller 1.2s burst of the theme's particle. `row` is not used by default (returns immediately). Everything inline SVG/CSS/JS, respects `prefers-reduced-motion` (shortened, no large movement).

## Feedback API (`window.Feedback`)

```js
Feedback.init(settingsGetter)   // function returning { haptics, sounds }
Feedback.tap()      // stitch: 10ms vibrate, short soft click
Feedback.group()    // group boundary: [15, 40, 15], slightly higher tone
Feedback.row()      // row done: [30, 50, 30], rising two-note
Feedback.alert()    // stitch alert: [60, 60, 60, 60, 60], alternating tone
Feedback.done()     // part/project done: longer pattern, little arpeggio
Feedback.undo()     // brief low tone
```
Uses `navigator.vibrate` when present (Android), WebAudio oscillator sounds synthesized on the fly (no audio files). AudioContext is created lazily on first user gesture and resumed if suspended (iOS).

## Screens (App)

1. **Home** (`#screen-home`): header (mascot + "Stitchkeeper" + settings gear). Empty state if no projects ("No projects yet" + New project button). Active/paused project cards: emoji, name, status pill, "Body · Rnd 12 · 24/30 sts" summary of active part, updated-ago, timer total. Tap card → open project. "Finished shelf" collapsible section listing finished/frogged projects. Floating "+ New" button.
2. **New/Edit project sheet**: name, emoji grid (🧶🐑🐄🐖🐔🐰🐉🐲🦖🐢🐙🐸🦊🐻🧣🧥🧸🌵🌙⭐), template picker (cards with emoji + part list preview; edit mode hides template), Rows/Rounds toggle, group size stepper (1–50), notes textarea. Save/Cancel. Delete project (edit mode; confirm).
3. **Project screen** (`#screen-project`): 
   - Header: back, emoji+name (tap → edit), timer chip (tap to start/stop; shows h:mm:ss), overflow menu (Parts, Checklist, Notes, History, Status, Export).
   - Part tabs: horizontal scroll chips; each shows name + `1/2` piece progress when makeCount>1 + ✓ when done. Last chip "＋ part". Tap active chip again → part editor.
   - Repeat readout (if enabled): "Repeat 2 of 6 · row 3 of 4".
   - Big row counter: label "ROW"/"ROUND", number in `--font-display` at `--counter-size`, `–` and `+` buttons; progress bar + "12 / 40" when targetRows.
   - Pattern line: current pattern row's text (from `Patterns.lineFor(lines, patternRow)`); tap → opens full pattern sheet with the line highlighted and scrolled into view. Hidden if no pattern.
   - Stitch section: HUGE tap button (min 45vh on phones) showing stitch count; below it "Group 3 of 12 · stitch 4 of 10" and, if target, "24 / 30" with a slim bar. `–1` button. Small "reset stitches" link.
   - Bottom bar: Undo, Keep awake toggle (sun icon), Alerts (bell, shows count), Placement notes (pin, shows if any).
   - Piece/part completed toasts: "Wing 1 of 2 done! Starting wing 2." Part done: "Body complete ✓". Project done → status finished + `Celebrate.play(theme,{kind:'project'})` + sheet "All parts done! 🎉 Assembly checklist →".
4. **Part editor sheet**: name, make count stepper, target rows, repeat (enable, start, end, times), stitch alerts (comma list), placement notes, pattern text (textarea, monospace-ish, shows "Parsed: 24 rows, targets found" using `Patterns.summary`), Reset counts, Delete part (not if only one).
5. **Pattern sheet**: full pattern with lines; current line highlighted; tapping a line with a row number jumps the counter to that row (confirm).
6. **Checklist sheet**: checkable items, add item, delete via swipe or ✕, "3 of 8 done".
7. **Notes sheet**: project notes textarea (autosaves).
8. **History sheet**: list of completed rows with time (newest first), "Clear".
9. **Settings sheet**: theme grid (6 cards with swatches, grouped Stardew / Dragon, current one highlighted; tap applies instantly), haptics toggle, sounds toggle, auto-advance toggle, Export (downloads `stitchkeeper-backup-YYYY-MM-DD.json` via Blob + `<a download>`; also uses `navigator.share` with a File when available on mobile), Import (file input), About/version.

Status change sheet: Active / Paused / Finished / Frogged with short explanations.

## UX rules
- Mobile first, 100dvh layouts, `env(safe-area-inset-*)` padding, `touch-action: manipulation`, `user-select: none` on tap surfaces, no 300ms delay, `-webkit-tap-highlight-color: transparent`.
- Big tap button: `pointerdown` triggers count (feels instant), with pointer capture; ignore if the pointer moved > 12px (scroll). Visual press state.
- All state changes go through Store; App re-renders the current screen from state (simple `render()`; fine-grained updates optional for the counters to keep taps snappy).
- Sheets are bottom sheets on phones, centered dialogs ≥ 700px wide. Close on backdrop tap and Escape. `<dialog>` element is fine.
- Undo toast after destructive things (delete project → "Deleted. Undo" for 6s).
- Keep awake: `navigator.wakeLock.request('screen')` when toggled on AND project screen visible; re-acquire on `visibilitychange` visible. Hide toggle if unsupported.
- Theme applies via `document.documentElement.dataset.theme` and `<meta name="theme-color">` updated to `--header-bg` solid color.
- Accessible: buttons have aria-labels, live region announces "Row 13" for screen readers, focus-visible outlines.
- No external network calls except Google Fonts.

## PWA
- `manifest.webmanifest`: name "Stitchkeeper", short_name "Stitchkeeper", start_url "./", scope "./", display "standalone", background/theme colors, icons 192/512 (any + maskable).
- `sw.js`: precache app shell on install (`./`, `./index.html`, css, js, manifest, icons), cache-first for same-origin + fonts.googleapis/gstatic (opaque ok), network-first for `./index.html` navigation with cache fallback. Bump `CACHE_VERSION` on release; delete old caches on activate; `self.skipWaiting()` + `clients.claim()`.
- `index.html` has `<link rel="apple-touch-icon">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` = `black-translucent`, viewport `viewport-fit=cover`.
