# Handoff: Thready or Not

Crochet counter PWA. Live: https://puckhead456.github.io/ThreadyOrNot/ (repo puckhead456/ThreadyOrNot, deploys from `main` via `.github/workflows/pages.yml`). Local folder `C:\Users\mitch\CrochetBs` (folder name intentionally unchanged). Plain HTML/CSS/JS, no build step. Everything important is documented in `SPEC.md`; read it first.

## How to work on it
- Local server: `.claude/launch.json` config `stitchkeeper` runs `tools/serve.ps1` on http://localhost:8765 (no node or python on this machine).
- The service worker is cache-first. Before testing ANY change in the browser: unregister service workers and delete caches from the console, then reload with a cache-busting query. Bump `CACHE_VERSION` in `sw.js` on every release and precache any new file.
- Tests: `test/patterns.test.html` (unit, committed synthetic snippets), `test/patterns.fixtures.html` (runs against the real pattern PDFs in `tmp-pdf/`, which is gitignored and copyrighted: never commit those), `test/celebrate.test.html`, and on this branch `test/diagram.test.html`.
- Git is signed in; pushes work non-interactively with `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`. Put commit messages in a short-path file such as `C:\Users\mitch\AppData\Local\Temp\sk-commit.txt` and use `git commit -F`; long scratchpad paths break git on Windows.
- Delegation pattern that has worked: write the contract into SPEC.md, spawn one Opus agent per independent file group, integrate, verify at 375px in the Browser pane, deploy.

## Current branch: `feature/live-diagram`
Goal and contracts: SPEC.md section "Live 3D diagram". Three parallel work packages: parser (`Patterns.colors`, `Patterns.expand`, `Patterns.colorHex`), renderer (`js/diagram.js` WebGL plus `test/diagram.test.html`), app integration (Store model builder, canvas inside the stitch button, 3D viewer sheet, Yarn colours sheet, settings toggle). Merge to `main` only after the diagram is verified with the four real PDFs (bear belly-panel colour run, Cato stripes, bee stripes) and the counting tap path still feels instant.

## Business plan
https://claude.ai/artifact/YM4khtjkszxfibJDyLNVyq (private artifact; the theme and mascot IP rename is the first pre-monetisation task).
