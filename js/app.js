/* Stitchkeeper — js/app.js
 * window.App : rendering + event handling (the whole UI).
 * All state changes go through window.Store. Optional collaborators
 * (window.Themes / window.Patterns / window.Celebrate) are used defensively.
 */
(function () {
  'use strict';

  var APP_VERSION = '1.0.0';

  var EMOJI = [
    '🧶', '🐑', '🐄', '🐖', '🐔', '🐰', '🐉', '🐲', '🦖', '🐢',
    '🐙', '🐸', '🦊', '🐻', '🧣', '🧥', '🧸', '🌵', '🌙', '⭐'
  ];

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var STATUS_INFO = [
    { id: 'active', label: 'Active', desc: 'You are working on this right now.' },
    { id: 'paused', label: 'Paused', desc: 'Hibernating. Still on the home screen, just resting.' },
    { id: 'finished', label: 'Finished', desc: 'Done and dusted. Moves to the finished shelf.' },
    { id: 'frogged', label: 'Frogged', desc: 'Ripped back for good. Kept for the record.' }
  ];

  /* ================================================================== *
   * 1. Tiny DOM helpers
   * ================================================================== */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function button(cls, text, label) {
    var b = el('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        t = null;
        fn.apply(self, args);
      }, ms);
    };
  }

  function noop() {}

  /* ================================================================== *
   * 2. Formatting helpers
   * ================================================================== */

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** h:mm:ss */
  function fmtDuration(ms) {
    var s = Math.max(0, Math.floor((ms || 0) / 1000));
    var h = Math.floor(s / 3600);
    s -= h * 3600;
    var m = Math.floor(s / 60);
    s -= m * 60;
    return h + ':' + pad2(m) + ':' + pad2(s);
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  /** "3m ago" / "2h ago" / "yesterday" / "Sep 3" */
  function ago(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    if (diff < 45 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 60000)) + 'm ago';
    if (diff < 24 * 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 3600000)) + 'h ago';
    var then = new Date(ts);
    var days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
    if (days === 1) return 'yesterday';
    return MONTHS[then.getMonth()] + ' ' + then.getDate();
  }

  function fmtClock(ts) {
    var d = new Date(ts);
    var time;
    try {
      time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    var sameDay = startOfDay(d) === startOfDay(new Date());
    return sameDay ? time : MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + time;
  }

  function rowWord(project, caps) {
    var w = project && project.countMode === 'rounds' ? 'Round' : 'Row';
    return caps ? w.toUpperCase() : w;
  }

  function shortRowWord(project) {
    return project && project.countMode === 'rounds' ? 'Rnd' : 'Row';
  }

  /* ================================================================== *
   * 3. Optional collaborators (defensive)
   * ================================================================== */

  function fb(method) {
    try {
      if (window.Feedback && typeof window.Feedback[method] === 'function') window.Feedback[method]();
    } catch (e) {
      /* ignore */
    }
  }

  function celebrate(kind) {
    try {
      if (window.Celebrate && typeof window.Celebrate.play === 'function') {
        var r = window.Celebrate.play(Store.settings().theme, { kind: kind });
        if (r && typeof r.catch === 'function') r.catch(noop);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function themeList() {
    return Array.isArray(window.Themes) ? window.Themes : [];
  }

  /* ================================================================== *
   * 4. Element references
   * ================================================================== */

  var els = {};

  function cacheEls() {
    els.home = $('#screen-home');
    els.project = $('#screen-project');
    els.live = $('#live-region');
    els.toasts = $('#toasts');

    els.homeEmpty = $('#home-empty');
    els.homeList = $('#home-list');
    els.finishedWrap = $('#home-finished');
    els.finishedToggle = $('#finished-toggle');
    els.finishedLabel = $('#finished-label');
    els.finishedList = $('#finished-list');

    els.pEmoji = $('#p-emoji');
    els.pName = $('#p-name');
    els.pTimer = $('#p-timer');
    els.tabs = $('#part-tabs');
    els.repeat = $('#repeat-readout');
    els.rowLabel = $('#row-label');
    els.rowNumber = $('#row-number');
    els.rowProgress = $('#row-progress');
    els.rowBarFill = $('#row-bar-fill');
    els.rowBarLabel = $('#row-bar-label');
    els.patternLine = $('#pattern-line');
    els.patternTag = $('#pattern-line-tag');
    els.patternText = $('#pattern-line-text');
    els.stitchBtn = $('#stitch-btn');
    els.stitchNumber = $('#stitch-number');
    els.stitchReadout = $('#stitch-readout');
    els.stitchProgress = $('#stitch-progress');
    els.stitchBarFill = $('#stitch-bar-fill');
    els.stitchBarLabel = $('#stitch-bar-label');
    els.btnUndo = $('#btn-undo');
    els.btnWake = $('#btn-wake');
    els.btnAlerts = $('#btn-alerts');
    els.alertsText = $('#alerts-text');
    els.btnPlace = $('#btn-place');
  }

  /* ================================================================== *
   * 5. Live region + toasts
   * ================================================================== */

  function announce(text) {
    if (!els.live) return;
    els.live.textContent = '';
    // A fresh text node in the next frame makes screen readers re-announce.
    window.setTimeout(function () {
      els.live.textContent = text;
    }, 30);
  }

  /**
   * @param {string} msg
   * @param {{ actionText?: string, onAction?: Function, ms?: number }} [opts]
   */
  function toast(msg, opts) {
    opts = opts || {};
    if (!els.toasts) return;
    var node = el('div', 'toast');
    node.appendChild(el('span', 'toast-text', msg));
    var timer = null;
    function dismiss() {
      if (timer) clearTimeout(timer);
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    if (opts.actionText && opts.onAction) {
      var act = button('toast-action', opts.actionText);
      on(act, 'click', function () {
        dismiss();
        opts.onAction();
      });
      node.appendChild(act);
    }
    els.toasts.appendChild(node);
    timer = setTimeout(dismiss, opts.ms || 2600);
    return dismiss;
  }

  /* ================================================================== *
   * 6. Sheets (dynamic <dialog>)
   * ================================================================== */

  var openSheets = [];

  /**
   * @param {{title:string, cls?:string, build?:Function, footer?:Array, onClose?:Function}} opts
   */
  function openSheet(opts) {
    opts = opts || {};
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet' + (opts.cls ? ' ' + opts.cls : '');

    var inner = el('div', 'sheet-inner');
    var head = el('div', 'sheet-head');
    head.appendChild(el('div', 'sheet-grab'));
    var h = el('h2', 'sheet-title', opts.title || '');
    var closeBtn = button('sheet-close', '✕', 'Close');
    head.appendChild(h);
    head.appendChild(closeBtn);

    var body = el('div', 'sheet-body');
    inner.appendChild(head);
    inner.appendChild(body);

    var result;
    var api = {
      dialog: dlg,
      body: body,
      title: h,
      close: function (value) {
        result = value;
        try {
          dlg.close();
        } catch (e) {
          dlg.remove();
        }
      }
    };

    if (opts.footer && opts.footer.length) {
      var foot = el('div', 'sheet-foot');
      opts.footer.forEach(function (f) {
        var b = button(f.cls || 'btn', f.text);
        on(b, 'click', function () {
          f.onClick(api);
        });
        foot.appendChild(b);
      });
      inner.appendChild(foot);
    }

    dlg.appendChild(inner);
    document.body.appendChild(dlg);

    on(closeBtn, 'click', function () {
      api.close();
    });
    on(dlg, 'click', function (e) {
      if (e.target === dlg) api.close();
    });
    on(dlg, 'close', function () {
      var i = openSheets.indexOf(api);
      if (i >= 0) openSheets.splice(i, 1);
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      if (opts.onClose) opts.onClose(result);
    });
    // Escape: <dialog> fires cancel then close — nothing extra needed.

    if (opts.build) opts.build(body, api);

    openSheets.push(api);
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
    return api;
  }

  function closeAllSheets() {
    openSheets.slice().forEach(function (s) {
      s.close();
    });
  }

  /** Custom confirm sheet (window.confirm looks wrong in standalone PWAs). */
  function confirmSheet(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      openSheet({
        title: opts.title || 'Are you sure?',
        cls: 'sheet-confirm',
        build: function (body) {
          if (opts.message) body.appendChild(el('p', 'muted', opts.message));
        },
        footer: [
          {
            text: opts.cancelText || 'Cancel',
            cls: 'btn ghost',
            onClick: function (api) {
              api.close(false);
            }
          },
          {
            text: opts.confirmText || 'OK',
            cls: 'btn ' + (opts.danger ? 'danger' : 'primary'),
            onClick: function (api) {
              api.close(true);
            }
          }
        ],
        onClose: function (v) {
          if (settled) return;
          settled = true;
          resolve(v === true);
        }
      });
    });
  }

  /* ================================================================== *
   * 7. Form control builders
   * ================================================================== */

  var autoIdSeq = 0;

  function field(labelText, control, hint) {
    var wrap = el('div', 'field');
    if (labelText) {
      var lab = el('label', null, labelText);
      if (control && /^(INPUT|TEXTAREA|SELECT)$/.test(control.tagName || '')) {
        if (!control.id) control.id = 'sk-f' + ++autoIdSeq;
        lab.setAttribute('for', control.id);
      }
      wrap.appendChild(lab);
    }
    if (control) wrap.appendChild(control);
    if (hint) wrap.appendChild(el('div', 'field-hint', hint));
    return wrap;
  }

  function textInput(value, placeholder) {
    var i = document.createElement('input');
    i.type = 'text';
    i.value = value == null ? '' : String(value);
    if (placeholder) i.placeholder = placeholder;
    return i;
  }

  function numInput(value, min, max, placeholder) {
    var i = document.createElement('input');
    i.type = 'number';
    i.inputMode = 'numeric';
    if (min != null) i.min = String(min);
    if (max != null) i.max = String(max);
    i.value = value == null ? '' : String(value);
    if (placeholder) i.placeholder = placeholder;
    return i;
  }

  function textArea(value, cls, placeholder) {
    var t = document.createElement('textarea');
    t.className = cls || '';
    t.value = value == null ? '' : String(value);
    if (placeholder) t.placeholder = placeholder;
    return t;
  }

  function stepper(value, min, max, label) {
    var wrap = el('div', 'stepper');
    var dec = button(null, '−', 'Decrease ' + (label || 'value'));
    var input = numInput(value, min, max);
    var inc = button(null, '+', 'Increase ' + (label || 'value'));
    function get() {
      var n = parseInt(input.value, 10);
      if (!isFinite(n)) n = min;
      return Math.min(max, Math.max(min, n));
    }
    function set(n) {
      input.value = String(Math.min(max, Math.max(min, n)));
    }
    on(dec, 'click', function () { set(get() - 1); });
    on(inc, 'click', function () { set(get() + 1); });
    wrap.appendChild(dec);
    wrap.appendChild(input);
    wrap.appendChild(inc);
    return { node: wrap, input: input, get: get, set: set };
  }

  function segmented(options, current, onPick) {
    var wrap = el('div', 'seg');
    var value = current;
    options.forEach(function (o) {
      var b = button(value === o.id ? 'on' : null, o.label);
      on(b, 'click', function () {
        value = o.id;
        Array.prototype.forEach.call(wrap.children, function (c) { c.classList.remove('on'); });
        b.classList.add('on');
        if (onPick) onPick(value);
      });
      wrap.appendChild(b);
    });
    return { node: wrap, get: function () { return value; } };
  }

  function switchRow(labelText, subText, checked, onToggle) {
    var row = el('div', 'toggle-row');
    var left = el('div');
    left.appendChild(el('div', 'toggle-label', labelText));
    if (subText) left.appendChild(el('div', 'toggle-sub', subText));
    var sw = button('switch');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', checked ? 'true' : 'false');
    sw.setAttribute('aria-label', labelText);
    on(sw, 'click', function () {
      var next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      onToggle(next);
    });
    row.appendChild(left);
    row.appendChild(sw);
    return row;
  }

  function emojiGrid(current, onPick) {
    var grid = el('div', 'emoji-grid');
    var value = current;
    EMOJI.forEach(function (e) {
      var b = button('emoji-btn' + (e === value ? ' on' : ''), e, 'Emoji ' + e);
      on(b, 'click', function () {
        value = e;
        Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('on'); });
        b.classList.add('on');
        if (onPick) onPick(value);
      });
      grid.appendChild(b);
    });
    return { node: grid, get: function () { return value; } };
  }

  function parseNumberList(text) {
    var out = [];
    String(text || '').split(/[,\s]+/).forEach(function (chunk) {
      var n = parseInt(chunk, 10);
      if (isFinite(n) && n > 0 && out.indexOf(n) === -1) out.push(n);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /* ================================================================== *
   * 8. Theme
   * ================================================================== */

  function applyTheme(id, persist) {
    if (!id) return;
    document.documentElement.setAttribute('data-theme', id);
    if (persist !== false) Store.setSetting('theme', id);
    window.requestAnimationFrame(updateThemeColor);
  }

  function updateThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var cs = window.getComputedStyle(document.documentElement);
    var header = (cs.getPropertyValue('--header-bg') || '').trim();
    var color = header;
    if (!color || /gradient|url\(|image/i.test(color)) {
      color = (cs.getPropertyValue('--bg') || '').trim();
    }
    if (color) meta.setAttribute('content', color);
  }

  /* ================================================================== *
   * 9. Wake lock
   * ================================================================== */

  var wakeLock = null;
  var wakeSupported = !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function');

  function wantsWakeLock() {
    return (
      wakeSupported &&
      Store.settings().keepAwake &&
      currentProject() !== null &&
      document.visibilityState === 'visible'
    );
  }

  function syncWakeLock() {
    if (!wakeSupported) return;
    if (wantsWakeLock()) {
      if (wakeLock) return;
      try {
        navigator.wakeLock
          .request('screen')
          .then(function (lock) {
            wakeLock = lock;
            lock.addEventListener('release', function () {
              wakeLock = null;
            });
          })
          .catch(function () {
            wakeLock = null;
          });
      } catch (e) {
        wakeLock = null;
      }
    } else if (wakeLock) {
      try {
        wakeLock.release();
      } catch (e) {
        /* ignore */
      }
      wakeLock = null;
    }
  }

  /* ================================================================== *
   * 10. Current selection helpers
   * ================================================================== */

  function currentProject() {
    return Store.project(Store.getState().activeProjectId);
  }

  function currentPart() {
    var p = currentProject();
    return p ? Store.activePart(p) : null;
  }

  function openProject(id) {
    Store.setActiveProject(id);
    render();
  }

  function goHome() {
    Store.setActiveProject(null);
    render();
  }

  /* ================================================================== *
   * 11. Render — router
   * ================================================================== */

  function render() {
    var p = currentProject();
    if (p) {
      els.home.hidden = true;
      els.project.hidden = false;
      renderProject(p);
    } else {
      els.project.hidden = true;
      els.home.hidden = false;
      renderHome();
    }
    syncWakeLock();
  }

  /* ================================================================== *
   * 12. Render — home
   * ================================================================== */

  function projectSummary(p) {
    var prt = Store.activePart(p);
    if (!prt) return '';
    var bits = [prt.name, shortRowWord(p) + ' ' + prt.row];
    var target = Store.currentTarget(prt);
    bits.push(target ? prt.stitch + '/' + target + ' sts' : prt.stitch + ' sts');
    return bits.join(' · ');
  }

  function projectCard(p) {
    var card = button('project-card');
    card.setAttribute('aria-label', 'Open ' + p.name);

    card.appendChild(el('span', 'pc-emoji', p.emoji));
    card.appendChild(el('span', 'pc-name', p.name));

    var pill = el('span', 'pill ' + p.status + ' pc-pill', p.status);
    card.appendChild(pill);

    card.appendChild(el('span', 'pc-summary', projectSummary(p)));

    var meta = el('span', 'pc-meta');
    meta.appendChild(document.createTextNode(ago(p.updatedAt)));
    meta.appendChild(document.createTextNode(' · '));
    var t = el('span', 'pc-time', fmtDuration(Store.elapsedMs(p)));
    t.setAttribute('data-timer-project', p.id);
    meta.appendChild(t);
    card.appendChild(meta);

    on(card, 'click', function () {
      openProject(p.id);
    });
    return card;
  }

  var finishedOpen = false;

  function renderHome() {
    var all = Store.projects();
    var live = [];
    var done = [];
    all.forEach(function (p) {
      if (p.status === 'finished' || p.status === 'frogged') done.push(p);
      else live.push(p);
    });
    live.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    done.sort(function (a, b) { return (b.finishedAt || b.updatedAt) - (a.finishedAt || a.updatedAt); });

    els.homeEmpty.hidden = all.length > 0;

    clear(els.homeList);
    live.forEach(function (p) {
      els.homeList.appendChild(projectCard(p));
    });

    els.finishedWrap.hidden = done.length === 0;
    els.finishedLabel.textContent = 'Finished shelf (' + done.length + ')';
    els.finishedToggle.setAttribute('aria-expanded', finishedOpen ? 'true' : 'false');
    els.finishedList.hidden = !finishedOpen;
    clear(els.finishedList);
    done.forEach(function (p) {
      els.finishedList.appendChild(projectCard(p));
    });
  }

  /* ================================================================== *
   * 13. Render — project
   * ================================================================== */

  function renderTabs(p) {
    clear(els.tabs);
    p.parts.forEach(function (prt) {
      var isActive = prt.id === p.activePartId;
      var tab = button('tab' + (isActive ? ' active' : ''));
      tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      tab.setAttribute(
        'aria-label',
        prt.name + (isActive ? ' (current part — tap to edit)' : '')
      );
      tab.appendChild(document.createTextNode(prt.name));
      if (prt.makeCount > 1) {
        tab.appendChild(document.createTextNode(' '));
        tab.appendChild(el('span', 'tab-badge', prt.piecesDone + '/' + prt.makeCount));
      }
      if (prt.piecesDone >= prt.makeCount && prt.targetRows) {
        tab.appendChild(document.createTextNode(' ✓'));
      }
      on(tab, 'click', function () {
        if (isActive) {
          openPartEditor(p.id, prt.id);
        } else {
          Store.setActivePart(p.id, prt.id);
          render();
        }
      });
      els.tabs.appendChild(tab);
    });

    var add = button('tab tab-add', '＋ part', 'Add a part');
    on(add, 'click', function () {
      addPartFlow(p.id);
    });
    els.tabs.appendChild(add);
  }

  function updateTimerChip(p) {
    if (!els.pTimer) return;
    els.pTimer.textContent = fmtDuration(Store.elapsedMs(p));
    var running = !!(p.timer && p.timer.runningSince);
    els.pTimer.classList.toggle('running', running);
    els.pTimer.setAttribute('aria-label', (running ? 'Stop' : 'Start') + ' timer, ' + fmtDuration(Store.elapsedMs(p)));
  }

  /** Fast path: only the numbers and readouts. */
  function updateCounters(p, prt) {
    if (!p || !prt) return;

    els.rowLabel.textContent = rowWord(p, true);
    els.rowNumber.textContent = String(prt.row);

    if (prt.targetRows) {
      els.rowProgress.hidden = false;
      var pct = Math.max(0, Math.min(100, (prt.row / prt.targetRows) * 100));
      els.rowBarFill.style.width = pct + '%';
      var lbl = prt.row + ' / ' + prt.targetRows;
      if (prt.makeCount > 1) {
        lbl += ' · piece ' + Math.min(prt.piecesDone + 1, prt.makeCount) + ' of ' + prt.makeCount;
      }
      els.rowBarLabel.textContent = lbl;
    } else {
      els.rowProgress.hidden = true;
    }

    // Repeat readout
    var ri = Store.repeatInfo(prt);
    if (prt.repeat && prt.repeat.enabled) {
      els.repeat.hidden = false;
      if (ri.inside) {
        els.repeat.textContent =
          'Repeat ' + ri.k + ' of ' + ri.times + ' · ' + rowWord(p).toLowerCase() + ' ' + ri.j + ' of ' + ri.len;
      } else {
        els.repeat.textContent =
          'Repeat ' + rowWord(p).toLowerCase() + 's ' + prt.repeat.startRow + '–' + prt.repeat.endRow +
          ' × ' + prt.repeat.times + ' (not in repeat)';
      }
    } else {
      els.repeat.hidden = true;
    }

    // Pattern line
    var line = Store.lineForRow(prt, ri.patternRow);
    if (line && line.text) {
      els.patternLine.hidden = false;
      els.patternTag.textContent = shortRowWord(p) + ' ' + ri.patternRow;
      els.patternText.textContent = line.text;
    } else {
      els.patternLine.hidden = true;
    }

    // Stitches
    els.stitchNumber.textContent = String(prt.stitch);
    var g = p.groupSize > 0 ? p.groupSize : 10;
    var target = Store.currentTarget(prt);
    var groupNo = prt.stitch === 0 ? 1 : Math.ceil(prt.stitch / g);
    var within = prt.stitch === 0 ? 0 : ((prt.stitch - 1) % g) + 1;
    var readout = 'Group ' + groupNo;
    if (target) readout += ' of ' + Math.ceil(target / g);
    readout += ' · stitch ' + within + ' of ' + g;
    els.stitchReadout.textContent = readout;

    if (target) {
      els.stitchProgress.hidden = false;
      var spct = Math.max(0, Math.min(100, (prt.stitch / target) * 100));
      els.stitchBarFill.style.width = spct + '%';
      els.stitchBarLabel.textContent = prt.stitch + ' / ' + target;
    } else {
      els.stitchProgress.hidden = true;
    }
  }

  function updateBottomBar(p, prt) {
    els.btnUndo.disabled = !Store.canUndo();

    els.btnWake.hidden = !wakeSupported;
    var awake = !!Store.settings().keepAwake;
    els.btnWake.classList.toggle('on', awake);
    els.btnWake.setAttribute('aria-pressed', awake ? 'true' : 'false');

    var n = prt && prt.alerts ? prt.alerts.length : 0;
    els.alertsText.textContent = n ? 'Alerts ' + n : 'Alerts';
    els.btnAlerts.classList.toggle('on', n > 0);

    var hasPlace = !!(prt && prt.placementNotes && prt.placementNotes.trim());
    els.btnPlace.classList.toggle('on', hasPlace);
  }

  function renderProject(p) {
    var prt = Store.activePart(p);
    els.pEmoji.textContent = p.emoji;
    els.pName.textContent = p.name;
    updateTimerChip(p);
    renderTabs(p);
    updateCounters(p, prt);
    updateBottomBar(p, prt);
  }

  /* ================================================================== *
   * 14. Applying Store results (feedback, toasts, celebrations)
   * ================================================================== */

  function flashStitchButton() {
    if (!els.stitchBtn) return;
    els.stitchBtn.classList.remove('flash');
    // force reflow so the animation restarts
    void els.stitchBtn.offsetWidth;
    els.stitchBtn.classList.add('flash');
    window.setTimeout(function () {
      els.stitchBtn.classList.remove('flash');
    }, 500);
  }

  function showProjectDoneSheet(p) {
    openSheet({
      title: 'All parts done! 🎉',
      build: function (body) {
        body.appendChild(el('p', null, p.name + ' is off the hook. Time for assembly.'));
        var b = button('btn primary block big', 'Assembly checklist →');
        on(b, 'click', function () {
          closeAllSheets();
          openChecklistSheet(p.id);
        });
        body.appendChild(b);
      }
    });
  }

  function applyResult(res) {
    if (!res || res.event === 'none') return;
    var p = currentProject();
    if (!p) return;
    var prt = Store.activePart(p);

    switch (res.event) {
      case 'stitch':
        fb('tap');
        updateCounters(p, prt);
        break;

      case 'group':
        fb('group');
        updateCounters(p, prt);
        break;

      case 'alert':
        fb('alert');
        flashStitchButton();
        updateCounters(p, prt);
        toast('Stitch ' + res.stitch + ' — check your pattern');
        break;

      case 'row':
      case 'rowAuto':
        fb('row');
        updateCounters(p, prt);
        updateBottomBar(p, prt);
        announce(rowWord(p) + ' ' + prt.row);
        break;

      case 'pieceDone':
        fb('done');
        celebrate('piece');
        render();
        announce(res.partName + ' ' + res.piecesDone + ' of ' + res.makeCount + ' done');
        toast(res.partName + ' ' + res.piecesDone + ' of ' + res.makeCount + ' done! Starting ' +
          res.partName.toLowerCase() + ' ' + (res.piecesDone + 1) + '.', { ms: 3600 });
        break;

      case 'partDone':
        fb('done');
        celebrate('part');
        render();
        announce(res.partName + ' complete');
        toast(res.partName + ' complete ✓', { ms: 3600 });
        break;

      case 'projectDone':
        fb('done');
        Store.setStatus(p.id, 'finished');
        celebrate('project');
        render();
        announce('Project complete');
        showProjectDoneSheet(p);
        break;

      default:
        updateCounters(p, prt);
    }
  }

  /* ================================================================== *
   * 15. Stitch button gesture
   * ================================================================== */

  var tapState = null;
  var MOVE_TOLERANCE_SQ = 12 * 12;

  function doStitchTap() {
    var p = currentProject();
    if (!p) return false;
    var prt = Store.activePart(p);
    if (!prt) return false;
    applyResult(Store.tapStitch(p.id, prt.id));
    return true;
  }

  function cancelTap() {
    if (!tapState || tapState.reverted) return;
    tapState.reverted = true;
    // The tap already counted on pointerdown; a drag means it was a scroll.
    if (Store.undo()) render();
  }

  function bindStitchButton() {
    var btn = els.stitchBtn;
    if (!btn) return;

    on(btn, 'pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!currentProject()) return;
      tapState = { id: e.pointerId, x: e.clientX, y: e.clientY, reverted: false };
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      btn.classList.add('pressed');
      doStitchTap();
      e.preventDefault();
    });

    on(btn, 'pointermove', function (e) {
      if (!tapState || e.pointerId !== tapState.id || tapState.reverted) return;
      var dx = e.clientX - tapState.x;
      var dy = e.clientY - tapState.y;
      if (dx * dx + dy * dy > MOVE_TOLERANCE_SQ) {
        btn.classList.remove('pressed');
        cancelTap();
      }
    });

    function end(e) {
      if (!tapState) return;
      if (e && e.pointerId !== undefined && e.pointerId !== tapState.id) return;
      btn.classList.remove('pressed');
      try {
        btn.releasePointerCapture(tapState.id);
      } catch (err) {
        /* ignore */
      }
      tapState = null;
    }

    on(btn, 'pointerup', end);
    on(btn, 'pointercancel', function (e) {
      cancelTap();
      end(e);
    });
    on(btn, 'contextmenu', function (e) {
      e.preventDefault();
    });
    // Keyboard activation (Enter/Space) produces a click with detail === 0.
    on(btn, 'click', function (e) {
      if (e.detail === 0) doStitchTap();
    });
  }

  /* ================================================================== *
   * 16. Project / part editors
   * ================================================================== */

  function templatePreview(tpl) {
    return tpl.parts
      .map(function (p) { return p.name + (p.makeCount > 1 ? ' ×' + p.makeCount : ''); })
      .join(', ');
  }

  function openProjectEditor(projectId) {
    var editing = !!projectId;
    var p = editing ? Store.project(projectId) : null;
    if (editing && !p) return;

    var chosenTemplate = 'blank';
    var nameInput, notesArea, emoji, modeSeg, groupStep;

    openSheet({
      title: editing ? 'Edit project' : 'New project',
      build: function (body, api) {
        nameInput = textInput(p ? p.name : '', 'Sunny the sheep');
        body.appendChild(field('Name', nameInput));

        emoji = emojiGrid(p ? p.emoji : '🧶');
        body.appendChild(field('Emoji', emoji.node));

        if (!editing) {
          var grid = el('div', 'tpl-grid');
          Store.templates.forEach(function (tpl) {
            var card = button('tpl-card' + (tpl.id === chosenTemplate ? ' on' : ''));
            card.appendChild(el('span', 'tpl-emoji', tpl.emoji));
            var main = el('div', 'tpl-main');
            main.appendChild(el('div', 'tpl-name', tpl.name));
            main.appendChild(el('div', 'tpl-parts', templatePreview(tpl)));
            card.appendChild(main);
            on(card, 'click', function () {
              chosenTemplate = tpl.id;
              Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('on'); });
              card.classList.add('on');
              if (!nameInput.value.trim()) nameInput.placeholder = tpl.name;
            });
            grid.appendChild(card);
          });
          body.appendChild(field('Template', grid));
        }

        modeSeg = segmented(
          [{ id: 'rows', label: 'Rows' }, { id: 'rounds', label: 'Rounds' }],
          p ? p.countMode : 'rows'
        );
        body.appendChild(field('Count', modeSeg.node));

        groupStep = stepper(p ? p.groupSize : 10, 1, 50, 'group size');
        body.appendChild(field('Stitch group size', groupStep.node, 'A buzz every N stitches while you count.'));

        notesArea = textArea(p ? p.notes : '', '', 'Hook 4mm · Paintbox DK · pattern link…');
        body.appendChild(field('Notes', notesArea));

        if (editing) {
          var zone = el('div', 'danger-zone');
          var del = button('btn danger block', 'Delete project');
          on(del, 'click', function () {
            confirmSheet({
              title: 'Delete ' + p.name + '?',
              message: 'Rows, parts, notes and history go with it. You get 6 seconds to undo.',
              confirmText: 'Delete',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              api.close();
              deleteProjectFlow(p.id);
            });
          });
          zone.appendChild(del);
          body.appendChild(zone);
        }
      },
      footer: [
        { text: 'Cancel', cls: 'btn ghost', onClick: function (api) { api.close(); } },
        {
          text: 'Save',
          cls: 'btn primary',
          onClick: function (api) {
            var patch = {
              name: nameInput.value,
              emoji: emoji.get(),
              countMode: modeSeg.get(),
              groupSize: groupStep.get(),
              notes: notesArea.value
            };
            if (editing) {
              Store.updateProject(p.id, patch);
            } else {
              patch.templateId = chosenTemplate;
              var created = Store.createProject(patch);
              Store.setActiveProject(created.id);
            }
            api.close();
            render();
          }
        }
      ]
    });
  }

  function deleteProjectFlow(projectId) {
    var p = Store.project(projectId);
    if (!p) return;
    var name = p.name;
    Store.deleteProject(projectId);
    render();
    toast('Deleted “' + name + '”.', {
      ms: 6000,
      actionText: 'Undo',
      onAction: function () {
        if (Store.undo()) {
          fb('undo');
          render();
        }
      }
    });
  }

  function addPartFlow(projectId) {
    var nameInput, countStep;
    openSheet({
      title: 'Add a part',
      build: function (body) {
        nameInput = textInput('', 'Wing');
        body.appendChild(field('Name', nameInput));
        countStep = stepper(1, 1, 20, 'make count');
        body.appendChild(field('How many', countStep.node, 'Wings ×2, legs ×4 — the counter tracks each piece.'));
      },
      footer: [
        { text: 'Cancel', cls: 'btn ghost', onClick: function (api) { api.close(); } },
        {
          text: 'Add',
          cls: 'btn primary',
          onClick: function (api) {
            Store.addPart(projectId, { name: nameInput.value, makeCount: countStep.get() });
            api.close();
            render();
          }
        }
      ]
    });
  }

  function openPartEditor(projectId, partId) {
    var p = Store.project(projectId);
    var prt = Store.part(p, partId);
    if (!p || !prt) return;

    var nameInput, makeStep, targetInput, repEnable, repStart, repEnd, repTimes,
      alertsInput, placeArea, patternArea, parsedNote;
    var repeatOn = !!prt.repeat.enabled;

    function refreshParsed() {
      // Read straight from the textarea via a temp part-shaped object.
      var tmp = { id: prt.id + ':preview', patternText: patternArea.value };
      var s = Store.patternSummary(tmp);
      if (!patternArea.value.trim()) {
        parsedNote.textContent = 'Paste the pattern for this part to get row highlighting and stitch targets.';
      } else if (!s.rows) {
        parsedNote.textContent = 'Parsed: no numbered rows found yet.';
      } else {
        parsedNote.textContent =
          'Parsed: ' + s.rows + ' rows' + (s.maxRow ? ' (up to ' + s.maxRow + ')' : '') +
          (s.hasTargets ? ', targets found' : ', no stitch counts');
      }
    }

    openSheet({
      title: 'Part: ' + prt.name,
      build: function (body, api) {
        nameInput = textInput(prt.name, 'Body');
        body.appendChild(field('Name', nameInput));

        makeStep = stepper(prt.makeCount, 1, 20, 'make count');
        body.appendChild(field('How many', makeStep.node));

        targetInput = numInput(prt.targetRows == null ? '' : prt.targetRows, 1, 999999, 'e.g. 40');
        body.appendChild(field('Target ' + rowWord(p).toLowerCase() + 's', targetInput, 'Leave blank for open-ended.'));

        // Repeat
        var repWrap = el('div', 'field');
        repWrap.appendChild(el('div', 'field-label', 'Repeat section'));
        repEnable = switchRow('Enable repeat', 'Loop a block of rows several times.', repeatOn, function (v) {
          repeatOn = v;
        });
        repWrap.appendChild(repEnable);
        var repRow = el('div', 'row-flex');
        repStart = numInput(prt.repeat.startRow, 1, 999999);
        repEnd = numInput(prt.repeat.endRow, 1, 999999);
        repTimes = numInput(prt.repeat.times, 1, 9999);
        repRow.appendChild(field('From', repStart));
        repRow.appendChild(field('To', repEnd));
        repRow.appendChild(field('Times', repTimes));
        repWrap.appendChild(repRow);
        body.appendChild(repWrap);

        alertsInput = textInput(prt.alerts.join(', '), '40, 80');
        body.appendChild(field('Stitch alerts', alertsInput, 'Comma-separated stitch numbers to buzz at.'));

        placeArea = textArea(prt.placementNotes, '', 'Eyes between rnd 8–9, 6 sts apart');
        body.appendChild(field('Placement notes', placeArea));

        patternArea = textArea(prt.patternText, 'mono', 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)');
        parsedNote = el('div', 'parsed-note');
        body.appendChild(field('Pattern text', patternArea));
        body.appendChild(parsedNote);
        on(patternArea, 'input', debounce(refreshParsed, 250));
        refreshParsed();

        var zone = el('div', 'danger-zone');
        var reset = button('btn block', 'Reset counts');
        on(reset, 'click', function () {
          confirmSheet({
            title: 'Reset ' + prt.name + '?',
            message: 'Row and stitch go back to zero. Completed pieces are kept.',
            confirmText: 'Reset'
          }).then(function (ok) {
            if (!ok) return;
            Store.resetPart(p.id, prt.id);
            api.close();
            render();
            toast('Counts reset');
          });
        });
        zone.appendChild(reset);

        if (p.parts.length > 1) {
          var del = button('btn danger block', 'Delete part');
          on(del, 'click', function () {
            confirmSheet({
              title: 'Delete ' + prt.name + '?',
              message: 'Its rows, pattern and notes go too.',
              confirmText: 'Delete',
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              Store.deletePart(p.id, prt.id);
              api.close();
              render();
            });
          });
          zone.appendChild(del);
        }
        body.appendChild(zone);
      },
      footer: [
        { text: 'Cancel', cls: 'btn ghost', onClick: function (api) { api.close(); } },
        {
          text: 'Save',
          cls: 'btn primary',
          onClick: function (api) {
            Store.updatePart(p.id, prt.id, {
              name: nameInput.value,
              makeCount: makeStep.get(),
              targetRows: targetInput.value === '' ? null : targetInput.value,
              repeat: {
                enabled: repeatOn,
                startRow: repStart.value,
                endRow: repEnd.value,
                times: repTimes.value
              },
              alerts: parseNumberList(alertsInput.value),
              placementNotes: placeArea.value,
              patternText: patternArea.value
            });
            api.close();
            render();
          }
        }
      ]
    });
  }

  function openPartsSheet(projectId) {
    var p = Store.project(projectId);
    if (!p) return;
    openSheet({
      title: 'Parts',
      build: function (body, api) {
        var list = el('div', 'list');
        p.parts.forEach(function (prt) {
          var item = button('menu-item');
          var main = el('div');
          main.appendChild(el('div', null, prt.name + (prt.makeCount > 1 ? ' ×' + prt.makeCount : '')));
          var sub = shortRowWord(p) + ' ' + prt.row + (prt.targetRows ? ' / ' + prt.targetRows : '');
          if (prt.makeCount > 1) sub += ' · ' + prt.piecesDone + ' of ' + prt.makeCount + ' done';
          main.appendChild(el('div', 'toggle-sub', sub));
          item.appendChild(main);
          on(item, 'click', function () {
            api.close();
            Store.setActivePart(p.id, prt.id);
            render();
            openPartEditor(p.id, prt.id);
          });
          list.appendChild(item);
        });
        body.appendChild(list);

        var add = button('btn primary block', '＋ Add a part');
        on(add, 'click', function () {
          api.close();
          addPartFlow(p.id);
        });
        body.appendChild(add);
      }
    });
  }

  /* ================================================================== *
   * 17. Pattern sheet
   * ================================================================== */

  function openPatternSheet(projectId, partId) {
    var p = Store.project(projectId);
    var prt = Store.part(p, partId);
    if (!p || !prt) return;
    var lines = Store.linesFor(prt);
    var ri = Store.repeatInfo(prt);

    openSheet({
      title: 'Pattern · ' + prt.name,
      build: function (body, api) {
        if (!lines.length) {
          body.appendChild(el('p', 'muted', 'No pattern yet. Add one in the part editor.'));
          var edit = button('btn primary block', 'Open part editor');
          on(edit, 'click', function () {
            api.close();
            openPartEditor(p.id, prt.id);
          });
          body.appendChild(edit);
          return;
        }

        var wrap = el('div', 'pattern-lines');
        var currentNode = null;
        lines.forEach(function (line) {
          var hasRow = typeof line.row === 'number' && line.row > 0;
          var isCurrent = hasRow && lineCoversRow(line, ri.patternRow);
          var cls = 'pline' + (hasRow ? ' has-row' : ' plain') + (isCurrent ? ' on' : '');
          var node = button(cls, line.text);
          if (isCurrent && !currentNode) {
            currentNode = node;
            node.setAttribute('aria-current', 'true');
          }
          if (hasRow) {
            on(node, 'click', function () {
              confirmSheet({
                title: 'Jump to ' + rowWord(p).toLowerCase() + ' ' + line.row + '?',
                message: 'The counter will move to ' + rowWord(p).toLowerCase() + ' ' + line.row +
                  ' and stitches reset to 0.',
                confirmText: 'Jump'
              }).then(function (ok) {
                if (!ok) return;
                Store.jumpToRow(p.id, prt.id, line.row);
                api.close();
                render();
                announce(rowWord(p) + ' ' + Math.max(0, line.row - 1));
              });
            });
          } else {
            node.disabled = true;
          }
          wrap.appendChild(node);
        });
        body.appendChild(wrap);

        if (currentNode) {
          window.setTimeout(function () {
            try {
              currentNode.scrollIntoView({ block: 'center' });
            } catch (e) {
              currentNode.scrollIntoView();
            }
          }, 40);
        }
      }
    });
  }

  function lineCoversRow(line, row) {
    if (typeof line.row !== 'number') return false;
    var end = typeof line.rowEnd === 'number' && line.rowEnd >= line.row ? line.rowEnd : line.row;
    return row >= line.row && row <= end;
  }

  /* ================================================================== *
   * 18. Checklist / notes / history / status sheets
   * ================================================================== */

  function openChecklistSheet(projectId) {
    var p = Store.project(projectId);
    if (!p) return;

    openSheet({
      title: 'Assembly checklist',
      build: function (body) {
        var count = el('p', 'muted');
        var list = el('div', 'list');
        var addRow = el('div', 'row-flex');
        var input = textInput('', 'Sew the tail on');
        var addBtn = button('btn primary', 'Add');
        addBtn.style.flex = '0 0 auto';

        function refresh() {
          var done = 0;
          p.checklist.forEach(function (i) { if (i.done) done++; });
          count.textContent = done + ' of ' + p.checklist.length + ' done';
          clear(list);
          if (!p.checklist.length) {
            list.appendChild(el('p', 'muted', 'Nothing on the list yet.'));
            return;
          }
          p.checklist.forEach(function (item) {
            var row = el('div', 'list-item' + (item.done ? ' done' : ''));
            var chk = button('check', '✓', item.text);
            chk.setAttribute('role', 'checkbox');
            chk.setAttribute('aria-checked', item.done ? 'true' : 'false');
            on(chk, 'click', function () {
              Store.toggleChecklistItem(p.id, item.id);
              fb('tap');
              refresh();
            });
            var del = button('item-del', '✕', 'Delete ' + item.text);
            on(del, 'click', function () {
              Store.deleteChecklistItem(p.id, item.id);
              refresh();
            });
            row.appendChild(chk);
            row.appendChild(el('span', 'item-text', item.text));
            row.appendChild(del);
            list.appendChild(row);
          });
        }

        function add() {
          if (!input.value.trim()) return;
          Store.addChecklistItem(p.id, input.value);
          input.value = '';
          refresh();
          input.focus();
        }
        on(addBtn, 'click', add);
        on(input, 'keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        });

        addRow.appendChild(input);
        addRow.appendChild(addBtn);

        body.appendChild(count);
        body.appendChild(list);
        body.appendChild(addRow);
        refresh();
      }
    });
  }

  function openNotesSheet(projectId) {
    var p = Store.project(projectId);
    if (!p) return;
    openSheet({
      title: 'Project notes',
      build: function (body) {
        var area = textArea(p.notes, '', 'Hook, yarn, pattern link, mods…');
        area.style.minHeight = '220px';
        var save = debounce(function () {
          Store.setNotes(p.id, area.value);
        }, 300);
        on(area, 'input', save);
        body.appendChild(field('Notes', area, 'Saves as you type.'));
      },
      onClose: function () {
        Store.flush();
      }
    });
  }

  function openPlacementSheet(projectId, partId) {
    var p = Store.project(projectId);
    var prt = Store.part(p, partId);
    if (!p || !prt) return;
    openSheet({
      title: 'Placement notes · ' + prt.name,
      build: function (body) {
        var area = textArea(prt.placementNotes, '', 'Eyes between rnd 8–9, 6 sts apart');
        area.style.minHeight = '180px';
        var save = debounce(function () {
          Store.updatePart(p.id, prt.id, { placementNotes: area.value });
        }, 400);
        on(area, 'input', save);
        body.appendChild(field('Where things go', area, 'Saves as you type.'));
      },
      onClose: function () {
        Store.flush();
        render();
      }
    });
  }

  function openAlertsSheet(projectId, partId) {
    var p = Store.project(projectId);
    var prt = Store.part(p, partId);
    if (!p || !prt) return;
    var input;
    openSheet({
      title: 'Stitch alerts · ' + prt.name,
      build: function (body) {
        input = textInput(prt.alerts.join(', '), '40, 80');
        body.appendChild(
          field('Buzz at stitch', input, 'Comma-separated stitch numbers within a row. Great for marking increases.')
        );
      },
      footer: [
        { text: 'Cancel', cls: 'btn ghost', onClick: function (api) { api.close(); } },
        {
          text: 'Save',
          cls: 'btn primary',
          onClick: function (api) {
            Store.updatePart(p.id, prt.id, { alerts: parseNumberList(input.value) });
            api.close();
            render();
          }
        }
      ]
    });
  }

  function openHistorySheet(projectId) {
    var p = Store.project(projectId);
    if (!p) return;
    openSheet({
      title: 'History',
      build: function (body, api) {
        if (!p.history.length) {
          body.appendChild(el('p', 'muted', 'No completed rows yet.'));
          return;
        }
        var list = el('div', 'list');
        for (var i = p.history.length - 1; i >= 0; i--) {
          var h = p.history[i];
          var row = el('div', 'hist-item');
          row.appendChild(el('span', null, h.partName + ' · ' + shortRowWord(p) + ' ' + h.row));
          row.appendChild(el('span', 'hist-when', fmtClock(h.ts)));
          list.appendChild(row);
        }
        body.appendChild(list);

        var clearBtn = button('btn danger block', 'Clear history');
        on(clearBtn, 'click', function () {
          confirmSheet({
            title: 'Clear history?',
            message: 'The row log is erased. Counters are not affected.',
            confirmText: 'Clear',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            Store.clearHistory(p.id);
            api.close();
          });
        });
        body.appendChild(clearBtn);
      }
    });
  }

  function openStatusSheet(projectId) {
    var p = Store.project(projectId);
    if (!p) return;
    openSheet({
      title: 'Project status',
      build: function (body, api) {
        var list = el('div', 'list');
        STATUS_INFO.forEach(function (s) {
          var b = button('status-opt' + (p.status === s.id ? ' on' : ''));
          b.appendChild(el('b', null, s.label));
          b.appendChild(el('span', null, s.desc));
          on(b, 'click', function () {
            Store.setStatus(p.id, s.id);
            if (s.id === 'finished') celebrate('project');
            api.close();
            render();
            toast('Status: ' + s.label);
          });
          list.appendChild(b);
        });
        body.appendChild(list);
      }
    });
  }

  function openMenuSheet(projectId) {
    var p = Store.project(projectId);
    if (!p) return;
    var items = [
      { icon: '🧩', label: 'Parts', run: function () { openPartsSheet(p.id); } },
      { icon: '✅', label: 'Checklist', run: function () { openChecklistSheet(p.id); } },
      { icon: '📝', label: 'Notes', run: function () { openNotesSheet(p.id); } },
      { icon: '🕘', label: 'History', run: function () { openHistorySheet(p.id); } },
      { icon: '🏷️', label: 'Status', run: function () { openStatusSheet(p.id); } },
      { icon: '📤', label: 'Export backup', run: function () { exportBackup(); } }
    ];
    openSheet({
      title: p.name,
      build: function (body, api) {
        var list = el('div', 'list');
        items.forEach(function (it) {
          var b = button('menu-item');
          b.appendChild(el('span', 'menu-icon', it.icon));
          b.appendChild(el('span', null, it.label));
          on(b, 'click', function () {
            api.close();
            it.run();
          });
          list.appendChild(b);
        });
        body.appendChild(list);
      }
    });
  }

  /* ================================================================== *
   * 19. Export / import
   * ================================================================== */

  function backupFilename() {
    var d = new Date();
    return 'stitchkeeper-backup-' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.json';
  }

  function backupBlob() {
    Store.flush();
    return new Blob([Store.exportJSON()], { type: 'application/json' });
  }

  function exportBackup() {
    try {
      var name = backupFilename();
      var url = URL.createObjectURL(backupBlob());
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1500);
      toast('Backup downloaded');
    } catch (e) {
      toast('Could not create the backup file');
    }
  }

  function canShareBackup() {
    if (!navigator.share || !navigator.canShare || typeof window.File !== 'function') return false;
    try {
      var probe = new File([new Blob(['{}'], { type: 'application/json' })], 'probe.json', {
        type: 'application/json'
      });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  function shareBackup() {
    try {
      var file = new File([backupBlob()], backupFilename(), { type: 'application/json' });
      navigator.share({ files: [file], title: 'Stitchkeeper backup' }).catch(noop);
    } catch (e) {
      exportBackup();
    }
  }

  function importBackup() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    on(input, 'change', function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var n = Store.importJSON(String(reader.result));
          applyTheme(Store.settings().theme, false);
          render();
          toast('Imported ' + n + ' project' + (n === 1 ? '' : 's'));
        } catch (err) {
          toast(err && err.message ? err.message : 'Import failed');
        }
      };
      reader.onerror = function () {
        toast('Could not read that file');
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ================================================================== *
   * 20. Settings sheet
   * ================================================================== */

  function themeCard(t, currentId, onPick) {
    var card = button('theme-card' + (t.id === currentId ? ' on' : ''));
    card.setAttribute('aria-pressed', t.id === currentId ? 'true' : 'false');
    var sw = el('div', 'swatches');
    (Array.isArray(t.swatches) ? t.swatches : []).slice(0, 4).forEach(function (c) {
      var s = el('span', 'swatch');
      s.style.background = c;
      sw.appendChild(s);
    });
    card.appendChild(sw);
    card.appendChild(el('div', 'theme-name', (t.emoji ? t.emoji + ' ' : '') + (t.name || t.id)));
    if (t.tagline) card.appendChild(el('div', 'theme-tagline', t.tagline));
    on(card, 'click', function () {
      onPick(t.id);
    });
    return card;
  }

  function openSettingsSheet() {
    openSheet({
      title: 'Settings',
      build: function (body) {
        /* ---- Themes ---- */
        var themes = themeList();
        var themeWrap = el('div', 'field');
        themeWrap.appendChild(el('div', 'field-label', 'Theme'));
        if (!themes.length) {
          themeWrap.appendChild(el('p', 'muted', 'Themes are unavailable right now.'));
        } else {
          var groups = [
            { id: 'stardew', label: 'Stardew' },
            { id: 'dragon', label: 'Dragon' }
          ];
          var seen = {};
          function pick(id) {
            applyTheme(id);
            // refresh selection highlight
            Array.prototype.forEach.call(themeWrap.querySelectorAll('.theme-card'), function (c) {
              var on2 = c.getAttribute('data-theme-id') === id;
              c.classList.toggle('on', on2);
              c.setAttribute('aria-pressed', on2 ? 'true' : 'false');
            });
            fb('tap');
          }
          groups.forEach(function (g) {
            var inGroup = themes.filter(function (t) { return t.group === g.id; });
            if (!inGroup.length) return;
            themeWrap.appendChild(el('div', 'group-title', g.label));
            var grid = el('div', 'theme-grid');
            inGroup.forEach(function (t) {
              seen[t.id] = true;
              var c = themeCard(t, Store.settings().theme, pick);
              c.setAttribute('data-theme-id', t.id);
              grid.appendChild(c);
            });
            themeWrap.appendChild(grid);
          });
          var rest = themes.filter(function (t) { return !seen[t.id]; });
          if (rest.length) {
            themeWrap.appendChild(el('div', 'group-title', 'More'));
            var grid2 = el('div', 'theme-grid');
            rest.forEach(function (t) {
              var c2 = themeCard(t, Store.settings().theme, pick);
              c2.setAttribute('data-theme-id', t.id);
              grid2.appendChild(c2);
            });
            themeWrap.appendChild(grid2);
          }
        }
        body.appendChild(themeWrap);

        /* ---- Toggles ---- */
        var s = Store.settings();
        var toggles = el('div', 'field');
        toggles.appendChild(el('div', 'field-label', 'Feedback'));
        toggles.appendChild(
          switchRow('Haptics', 'Vibrate on taps and milestones.', s.haptics, function (v) {
            Store.setSetting('haptics', v);
            if (v) fb('tap');
          })
        );
        toggles.appendChild(
          switchRow('Sounds', 'Little synthesized clicks and chimes.', s.sounds, function (v) {
            Store.setSetting('sounds', v);
            if (v) fb('tap');
          })
        );
        toggles.appendChild(
          switchRow('Auto-advance rows', 'Complete the row when the pattern stitch count is reached.', s.autoAdvance, function (v) {
            Store.setSetting('autoAdvance', v);
          })
        );
        if (wakeSupported) {
          toggles.appendChild(
            switchRow('Keep screen awake', 'While a project is open.', s.keepAwake, function (v) {
              Store.setSetting('keepAwake', v);
              syncWakeLock();
              render();
            })
          );
        }
        body.appendChild(toggles);

        /* ---- Backup ---- */
        var backup = el('div', 'field');
        backup.appendChild(el('div', 'field-label', 'Backup'));
        var exp = button('btn block', '📥 Download backup');
        on(exp, 'click', exportBackup);
        backup.appendChild(exp);
        if (canShareBackup()) {
          var shareBtn = button('btn block', '📤 Share backup');
          on(shareBtn, 'click', shareBackup);
          backup.appendChild(shareBtn);
        }
        var imp = button('btn block', '📂 Import backup');
        on(imp, 'click', importBackup);
        backup.appendChild(imp);
        backup.appendChild(el('div', 'field-hint', 'Backups merge by project id — imported projects win.'));
        body.appendChild(backup);

        /* ---- About ---- */
        var about = el('div', 'field');
        about.appendChild(el('div', 'field-label', 'About'));
        about.appendChild(el('p', 'muted', 'Stitchkeeper v' + APP_VERSION + ' · everything stays on this device.'));
        body.appendChild(about);
      }
    });
  }

  /* ================================================================== *
   * 21. Static event wiring
   * ================================================================== */

  function bindEvents() {
    // Home
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="new-project"]'), function (b) {
      on(b, 'click', function () {
        openProjectEditor(null);
      });
    });
    on($('#btn-settings'), 'click', openSettingsSheet);
    on(els.finishedToggle, 'click', function () {
      finishedOpen = !finishedOpen;
      renderHome();
    });

    // Project header
    on($('#p-back'), 'click', goHome);
    on($('#p-title'), 'click', function () {
      var p = currentProject();
      if (p) openProjectEditor(p.id);
    });
    on(els.pTimer, 'click', function () {
      var p = currentProject();
      if (!p) return;
      Store.toggleTimer(p.id);
      updateTimerChip(p);
      fb('tap');
    });
    on($('#p-menu'), 'click', function () {
      var p = currentProject();
      if (p) openMenuSheet(p.id);
    });

    // Row controls
    on($('#row-plus'), 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (!p || !prt) return;
      applyResult(Store.tapRow(p.id, prt.id));
    });
    on($('#row-minus'), 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (!p || !prt) return;
      Store.untapRow(p.id, prt.id);
      fb('undo');
      render();
      announce(rowWord(p) + ' ' + Store.activePart(p).row);
    });

    // Pattern line
    on(els.patternLine, 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (p && prt) openPatternSheet(p.id, prt.id);
    });

    // Stitch controls
    bindStitchButton();
    on($('#stitch-minus'), 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (!p || !prt) return;
      Store.untapStitch(p.id, prt.id);
      fb('undo');
      updateCounters(p, Store.activePart(p));
      updateBottomBar(p, Store.activePart(p));
    });
    on($('#stitch-reset'), 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (!p || !prt) return;
      Store.resetStitches(p.id, prt.id);
      fb('undo');
      render();
      toast('Stitches reset');
    });

    // Bottom bar
    on(els.btnUndo, 'click', function () {
      if (Store.undo()) {
        fb('undo');
        render();
        toast('Undone');
      }
    });
    on(els.btnWake, 'click', function () {
      var next = !Store.settings().keepAwake;
      Store.setSetting('keepAwake', next);
      syncWakeLock();
      var p = currentProject();
      if (p) updateBottomBar(p, Store.activePart(p));
      toast(next ? 'Screen will stay awake' : 'Screen can sleep again');
    });
    on(els.btnAlerts, 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (p && prt) openAlertsSheet(p.id, prt.id);
    });
    on(els.btnPlace, 'click', function () {
      var p = currentProject();
      var prt = currentPart();
      if (p && prt) openPlacementSheet(p.id, prt.id);
    });

    // Persistence + wake lock lifecycle
    on(document, 'visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        Store.flush();
      } else {
        syncWakeLock();
        render();
      }
    });
    window.addEventListener('pagehide', function () {
      Store.flush();
    });
    window.addEventListener('beforeunload', function () {
      Store.flush();
    });
  }

  /* ================================================================== *
   * 22. Timer ticking
   * ================================================================== */

  function tick() {
    var p = currentProject();
    if (p && !els.project.hidden) {
      if (p.timer && p.timer.runningSince) updateTimerChip(p);
      return;
    }
    // Home: keep running project cards ticking without a full re-render.
    var nodes = document.querySelectorAll('[data-timer-project]');
    for (var i = 0; i < nodes.length; i++) {
      var proj = Store.project(nodes[i].getAttribute('data-timer-project'));
      if (proj && proj.timer && proj.timer.runningSince) {
        nodes[i].textContent = fmtDuration(Store.elapsedMs(proj));
      }
    }
  }

  /* ================================================================== *
   * 23. Boot
   * ================================================================== */

  function init() {
    cacheEls();
    Store.load();

    if (window.Feedback && typeof window.Feedback.init === 'function') {
      window.Feedback.init(function () {
        return Store.settings();
      });
    }

    applyTheme(Store.settings().theme, false);
    bindEvents();
    render();
    window.setInterval(tick, 1000);
  }

  window.App = {
    init: init,
    render: render,
    toast: toast,
    confirmSheet: confirmSheet,
    openSheet: openSheet,
    applyTheme: applyTheme,
    version: APP_VERSION
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
