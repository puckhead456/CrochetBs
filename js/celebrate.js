// js/celebrate.js — window.Celebrate: themed finish animations
// Plain JS, no modules, no external assets, no DOM dependency on the rest of the app.
'use strict';

(function () {
  var STYLE_ID = 'celebrate-css';
  var OVERLAY_CLASS = 'celebrate';

  var overlayEl = null;
  var timers = [];          // setTimeout ids to clear on stop
  var rafs = [];             // requestAnimationFrame ids to clear on stop
  var pendingResolve = null;
  var runToken = 0;          // invalidates stale timeouts from a previous play()

  // ---------- CSS (injected once) ----------
  var CSS = '' +
    '.celebrate{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;contain:layout style size;}' +
    '.celebrate .cel-p{position:absolute;will-change:transform,opacity;}' +
    '@keyframes cel-fade-inout{0%{opacity:0;}10%{opacity:1;}85%{opacity:1;}100%{opacity:0;}}' +
    '@keyframes cel-reduced-fade{0%{opacity:0;}20%{opacity:1;}75%{opacity:1;}100%{opacity:0;}}' +
    /* stardew-spring */
    '@keyframes cel-junimo-hop{0%{transform:translate(0,140px) scale(.7);opacity:0;}8%{opacity:1;}22%{transform:translate(-6px,0) scale(1.04);}38%{transform:translate(6px,-46px) scale(.94);}54%{transform:translate(-5px,4px) scale(1.05);}70%{transform:translate(5px,-30px) scale(.96);}86%{transform:translate(-2px,0) scale(1.02);}94%{opacity:1;}100%{transform:translate(0,-8px) scale(1);opacity:0;}}' +
    '@keyframes cel-confetti-fall{0%{transform:translate(0,-12vh) rotate(0deg);opacity:0;}10%{opacity:1;}100%{transform:translate(var(--dx,20px),112vh) rotate(480deg);opacity:0;}}' +
    /* stardew-night */
    '@keyframes cel-stardrop-float{0%{transform:translate(0,10vh) scale(.7);opacity:0;}18%{opacity:1;}60%{transform:translate(var(--dx,6px),-46vh) scale(1);}100%{transform:translate(var(--dx2,-4px),-78vh) scale(.85);opacity:0;}}' +
    '@keyframes cel-shooting-star{0%{transform:translate(0,0) rotate(var(--ang,20deg));opacity:0;}6%{opacity:1;}80%{opacity:1;}100%{transform:translate(var(--sx,70vw),var(--sy,30vh)) rotate(var(--ang,20deg));opacity:0;}}' +
    /* stardew-harvest */
    '@keyframes cel-leaf-tumble{0%{transform:translate(0,-12vh) rotate(0deg);opacity:0;}8%{opacity:1;}100%{transform:translate(var(--dx,40px),112vh) rotate(760deg);opacity:0;}}' +
    '@keyframes cel-pumpkin-bounce{0%{transform:translateY(0) scale(1);opacity:0;}10%{opacity:1;}30%{transform:translateY(-20px) scale(1.04);}50%{transform:translateY(0) scale(.96);}70%{transform:translateY(-10px) scale(1.02);}90%{opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}' +
    /* dragon-fury */
    '@keyframes cel-fly-path{0%{transform:translate(-20vw,42vh) scale(.85);}25%{transform:translate(18vw,28vh) scale(1);}50%{transform:translate(50vw,46vh) scale(1);}75%{transform:translate(82vw,26vh) scale(1);}100%{transform:translate(118vw,40vh) scale(.85);}}' +
    '@keyframes cel-glow-pulse{0%{opacity:0;transform:scale(.5);}20%{opacity:.5;}100%{opacity:0;transform:scale(1.6);}}' +
    /* dragon-throne */
    '@keyframes cel-rise-settle{0%{transform:translate(-50%,100%);opacity:0;}16%{opacity:1;}26%{transform:translate(-50%,10%);}70%{transform:translate(-50%,10%);opacity:1;}100%{transform:translate(-50%,100%);opacity:0;}}' +
    '@keyframes cel-flame-flicker{0%{transform:scaleY(.88) scaleX(1);opacity:.85;}20%{transform:scaleY(1.12) scaleX(.95);opacity:1;}40%{transform:scaleY(.82) scaleX(1.05);opacity:.8;}60%{transform:scaleY(1.15) scaleX(.92);opacity:1;}80%{transform:scaleY(.9) scaleX(1.02);opacity:.9;}100%{transform:scaleY(.88) scaleX(1);opacity:.85;}}' +
    '@keyframes cel-ember-drift{0%{transform:translate(0,0);opacity:0;}12%{opacity:1;}50%{transform:translate(var(--dx,10px),-70px);}100%{transform:translate(var(--dx2,-8px),-160px);opacity:0;}}' +
    '@keyframes cel-sparkle-twinkle{0%{transform:scale(.3) rotate(0deg);opacity:0;}45%{transform:scale(1) rotate(90deg);opacity:1;}100%{transform:scale(.3) rotate(180deg);opacity:0;}}' +
    /* dragon-pixel */
    '@keyframes cel-pixel-flicker{0%{transform:scaleY(.55);}25%{transform:scaleY(1);}50%{transform:scaleY(.7);}75%{transform:scaleY(1.05);}100%{transform:scaleY(.55);}}' +
    '@keyframes cel-pixel-fall{0%{transform:translate(0,-12vh);opacity:0;}10%{opacity:1;}100%{transform:translate(var(--dx,0px),112vh);opacity:0;}}' +
    '@keyframes cel-pixel-bob{0%{transform:translateY(0);}50%{transform:translateY(-8px);}100%{transform:translateY(0);}}' +
    '';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function clearTimers() {
    var i;
    for (i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    for (i = 0; i < rafs.length; i++) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(rafs[i]);
    }
    rafs = [];
  }

  function removeOverlay() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
  }

  function finishCurrent() {
    clearTimers();
    removeOverlay();
    if (pendingResolve) {
      var r = pendingResolve;
      pendingResolve = null;
      r();
    }
  }

  function stop() {
    runToken++; // invalidate anything in flight
    finishCurrent();
  }

  // ---------- small helpers ----------
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function spawn(container, className, styleText, html) {
    var e = document.createElement('div');
    e.className = 'cel-p' + (className ? ' ' + className : '');
    if (styleText) e.style.cssText = styleText;
    if (html) e.innerHTML = html;
    container.appendChild(e);
    return e;
  }

  // Set a fade-only animation for reduced-motion mode.
  function reducedFade(el, durationMs) {
    el.style.animation = 'cel-reduced-fade ' + durationMs + 'ms ease both';
  }

  // ---------- SVG snippets (kept simple & cute) ----------
  var SVG_JUNIMO = '<svg viewBox="0 0 40 44" width="30" height="30" aria-hidden="true">' +
    '<ellipse cx="20" cy="27" rx="15" ry="13" fill="#8fd694"/>' +
    '<ellipse cx="20" cy="32" rx="15" ry="8" fill="#74c07f"/>' +
    '<circle cx="14" cy="24" r="2.6" fill="#2c2c2c"/>' +
    '<circle cx="26" cy="24" r="2.6" fill="#2c2c2c"/>' +
    '<path d="M20 3 C22 9 26 9 24 15 C22 11 18 11 16 15 C14 9 18 9 20 3 Z" fill="#4caf50"/>' +
    '</svg>';

  var SVG_STARDROP = '<svg viewBox="0 0 30 40" width="24" height="32" aria-hidden="true">' +
    '<path d="M15 2 C22 16 26 23 15 38 C4 23 8 16 15 2 Z" fill="#b57bee"/>' +
    '<ellipse cx="14" cy="12" rx="3" ry="5" fill="#e6c8ff" opacity=".6"/>' +
    '<path d="M15 2 C17 -2 21 -1 22 3 C18 4.5 16.5 4 15 2 Z" fill="#4caf50"/>' +
    '</svg>';

  var SVG_MAPLE_LEAF = '<svg viewBox="0 0 40 40" width="20" height="20" aria-hidden="true">' +
    '<path d="M20 2 L24 12 L34 10 L27 18 L36 22 L25 24 L28 34 L20 27 L12 34 L15 24 L4 22 L13 18 L6 10 L16 12 Z" fill="currentColor"/>' +
    '</svg>';

  var SVG_PUMPKIN = '<svg viewBox="0 0 40 34" width="26" height="22" aria-hidden="true">' +
    '<ellipse cx="20" cy="20" rx="16" ry="12" fill="#e8791a"/>' +
    '<path d="M8 20 Q14 12 20 20 Q26 12 32 20" fill="none" stroke="#b85c0f" stroke-width="2"/>' +
    '<rect x="18" y="2" width="4" height="9" rx="2" fill="#4caf50"/>' +
    '</svg>';

  var SVG_TOOTHLESS = '<svg viewBox="0 0 130 70" width="130" height="70" aria-hidden="true">' +
    '<path d="M8 42 C -2 30 10 18 26 23 C 34 8 56 6 66 17 C 92 6 120 20 103 36 C 120 40 114 56 97 51 C 92 62 70 63 60 53 C 44 64 24 59 21 46 C 8 51 0 47 8 42 Z" fill="#181820"/>' +
    '<circle cx="57" cy="27" r="3.6" fill="#7bd389"/>' +
    '<circle cx="68" cy="27" r="3.6" fill="#7bd389"/>' +
    '</svg>';

  var SVG_DRAGON_HEAD = '<svg viewBox="0 0 100 80" width="110" height="88" aria-hidden="true">' +
    '<path d="M10 62 C4 40 20 14 50 9 C80 14 96 40 90 62 C80 51 70 56 65 66 C55 59 45 59 35 66 C30 56 20 51 10 62 Z" fill="#7a1420"/>' +
    '<circle cx="38" cy="35" r="3.2" fill="#ffd166"/>' +
    '<circle cx="62" cy="35" r="3.2" fill="#ffd166"/>' +
    '<path d="M45 46 L50 57 L55 46 Z" fill="#2b0a0a"/>' +
    '</svg>';

  // ---------- generic confetti (used by spring + fallback) ----------
  function makeConfetti(container, count, palette, reduced, dur) {
    var i;
    for (i = 0; i < count; i++) {
      var left = rand(0, 100);
      var delay = rand(0, dur * 0.6);
      var size = rand(6, 12);
      var color = pick(palette);
      var shape = Math.random() < 0.5 ? '50%' : '2px';
      var dx = rand(-60, 60);
      var css = 'left:' + left + '%;top:-5vh;width:' + size + 'px;height:' + size + 'px;' +
        'background:' + color + ';border-radius:' + shape + ';--dx:' + dx + 'px;';
      var el = spawn(container, 'cel-confetti', css);
      if (reduced) {
        el.style.top = rand(10, 80) + '%';
        reducedFade(el, dur);
      } else {
        el.style.animation = 'cel-confetti-fall ' + rand(dur * 0.7, dur) + 'ms linear ' + delay + 'ms both';
      }
    }
  }

  // ---------- theme renderers ----------
  // Each renderer(container, big, reduced, dur) paints the scene into `container`.

  function renderSpring(container, big, reduced, dur) {
    var junimoCount = big ? (3 + ((Math.random() * 3) | 0)) : 2; // 3-5 for project
    var i;
    for (i = 0; i < junimoCount; i++) {
      var left = rand(8, 88);
      var delay = rand(0, dur * 0.4);
      var css = 'left:' + left + '%;bottom:0;';
      var el = spawn(container, 'cel-junimo', css, SVG_JUNIMO);
      if (reduced) {
        el.style.bottom = rand(5, 40) + '%';
        reducedFade(el, dur);
      } else {
        el.style.animation = 'cel-junimo-hop ' + rand(dur * 0.6, dur * 0.9) + 'ms cubic-bezier(.34,1.56,.64,1) ' + delay + 'ms both';
      }
    }
    makeConfetti(container, big ? 18 : 8, ['#ffd3e0', '#c9f2c7', '#fff3b0', '#c7e8ff', '#e0c7ff', '#ffe0c2'], reduced, dur);
  }

  function renderNight(container, big, reduced, dur) {
    var dropCount = big ? 4 : 2;
    var i;
    for (i = 0; i < dropCount; i++) {
      var left = rand(10, 85);
      var delay = rand(0, dur * 0.3);
      var css = 'left:' + left + '%;bottom:6%;--dx:' + rand(-14, 14) + 'px;--dx2:' + rand(-14, 14) + 'px;';
      var el = spawn(container, 'cel-stardrop', css, SVG_STARDROP);
      if (reduced) {
        el.style.bottom = rand(20, 60) + '%';
        reducedFade(el, dur);
      } else {
        el.style.animation = 'cel-stardrop-float ' + rand(dur * 0.8, dur * 1.05) + 'ms ease-out ' + delay + 'ms both';
      }
    }
    var starCount = big ? 3 : 1;
    for (i = 0; i < starCount; i++) {
      var top = rand(5, 45);
      var ang = rand(12, 28);
      var sx = rand(55, 80);
      var sy = rand(25, 45);
      var sdelay = rand(0, dur * 0.5);
      var scss = 'left:-5%;top:' + top + '%;width:70px;height:2px;' +
        'background:linear-gradient(90deg, rgba(255,255,255,0), #fff);' +
        '--ang:' + ang + 'deg;--sx:' + sx + 'vw;--sy:' + sy + 'vh;';
      var starEl = spawn(container, 'cel-star', scss);
      if (reduced) {
        starEl.style.left = rand(20, 70) + '%';
        starEl.style.background = '#fff';
        starEl.style.width = '6px';
        starEl.style.height = '6px';
        starEl.style.borderRadius = '50%';
        reducedFade(starEl, dur);
      } else {
        starEl.style.animation = 'cel-shooting-star ' + rand(dur * 0.35, dur * 0.5) + 'ms ease-in ' + sdelay + 'ms both';
      }
    }
  }

  function renderHarvest(container, big, reduced, dur) {
    var leafCount = big ? 12 : 6;
    var leafColors = ['#e07a2c', '#f2a93b', '#c1421a', '#8a4b1f'];
    var i;
    for (i = 0; i < leafCount; i++) {
      var left = rand(0, 100);
      var delay = rand(0, dur * 0.6);
      var dx = rand(-50, 50);
      var css = 'left:' + left + '%;top:-6vh;color:' + pick(leafColors) + ';--dx:' + dx + 'px;';
      var el = spawn(container, 'cel-leaf', css, SVG_MAPLE_LEAF);
      if (reduced) {
        el.style.top = rand(10, 80) + '%';
        reducedFade(el, dur);
      } else {
        el.style.animation = 'cel-leaf-tumble ' + rand(dur * 0.7, dur) + 'ms linear ' + delay + 'ms both';
      }
    }
    if (big) {
      var pumpCount = 2;
      for (i = 0; i < pumpCount; i++) {
        var pleft = 30 + i * 30 + rand(-6, 6);
        var pdelay = rand(dur * 0.3, dur * 0.5);
        var pcss = 'left:' + pleft + '%;bottom:2%;';
        var pel = spawn(container, 'cel-pumpkin', pcss, SVG_PUMPKIN);
        if (reduced) {
          reducedFade(pel, dur);
        } else {
          pel.style.animation = 'cel-pumpkin-bounce ' + (dur * 0.55) + 'ms ease-out ' + pdelay + 'ms both';
        }
      }
    }
  }

  function renderFury(container, big, reduced, dur) {
    var trailCount = big ? 9 : 4;
    var flightDur = big ? dur * 0.85 : dur * 0.9;
    var i;
    // trail glow blobs (painted first, so the dragon renders on top)
    for (i = 0; i < trailCount; i++) {
      var lag = (i + 1) * (flightDur / (trailCount + 4));
      var size = rand(14, 30);
      var css = 'left:0;top:0;width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
        'background:radial-gradient(circle, rgba(80,200,255,.85), rgba(80,160,255,0) 70%);' +
        'filter:blur(2px);';
      var el = spawn(container, 'cel-glow', css);
      if (reduced) {
        el.style.left = rand(20, 70) + '%';
        el.style.top = rand(20, 60) + '%';
        reducedFade(el, dur);
      } else {
        el.style.animation =
          'cel-fly-path ' + flightDur + 'ms linear ' + lag + 'ms both, ' +
          'cel-glow-pulse ' + (flightDur / trailCount * 2.2) + 'ms ease-out ' + lag + 'ms infinite';
      }
    }
    // the dragon itself
    var dcss = 'left:0;top:0;';
    var dragonEl = spawn(container, 'cel-toothless', dcss, SVG_TOOTHLESS);
    if (reduced) {
      dragonEl.style.left = '38%';
      dragonEl.style.top = '38%';
      reducedFade(dragonEl, dur);
    } else {
      dragonEl.style.animation =
        'cel-fly-path ' + flightDur + 'ms cubic-bezier(.4,0,.6,1) both, ' +
        'cel-fade-inout ' + flightDur + 'ms linear both';
    }
  }

  function renderThrone(container, big, reduced, dur) {
    var emberColors = ['#ff8a3d', '#ffb347', '#ffd166'];
    if (big) {
      var headEl = spawn(container, 'cel-dragonhead', 'left:50%;bottom:0;', SVG_DRAGON_HEAD);
      if (reduced) {
        headEl.style.bottom = '10%';
        reducedFade(headEl, dur);
      } else {
        headEl.style.animation = 'cel-rise-settle ' + (dur * 0.75) + 'ms ease-in-out both';
      }
      // fire fan: a few flame-shaped gradient wedges
      var fanCount = 5;
      var i;
      for (i = 0; i < fanCount; i++) {
        var angle = -35 + i * (70 / (fanCount - 1));
        var fcss = 'left:50%;bottom:6%;width:' + rand(18, 26) + 'px;height:' + rand(70, 110) + 'px;' +
          'transform-origin:50% 100%;transform:translateX(-50%) rotate(' + angle + 'deg);' +
          'background:linear-gradient(0deg, #ff3d1a, #ff9a3d 55%, #ffe066 85%, rgba(255,224,102,0));' +
          'border-radius:50% 50% 50% 50% / 60% 60% 20% 20%;';
        var fireEl = spawn(container, 'cel-fire', fcss);
        if (reduced) {
          reducedFade(fireEl, dur);
        } else {
          fireEl.style.animation = 'cel-flame-flicker ' + rand(220, 380) + 'ms ease-in-out ' + rand(0, 200) + 'ms infinite, ' +
            'cel-fade-inout ' + (dur * 0.7) + 'ms linear both';
        }
      }
    }
    var emberCount = big ? 8 : 4;
    var j;
    for (j = 0; j < emberCount; j++) {
      var eleft = rand(30, 70);
      var edelay = rand(dur * 0.1, dur * 0.5);
      var ecss = 'left:' + eleft + '%;bottom:8%;width:' + rand(3, 6) + 'px;height:' + rand(3, 6) + 'px;' +
        'border-radius:50%;background:' + pick(emberColors) + ';--dx:' + rand(-20, 20) + 'px;--dx2:' + rand(-30, 30) + 'px;';
      var emberEl = spawn(container, 'cel-ember', ecss);
      if (reduced) {
        reducedFade(emberEl, dur);
      } else {
        emberEl.style.animation = 'cel-ember-drift ' + rand(dur * 0.5, dur * 0.8) + 'ms ease-out ' + edelay + 'ms both';
      }
    }
    var sparkCount = big ? 6 : 2;
    for (j = 0; j < sparkCount; j++) {
      var sleft = rand(15, 85);
      var stop_ = rand(10, 70);
      var sdelay = rand(0, dur * 0.6);
      var scss = 'left:' + sleft + '%;top:' + stop_ + '%;color:#ffd166;font-size:' + rand(10, 16) + 'px;line-height:1;';
      var sparkEl = spawn(container, 'cel-sparkle', scss, '✦');
      if (reduced) {
        reducedFade(sparkEl, dur);
      } else {
        sparkEl.style.animation = 'cel-sparkle-twinkle ' + rand(500, 900) + 'ms ease-in-out ' + sdelay + 'ms both';
      }
    }
  }

  // pixel dragon sprite built entirely with box-shadow (1 DOM node)
  var PIXEL_DRAGON_ROWS = [
    '................',
    '.........DD.....',
    '........DGGD....',
    '.......DGGGGD...',
    '......DGGGGGGD..',
    '.....DGGGEGGGDW.',
    '....DGGGGGGGGDWW',
    '...DTGGGGGGGGDW.',
    '...DTGGGGGGGD...',
    '....DGG..DGD....',
    '....DD....DD....',
    '................'
  ];
  var PIXEL_COLORS = { D: '#12321f', G: '#38b764', E: '#ff004d', W: '#7bf1a8', T: '#0f2a1a' };

  function buildPixelShadow(rows, colors, px) {
    var shadows = [];
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        if (ch === '.') continue;
        var color = colors[ch] || '#000';
        shadows.push((x * px) + 'px ' + (y * px) + 'px 0 0 ' + color);
      }
    }
    return shadows.join(',');
  }

  function renderPixel(container, big, reduced, dur) {
    var retro = ['#ff004d', '#00e436', '#29adff', '#ffec27', '#fff1e8', '#ff77a8'];
    // pixel fire: a row of stepped rects at the bottom
    var flameCount = big ? 10 : 6;
    var i;
    var startLeft = 50 - flameCount * 2.2;
    for (i = 0; i < flameCount; i++) {
      var fcss = 'left:' + (startLeft + i * 4.4) + '%;bottom:0;width:' + (big ? 14 : 10) + 'px;' +
        'height:' + rand(30, 60) + 'px;transform-origin:50% 100%;' +
        'background:' + pick(['#ff8a3d', '#ff3d1a', '#ffd166']) + ';' +
        'image-rendering:pixelated;';
      var fireEl = spawn(container, 'cel-pixfire', fcss);
      if (reduced) {
        reducedFade(fireEl, dur);
      } else {
        fireEl.style.animation = 'cel-pixel-flicker ' + rand(300, 500) + 'ms steps(4,end) ' + rand(0, 150) + 'ms infinite, ' +
          'cel-fade-inout ' + (dur * 0.9) + 'ms steps(8,end) both';
      }
    }
    // pixel confetti
    var confettiCount = big ? 14 : 6;
    for (i = 0; i < confettiCount; i++) {
      var left = rand(0, 100);
      var delay = rand(0, dur * 0.5);
      var ccss = 'left:' + left + '%;top:-6vh;width:8px;height:8px;background:' + pick(retro) + ';' +
        'image-rendering:pixelated;--dx:' + (((rand(-4, 4) | 0)) * 10) + 'px;';
      var cEl = spawn(container, 'cel-pixconf', ccss);
      if (reduced) {
        cEl.style.top = rand(10, 80) + '%';
        reducedFade(cEl, dur);
      } else {
        cEl.style.animation = 'cel-pixel-fall ' + rand(dur * 0.7, dur) + 'ms steps(10,end) ' + delay + 'ms both';
      }
    }
    // small pixel dragon sprite bobbing in a corner
    var px = big ? 4 : 3;
    var spriteCss = 'right:6%;top:10%;width:' + px + 'px;height:' + px + 'px;background:transparent;' +
      'image-rendering:pixelated;' +
      'box-shadow:' + buildPixelShadow(PIXEL_DRAGON_ROWS, PIXEL_COLORS, px) + ';';
    var spriteEl = spawn(container, 'cel-pixdragon', spriteCss);
    if (reduced) {
      reducedFade(spriteEl, dur);
    } else {
      spriteEl.style.animation = 'cel-pixel-bob 900ms steps(6,end) infinite, cel-fade-inout ' + dur + 'ms linear both';
    }
  }

  function renderFallback(container, big, reduced, dur) {
    makeConfetti(container, big ? 20 : 8, ['#ffd3e0', '#c9f2c7', '#fff3b0', '#c7e8ff', '#e0c7ff', '#ffe0c2'], reduced, dur);
  }

  var THEMES = {
    'stardew-spring': renderSpring,
    'stardew-night': renderNight,
    'stardew-harvest': renderHarvest,
    'dragon-fury': renderFury,
    'dragon-throne': renderThrone,
    'dragon-pixel': renderPixel
  };

  // ---------- public API ----------
  function play(themeId, opts) {
    // Calling play while one is running stops the previous one first.
    stop();
    injectStyles();

    var kind = (opts && opts.kind) || 'project';
    var myToken = ++runToken;

    return new Promise(function (resolve) {
      if (kind === 'row') {
        resolve();
        return;
      }

      pendingResolve = resolve;

      overlayEl = document.createElement('div');
      overlayEl.className = OVERLAY_CLASS;
      document.body.appendChild(overlayEl);

      var reduced = prefersReducedMotion();
      var big = kind === 'project';
      var duration = big ? (reduced ? 900 : 3000) : (reduced ? 500 : 1200);

      var renderer = THEMES[themeId] || renderFallback;
      try {
        renderer(overlayEl, big, reduced, duration);
      } catch (e) {
        // Never let a themed renderer crash the app; fall back quietly.
        try { renderFallback(overlayEl, big, reduced, duration); } catch (e2) { /* noop */ }
      }

      var t = setTimeout(function () {
        if (myToken !== runToken) return; // superseded by a newer play()/stop()
        finishCurrent();
      }, duration);
      timers.push(t);
    });
  }

  window.Celebrate = {
    play: play,
    stop: stop
  };
})();
