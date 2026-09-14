/* Stitchkeeper — js/store.js
 * window.Store : state, persistence (localStorage), counting semantics,
 * undo stack, timers, templates, export/import.
 * Pure data layer — never touches the DOM.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var KEY = 'stitchkeeper.v1';
  var VERSION = 1;
  var UNDO_CAP = 50;
  var HISTORY_CAP = 500;
  var SAVE_DEBOUNCE = 150;

  var state = null;
  var undoStack = [];
  var saveTimer = null;
  var lineCache = Object.create(null); // partId -> { text, lines }

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */

  function now() { return Date.now(); }

  function uid() {
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).slice(2, 6)
    );
  }

  function clampInt(v, min, max, dflt) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    if (typeof n !== 'number' || !isFinite(n)) return dflt;
    n = Math.floor(n);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function str(v, dflt) {
    return typeof v === 'string' ? v : dflt;
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ------------------------------------------------------------------ *
   * Templates
   * ------------------------------------------------------------------ */

  var TEMPLATES = [
    {
      id: 'blank',
      name: 'Single piece',
      emoji: '🧶',
      countMode: 'rows',
      parts: [{ name: 'Main', makeCount: 1 }],
      checklist: []
    },
    {
      id: 'blob',
      name: 'Blobby animal',
      emoji: '🐑',
      countMode: 'rounds',
      parts: [
        { name: 'Body', makeCount: 1 },
        { name: 'Head', makeCount: 1 },
        { name: 'Ears', makeCount: 2 },
        { name: 'Legs', makeCount: 4 },
        { name: 'Tail', makeCount: 1 }
      ],
      checklist: [
        'Stuff body',
        'Stuff head',
        'Sew head to body',
        'Attach safety eyes',
        'Sew ears',
        'Sew legs',
        'Sew tail',
        'Embroider face'
      ]
    },
    {
      id: 'dragon',
      name: 'Dragon',
      emoji: '🐉',
      countMode: 'rounds',
      parts: [
        { name: 'Body', makeCount: 1 },
        { name: 'Head', makeCount: 1 },
        { name: 'Wings', makeCount: 2 },
        { name: 'Legs', makeCount: 4 },
        { name: 'Tail', makeCount: 1 },
        { name: 'Horns', makeCount: 2 },
        { name: 'Spikes', makeCount: 1 }
      ],
      checklist: [
        'Stuff body',
        'Stuff head',
        'Sew head to body',
        'Attach safety eyes',
        'Sew wings',
        'Sew legs',
        'Sew tail',
        'Sew horns',
        'Sew spikes down back',
        'Embroider nostrils'
      ]
    },
    {
      id: 'garment',
      name: 'Garment',
      emoji: '🧥',
      countMode: 'rows',
      parts: [
        { name: 'Front', makeCount: 1 },
        { name: 'Back', makeCount: 1 },
        { name: 'Sleeves', makeCount: 2 }
      ],
      checklist: [
        'Block pieces',
        'Seam shoulders',
        'Set in sleeves',
        'Seam sides',
        'Weave in ends'
      ]
    },
    {
      id: 'blanket',
      name: 'Blanket / scarf',
      emoji: '🧣',
      countMode: 'rows',
      parts: [{ name: 'Main', makeCount: 1 }],
      checklist: ['Weave in ends', 'Add border', 'Block']
    }
  ];

  function templateById(id) {
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].id === id) return TEMPLATES[i];
    }
    return TEMPLATES[0];
  }

  /* ------------------------------------------------------------------ *
   * Factories + normalisation
   * ------------------------------------------------------------------ */

  function makePart(name, makeCount) {
    return {
      id: uid(),
      name: name || 'Main',
      makeCount: clampInt(makeCount, 1, 99, 1),
      piecesDone: 0,
      row: 0,
      stitch: 0,
      targetRows: null,
      repeat: { enabled: false, startRow: 1, endRow: 1, times: 1 },
      alerts: [],
      placementNotes: '',
      patternText: ''
    };
  }

  function normalizePart(p) {
    p = p && typeof p === 'object' ? p : {};
    var rep = p.repeat && typeof p.repeat === 'object' ? p.repeat : {};
    var alerts = [];
    if (Array.isArray(p.alerts)) {
      for (var i = 0; i < p.alerts.length; i++) {
        var n = clampInt(p.alerts[i], 1, 99999, 0);
        if (n > 0 && alerts.indexOf(n) === -1) alerts.push(n);
      }
      alerts.sort(function (a, b) { return a - b; });
    }
    return {
      id: str(p.id, '') || uid(),
      name: str(p.name, '') || 'Main',
      makeCount: clampInt(p.makeCount, 1, 99, 1),
      piecesDone: clampInt(p.piecesDone, 0, 99, 0),
      row: clampInt(p.row, 0, 999999, 0),
      stitch: clampInt(p.stitch, 0, 999999, 0),
      targetRows:
        p.targetRows === null || p.targetRows === undefined || p.targetRows === ''
          ? null
          : clampInt(p.targetRows, 1, 999999, 0) || null,
      repeat: {
        enabled: !!rep.enabled,
        startRow: clampInt(rep.startRow, 1, 999999, 1),
        endRow: clampInt(rep.endRow, 1, 999999, 1),
        times: clampInt(rep.times, 1, 9999, 1)
      },
      alerts: alerts,
      placementNotes: str(p.placementNotes, ''),
      patternText: str(p.patternText, '')
    };
  }

  function normalizeProject(p) {
    p = p && typeof p === 'object' ? p : {};
    var parts = Array.isArray(p.parts) ? p.parts.map(normalizePart) : [];
    if (!parts.length) parts = [makePart('Main', 1)];

    var status = p.status;
    if (['active', 'paused', 'finished', 'frogged'].indexOf(status) === -1) status = 'active';

    var timer = p.timer && typeof p.timer === 'object' ? p.timer : {};
    var checklist = [];
    if (Array.isArray(p.checklist)) {
      for (var i = 0; i < p.checklist.length; i++) {
        var c = p.checklist[i];
        if (!c || typeof c !== 'object') continue;
        checklist.push({
          id: str(c.id, '') || uid(),
          text: str(c.text, ''),
          done: !!c.done
        });
      }
    }
    var history = [];
    if (Array.isArray(p.history)) {
      for (var j = 0; j < p.history.length; j++) {
        var h = p.history[j];
        if (!h || typeof h !== 'object') continue;
        history.push({
          ts: clampInt(h.ts, 0, 1e15, 0),
          partId: str(h.partId, ''),
          partName: str(h.partName, ''),
          row: clampInt(h.row, 0, 999999, 0)
        });
      }
      if (history.length > HISTORY_CAP) history = history.slice(history.length - HISTORY_CAP);
    }

    var activePartId = str(p.activePartId, '');
    var found = false;
    for (var k = 0; k < parts.length; k++) if (parts[k].id === activePartId) found = true;
    if (!found) activePartId = parts[0].id;

    return {
      id: str(p.id, '') || uid(),
      name: str(p.name, '') || 'Untitled project',
      emoji: str(p.emoji, '') || '🧶',
      status: status,
      createdAt: clampInt(p.createdAt, 0, 1e15, 0) || now(),
      updatedAt: clampInt(p.updatedAt, 0, 1e15, 0) || now(),
      finishedAt: p.finishedAt ? clampInt(p.finishedAt, 0, 1e15, 0) : null,
      countMode: p.countMode === 'rounds' ? 'rounds' : 'rows',
      groupSize: clampInt(p.groupSize, 1, 50, 10),
      notes: str(p.notes, ''),
      timer: {
        totalMs: clampInt(timer.totalMs, 0, 1e15, 0),
        runningSince: timer.runningSince ? clampInt(timer.runningSince, 0, 1e15, 0) : null
      },
      parts: parts,
      activePartId: activePartId,
      checklist: checklist,
      history: history
    };
  }

  function defaultState() {
    return {
      version: VERSION,
      settings: {
        theme: 'stardew-spring',
        haptics: true,
        sounds: true,
        keepAwake: false,
        autoAdvance: true
      },
      projects: [],
      activeProjectId: null
    };
  }

  function normalizeState(raw) {
    var d = defaultState();
    if (!raw || typeof raw !== 'object') return d;
    var s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    var out = {
      version: VERSION,
      settings: {
        theme: str(s.theme, '') || d.settings.theme,
        haptics: s.haptics === undefined ? true : !!s.haptics,
        sounds: s.sounds === undefined ? true : !!s.sounds,
        keepAwake: !!s.keepAwake,
        autoAdvance: s.autoAdvance === undefined ? true : !!s.autoAdvance
      },
      projects: Array.isArray(raw.projects) ? raw.projects.map(normalizeProject) : [],
      activeProjectId: str(raw.activeProjectId, '') || null
    };
    // Only one timer may run at a time.
    var running = false;
    for (var i = 0; i < out.projects.length; i++) {
      var t = out.projects[i].timer;
      if (t.runningSince) {
        if (running) {
          t.totalMs += Math.max(0, now() - t.runningSince);
          t.runningSince = null;
        } else {
          running = true;
        }
      }
    }
    // Active project must exist.
    if (out.activeProjectId && !findProject(out.projects, out.activeProjectId)) {
      out.activeProjectId = null;
    }
    return out;
  }

  function findProject(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */

  function load() {
    var raw = null;
    try {
      var txt = window.localStorage.getItem(KEY);
      if (txt) raw = JSON.parse(txt);
    } catch (e) {
      raw = null;
    }
    state = normalizeState(raw);
    lineCache = Object.create(null);
    return state;
  }

  function writeNow() {
    saveTimer = null;
    if (!state) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* quota / private mode — nothing useful to do */
    }
  }

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, SAVE_DEBOUNCE);
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeNow();
  }

  function touch(project) {
    if (project) project.updatedAt = now();
    save();
  }

  /* ------------------------------------------------------------------ *
   * Lookup helpers
   * ------------------------------------------------------------------ */

  function getState() {
    if (!state) load();
    return state;
  }

  function settings() {
    return getState().settings;
  }

  function setSetting(key, value) {
    var s = settings();
    if (!(key in s)) return;
    s[key] = value;
    save();
  }

  function projects() {
    return getState().projects;
  }

  function project(id) {
    if (!id) return null;
    return findProject(projects(), id);
  }

  function part(proj, partId) {
    if (!proj) return null;
    for (var i = 0; i < proj.parts.length; i++) {
      if (proj.parts[i].id === partId) return proj.parts[i];
    }
    return null;
  }

  function activePart(proj) {
    if (!proj) return null;
    return part(proj, proj.activePartId) || proj.parts[0] || null;
  }

  /* ------------------------------------------------------------------ *
   * Undo stack (in memory only)
   * ------------------------------------------------------------------ */

  function snapshot(proj) {
    if (!proj) return;
    var list = projects();
    undoStack.push({
      id: proj.id,
      index: list.indexOf(proj),
      data: deepCopy(proj),
      activeProjectId: getState().activeProjectId
    });
    if (undoStack.length > UNDO_CAP) undoStack.shift();
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function undo() {
    var entry = undoStack.pop();
    if (!entry) return false;
    var list = projects();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === entry.id) idx = i;
    if (idx >= 0) {
      list[idx] = entry.data;
    } else {
      var at = entry.index;
      if (at < 0 || at > list.length) at = list.length;
      list.splice(at, 0, entry.data);
    }
    if (entry.activeProjectId !== undefined) {
      getState().activeProjectId = entry.activeProjectId;
    }
    lineCache = Object.create(null);
    save();
    return true;
  }

  function clearUndo() {
    undoStack.length = 0;
  }

  /* ------------------------------------------------------------------ *
   * Pattern bridge (defensive — window.Patterns may be missing)
   * ------------------------------------------------------------------ */

  function patternsApi() {
    return window.Patterns && typeof window.Patterns === 'object' ? window.Patterns : null;
  }

  function linesFor(prt) {
    if (!prt) return [];
    var text = prt.patternText || '';
    if (!text.replace(/\s/g, '')) return [];
    var cached = lineCache[prt.id];
    if (cached && cached.text === text) return cached.lines;
    var lines = [];
    var api = patternsApi();
    if (api && typeof api.parse === 'function') {
      try {
        var out = api.parse(text);
        if (Array.isArray(out)) lines = out;
      } catch (e) {
        lines = [];
      }
    }
    lineCache[prt.id] = { text: text, lines: lines };
    return lines;
  }

  function patternSummary(prt) {
    var lines = linesFor(prt);
    var api = patternsApi();
    if (!lines.length || !api || typeof api.summary !== 'function') {
      return { rows: 0, maxRow: null, hasTargets: false };
    }
    try {
      var s = api.summary(lines);
      if (s && typeof s === 'object') return s;
    } catch (e) {
      /* fall through */
    }
    return { rows: 0, maxRow: null, hasTargets: false };
  }

  function lineForRow(prt, rowNumber) {
    var lines = linesFor(prt);
    var api = patternsApi();
    if (!lines.length || !api || typeof api.lineFor !== 'function') return null;
    try {
      return api.lineFor(lines, rowNumber) || null;
    } catch (e) {
      return null;
    }
  }

  function targetFor(prt, rowNumber) {
    var lines = linesFor(prt);
    var api = patternsApi();
    if (!lines.length || !api || typeof api.targetFor !== 'function') return null;
    try {
      var t = api.targetFor(lines, rowNumber);
      if (typeof t === 'number' && isFinite(t) && t > 0) return Math.floor(t);
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Repeat math
   * ------------------------------------------------------------------ */

  function repeatInfo(prt) {
    var r = prt && prt.repeat ? prt.repeat : null;
    var workingRow = (prt ? prt.row : 0) + 1;
    var out = {
      inside: false,
      k: 0,
      j: 0,
      len: 0,
      times: r ? r.times : 0,
      patternRow: workingRow,
      workingRow: workingRow
    };
    if (!r || !r.enabled) return out;
    var len = r.endRow - r.startRow + 1;
    out.len = len;
    if (len <= 0 || r.times < 1) return out;
    var span = len * r.times;
    if (workingRow >= r.startRow && workingRow < r.startRow + span) {
      out.inside = true;
      out.k = Math.floor((workingRow - r.startRow) / len) + 1;
      out.j = ((workingRow - r.startRow) % len) + 1;
      out.patternRow = r.startRow + out.j - 1;
    }
    return out;
  }

  /** Stitch target for the row currently being worked on this part. */
  function currentTarget(prt) {
    if (!prt) return null;
    return targetFor(prt, repeatInfo(prt).patternRow);
  }

  /* ------------------------------------------------------------------ *
   * Counting
   * ------------------------------------------------------------------ */

  function pushHistory(proj, prt) {
    proj.history.push({
      ts: now(),
      partId: prt.id,
      partName: prt.name,
      row: prt.row
    });
    if (proj.history.length > HISTORY_CAP) {
      proj.history.splice(0, proj.history.length - HISTORY_CAP);
    }
  }

  /** True when every targeted part is finished (and at least one has a target). */
  function allPartsDone(proj) {
    var any = false;
    for (var i = 0; i < proj.parts.length; i++) {
      var p = proj.parts[i];
      if (!p.targetRows) continue;
      any = true;
      if (p.piecesDone < p.makeCount) return false;
    }
    return any;
  }

  /** Shared row-completion logic used by tapRow and auto-advance. */
  function completeRow(proj, prt) {
    prt.row += 1;
    prt.stitch = 0;
    pushHistory(proj, prt);

    if (prt.targetRows && prt.row >= prt.targetRows) {
      if (prt.piecesDone + 1 < prt.makeCount) {
        prt.piecesDone += 1;
        prt.row = 0;
        return {
          event: 'pieceDone',
          piecesDone: prt.piecesDone,
          makeCount: prt.makeCount,
          partName: prt.name
        };
      }
      prt.piecesDone = prt.makeCount;
      if (allPartsDone(proj)) return { event: 'projectDone', partName: prt.name };
      return { event: 'partDone', partName: prt.name };
    }
    return { event: 'row', row: prt.row };
  }

  function tapStitch(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return { event: 'none' };
    snapshot(proj);

    prt.stitch += 1;
    var s = prt.stitch;

    var target = currentTarget(prt);
    if (target && s >= target && settings().autoAdvance) {
      var res = completeRow(proj, prt);
      touch(proj);
      // Plain row completions report as 'rowAuto'; bigger milestones win.
      if (res.event === 'row') return { event: 'rowAuto', row: prt.row };
      return res;
    }

    touch(proj);

    // Stitch alerts take priority over group boundaries: alerts are explicit,
    // hand-entered stitch numbers and frequently land on a group multiple.
    if (prt.alerts && prt.alerts.indexOf(s) !== -1) {
      return { event: 'alert', stitch: s };
    }
    var g = proj.groupSize > 0 ? proj.groupSize : 10;
    if (s % g === 0) return { event: 'group', stitch: s, group: s / g };
    return { event: 'stitch', stitch: s };
  }

  function untapStitch(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return { event: 'none' };
    snapshot(proj);
    prt.stitch = Math.max(0, prt.stitch - 1);
    touch(proj);
    return { event: 'stitch', stitch: prt.stitch };
  }

  function resetStitches(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return { event: 'none' };
    snapshot(proj);
    prt.stitch = 0;
    touch(proj);
    return { event: 'stitch', stitch: 0 };
  }

  function tapRow(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return { event: 'none' };
    snapshot(proj);
    var res = completeRow(proj, prt);
    touch(proj);
    return res;
  }

  function untapRow(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return { event: 'none' };
    snapshot(proj);
    prt.row = Math.max(0, prt.row - 1);
    prt.stitch = 0;
    var last = proj.history[proj.history.length - 1];
    if (last && last.partId === prt.id) proj.history.pop();
    touch(proj);
    return { event: 'row', row: prt.row };
  }

  function jumpToRow(projectId, partId, rowNumber) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return { event: 'none' };
    snapshot(proj);
    // "Jump to row 7" means row 7 is the one being worked → 6 completed.
    prt.row = Math.max(0, clampInt(rowNumber, 1, 999999, 1) - 1);
    prt.stitch = 0;
    touch(proj);
    return { event: 'row', row: prt.row };
  }

  function resetPart(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return false;
    snapshot(proj);
    prt.row = 0;
    prt.stitch = 0;
    touch(proj);
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Projects
   * ------------------------------------------------------------------ */

  function createProject(opts) {
    opts = opts || {};
    var tpl = templateById(opts.templateId || 'blank');
    var proj = normalizeProject({
      id: uid(),
      name: (opts.name || '').trim() || tpl.name,
      emoji: opts.emoji || tpl.emoji,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
      finishedAt: null,
      countMode: opts.countMode === 'rounds' || opts.countMode === 'rows' ? opts.countMode : tpl.countMode,
      groupSize: clampInt(opts.groupSize, 1, 50, 10),
      notes: str(opts.notes, ''),
      timer: { totalMs: 0, runningSince: null },
      parts: tpl.parts.map(function (p) { return makePart(p.name, p.makeCount); }),
      checklist: tpl.checklist.map(function (t) { return { id: uid(), text: t, done: false }; }),
      history: []
    });
    projects().push(proj);
    save();
    return proj;
  }

  function updateProject(projectId, patch) {
    var proj = project(projectId);
    if (!proj || !patch) return null;
    if (typeof patch.name === 'string') proj.name = patch.name.trim() || proj.name;
    if (typeof patch.emoji === 'string' && patch.emoji) proj.emoji = patch.emoji;
    if (patch.countMode === 'rows' || patch.countMode === 'rounds') proj.countMode = patch.countMode;
    if (patch.groupSize !== undefined) proj.groupSize = clampInt(patch.groupSize, 1, 50, proj.groupSize);
    if (typeof patch.notes === 'string') proj.notes = patch.notes;
    touch(proj);
    return proj;
  }

  function setStatus(projectId, status) {
    var proj = project(projectId);
    if (!proj) return null;
    if (['active', 'paused', 'finished', 'frogged'].indexOf(status) === -1) return proj;
    proj.status = status;
    if (status === 'finished') {
      if (!proj.finishedAt) proj.finishedAt = now();
    } else {
      proj.finishedAt = null;
    }
    if (status !== 'active' && proj.timer.runningSince) {
      proj.timer.totalMs += Math.max(0, now() - proj.timer.runningSince);
      proj.timer.runningSince = null;
    }
    touch(proj);
    return proj;
  }

  function deleteProject(projectId) {
    var proj = project(projectId);
    if (!proj) return false;
    snapshot(proj);
    var list = projects();
    list.splice(list.indexOf(proj), 1);
    if (getState().activeProjectId === projectId) getState().activeProjectId = null;
    save();
    return true;
  }

  function setActiveProject(projectId) {
    getState().activeProjectId = projectId || null;
    save();
  }

  /* ------------------------------------------------------------------ *
   * Parts
   * ------------------------------------------------------------------ */

  function addPart(projectId, opts) {
    var proj = project(projectId);
    if (!proj) return null;
    opts = opts || {};
    snapshot(proj);
    var prt = makePart((opts.name || '').trim() || 'Part ' + (proj.parts.length + 1), opts.makeCount);
    proj.parts.push(prt);
    proj.activePartId = prt.id;
    touch(proj);
    return prt;
  }

  function updatePart(projectId, partId, patch) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt || !patch) return null;
    snapshot(proj);
    if (typeof patch.name === 'string') prt.name = patch.name.trim() || prt.name;
    if (patch.makeCount !== undefined) {
      prt.makeCount = clampInt(patch.makeCount, 1, 99, prt.makeCount);
      if (prt.piecesDone > prt.makeCount) prt.piecesDone = prt.makeCount;
    }
    if (patch.targetRows !== undefined) {
      prt.targetRows =
        patch.targetRows === null || patch.targetRows === '' ? null : clampInt(patch.targetRows, 1, 999999, 0) || null;
    }
    if (patch.repeat) {
      prt.repeat = {
        enabled: !!patch.repeat.enabled,
        startRow: clampInt(patch.repeat.startRow, 1, 999999, prt.repeat.startRow),
        endRow: clampInt(patch.repeat.endRow, 1, 999999, prt.repeat.endRow),
        times: clampInt(patch.repeat.times, 1, 9999, prt.repeat.times)
      };
    }
    if (patch.alerts !== undefined) {
      var alerts = [];
      var src = Array.isArray(patch.alerts) ? patch.alerts : [];
      for (var i = 0; i < src.length; i++) {
        var n = clampInt(src[i], 1, 99999, 0);
        if (n > 0 && alerts.indexOf(n) === -1) alerts.push(n);
      }
      alerts.sort(function (a, b) { return a - b; });
      prt.alerts = alerts;
    }
    if (typeof patch.placementNotes === 'string') prt.placementNotes = patch.placementNotes;
    if (typeof patch.patternText === 'string') prt.patternText = patch.patternText;
    if (patch.piecesDone !== undefined) prt.piecesDone = clampInt(patch.piecesDone, 0, prt.makeCount, prt.piecesDone);
    touch(proj);
    return prt;
  }

  function deletePart(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt || proj.parts.length <= 1) return false;
    snapshot(proj);
    proj.parts.splice(proj.parts.indexOf(prt), 1);
    if (proj.activePartId === partId) proj.activePartId = proj.parts[0].id;
    delete lineCache[partId];
    touch(proj);
    return true;
  }

  function setActivePart(projectId, partId) {
    var proj = project(projectId);
    var prt = part(proj, partId);
    if (!proj || !prt) return false;
    proj.activePartId = partId;
    touch(proj);
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Checklist / notes / history
   * ------------------------------------------------------------------ */

  function addChecklistItem(projectId, text) {
    var proj = project(projectId);
    if (!proj) return null;
    text = (text || '').trim();
    if (!text) return null;
    var item = { id: uid(), text: text, done: false };
    proj.checklist.push(item);
    touch(proj);
    return item;
  }

  function toggleChecklistItem(projectId, itemId) {
    var proj = project(projectId);
    if (!proj) return false;
    for (var i = 0; i < proj.checklist.length; i++) {
      if (proj.checklist[i].id === itemId) {
        proj.checklist[i].done = !proj.checklist[i].done;
        touch(proj);
        return true;
      }
    }
    return false;
  }

  function deleteChecklistItem(projectId, itemId) {
    var proj = project(projectId);
    if (!proj) return false;
    for (var i = 0; i < proj.checklist.length; i++) {
      if (proj.checklist[i].id === itemId) {
        proj.checklist.splice(i, 1);
        touch(proj);
        return true;
      }
    }
    return false;
  }

  function setNotes(projectId, notes) {
    var proj = project(projectId);
    if (!proj) return false;
    proj.notes = typeof notes === 'string' ? notes : '';
    touch(proj);
    return true;
  }

  function clearHistory(projectId) {
    var proj = project(projectId);
    if (!proj) return false;
    proj.history.length = 0;
    touch(proj);
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Timer
   * ------------------------------------------------------------------ */

  function stopAllTimers(exceptId) {
    var list = projects();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.id === exceptId) continue;
      if (p.timer.runningSince) {
        p.timer.totalMs += Math.max(0, now() - p.timer.runningSince);
        p.timer.runningSince = null;
      }
    }
  }

  function toggleTimer(projectId) {
    var proj = project(projectId);
    if (!proj) return false;
    if (proj.timer.runningSince) {
      proj.timer.totalMs += Math.max(0, now() - proj.timer.runningSince);
      proj.timer.runningSince = null;
    } else {
      stopAllTimers(projectId);
      proj.timer.runningSince = now();
    }
    touch(proj);
    return !!proj.timer.runningSince;
  }

  function elapsedMs(proj) {
    if (!proj || !proj.timer) return 0;
    return proj.timer.totalMs + (proj.timer.runningSince ? Math.max(0, now() - proj.timer.runningSince) : 0);
  }

  /* ------------------------------------------------------------------ *
   * Export / import
   * ------------------------------------------------------------------ */

  function exportJSON() {
    return JSON.stringify(getState(), null, 2);
  }

  function importJSON(text) {
    var raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not valid JSON.');
    }
    if (!raw || typeof raw !== 'object') throw new Error('That file is not a Stitchkeeper backup.');
    if (raw.version !== VERSION) throw new Error('Unsupported backup version: ' + raw.version);
    if (!Array.isArray(raw.projects)) throw new Error('That backup has no projects.');

    var list = projects();
    var count = 0;
    for (var i = 0; i < raw.projects.length; i++) {
      var incoming = normalizeProject(raw.projects[i]);
      var existing = findProject(list, incoming.id);
      if (existing) {
        list[list.indexOf(existing)] = incoming; // imported wins
      } else {
        list.push(incoming);
      }
      count++;
    }
    lineCache = Object.create(null);
    clearUndo();
    flush();
    return count;
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  window.Store = {
    KEY: KEY,
    VERSION: VERSION,
    templates: TEMPLATES,

    // persistence
    load: load,
    save: save,
    flush: flush,
    getState: getState,
    settings: settings,
    setSetting: setSetting,

    // lookup
    projects: projects,
    project: project,
    part: part,
    activePart: activePart,

    // projects
    createProject: createProject,
    updateProject: updateProject,
    setStatus: setStatus,
    deleteProject: deleteProject,
    setActiveProject: setActiveProject,

    // parts
    addPart: addPart,
    updatePart: updatePart,
    deletePart: deletePart,
    setActivePart: setActivePart,
    resetPart: resetPart,

    // counting
    tapStitch: tapStitch,
    untapStitch: untapStitch,
    resetStitches: resetStitches,
    tapRow: tapRow,
    untapRow: untapRow,
    jumpToRow: jumpToRow,

    // pattern bridge
    linesFor: linesFor,
    lineForRow: lineForRow,
    targetFor: targetFor,
    currentTarget: currentTarget,
    patternSummary: patternSummary,
    repeatInfo: repeatInfo,

    // checklist / notes / history
    addChecklistItem: addChecklistItem,
    toggleChecklistItem: toggleChecklistItem,
    deleteChecklistItem: deleteChecklistItem,
    setNotes: setNotes,
    clearHistory: clearHistory,

    // timer
    toggleTimer: toggleTimer,
    elapsedMs: elapsedMs,
    stopAllTimers: stopAllTimers,

    // undo
    undo: undo,
    canUndo: canUndo,
    clearUndo: clearUndo,

    // backup
    exportJSON: exportJSON,
    importJSON: importJSON,

    // misc
    uid: uid
  };
})();
