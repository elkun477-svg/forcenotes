/* ForceNotes living background.
 * A fixed canvas behind the page: colour blobs that travel and change hue as you scroll,
 * a grid that lights up around the pointer, and drifting code symbols joined by thin lines.
 * Respects prefers-reduced-motion, pauses in background tabs, and has an on/off toggle. */
(function () {
  if (!document.body || document.getElementById('fnBg')) return;
  var reduce = false;
  try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var off = false;
  try { off = localStorage.getItem('fn-bg') === 'off'; } catch (e) {}

  var canvas = document.createElement('canvas');
  canvas.id = 'fnBg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = 0, H = 0, DPR = 1, nodes = [], running = false, rafId = 0, lastT = 0, time = 0;
  var scrollY = 0, scrollP = 0, vel = 0, lastScrollY = 0;
  var mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, pointerSeen = false;
  var coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}

  /* teal, violet, cyan, gold, coral: the site's accent colours */
  var PALETTE = [[34, 211, 182], [139, 124, 255], [88, 196, 255], [245, 196, 81], [255, 123, 114]];
  function colorAt(p) {
    p = ((p % 1) + 1) % 1;
    var f = p * PALETTE.length, i = Math.floor(f) % PALETTE.length, j = (i + 1) % PALETTE.length, k = f - Math.floor(f);
    k = k * k * (3 - 2 * k);
    var a = PALETTE[i], b = PALETTE[j];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
  function isLight() { return document.documentElement.getAttribute('data-theme') === 'light'; }

  var GLYPHS = ['{ }', '</>', ';', '=>', '( )', '[ ]', '//', '0x', 'fn', '&&', '::', '#'];
  var BLOBS = [
    { bx: 0.18, by: 0.22, r: 0.55, ph: 0.0, sp: 0.10 },
    { bx: 0.82, by: 0.40, r: 0.50, ph: 0.33, sp: 0.13 },
    { bx: 0.48, by: 0.85, r: 0.60, ph: 0.66, sp: 0.08 }
  ];

  function seed() {
    var count = Math.round(Math.min(coarse ? 34 : 70, (W * H) / (coarse ? 26000 : 20000)));
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
        depth: 0.04 + Math.random() * 0.28,
        r: 1.2 + Math.random() * 1.8,
        glyph: Math.random() < 0.16 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : null,
        hue: Math.random()
      });
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
    readScroll();
    draw(0);
  }

  function readScroll() {
    scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var max = Math.max(1, (document.documentElement.scrollHeight || 1) - H);
    scrollP = Math.min(1, Math.max(0, scrollY / max));
  }

  function draw(dt) {
    var light = isLight();
    ctx.clearRect(0, 0, W, H);
    var base = colorAt(scrollP);

    /* 1. colour blobs: positions travel with scroll, drift with time, lean toward the pointer */
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (var b = 0; b < BLOBS.length; b++) {
      var bl = BLOBS[b];
      var x = (bl.bx + Math.sin(time * bl.sp + bl.ph * 6.28) * 0.06 + (mx - 0.5) * 0.10 * (b + 1) + Math.sin(scrollP * 6.28 + b) * 0.10) * W;
      var y = (bl.by + Math.cos(time * bl.sp * 0.8 + bl.ph * 6.28) * 0.05 + (my - 0.5) * 0.06 * (b + 1) + Math.cos(scrollP * 5.0 + b * 1.7) * 0.16) * H;
      var rad = Math.max(W, H) * bl.r;
      var col = colorAt(scrollP + bl.ph);
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgba(col, light ? 0.24 : 0.27));
      g.addColorStop(0.55, rgba(col, light ? 0.08 : 0.085));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    /* 2. grid that slides with scroll and lights up near the pointer */
    var gap = 56;
    var offY = -((scrollY * 0.35) % gap);
    var offX = -((mx - 0.5) * 30);
    ctx.lineWidth = 1;
    ctx.strokeStyle = light ? 'rgba(14,17,23,0.07)' : 'rgba(150,170,205,0.085)';
    ctx.beginPath();
    for (var gx = offX % gap; gx < W; gx += gap) { ctx.moveTo(Math.round(gx) + 0.5, 0); ctx.lineTo(Math.round(gx) + 0.5, H); }
    for (var gy = offY; gy < H; gy += gap) { ctx.moveTo(0, Math.round(gy) + 0.5); ctx.lineTo(W, Math.round(gy) + 0.5); }
    ctx.stroke();
    var px = mx * W, py = my * H;
    if (pointerSeen && !coarse) {
      var R = 190;
      for (var ix = offX % gap; ix < W; ix += gap) {
        if (Math.abs(ix - px) > R) continue;
        for (var iy = offY; iy < H; iy += gap) {
          var dx = ix - px, dy = iy - py, d = Math.sqrt(dx * dx + dy * dy);
          if (d > R) continue;
          var k = 1 - d / R;
          ctx.fillStyle = rgba(base, (light ? 0.5 : 0.8) * k * k);
          ctx.beginPath(); ctx.arc(ix, iy, 1.2 + 1.6 * k, 0, 6.283); ctx.fill();
        }
      }
      var pg = ctx.createRadialGradient(px, py, 0, px, py, 220);
      pg.addColorStop(0, rgba(base, light ? 0.14 : 0.20));
      pg.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = pg; ctx.fillRect(px - 220, py - 220, 440, 440);
    }

    /* 3. drifting nodes, glyphs and links */
    var speed = 1 + Math.min(vel / 25, 3.5);
    var n = nodes.length, i, j, a, c;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      if (dt) {
        a.x += a.vx * speed * dt * 60; a.y += a.vy * speed * dt * 60;
        if (pointerSeen && !coarse) {
          var ddx = a.x - px, ddy = (a.y - ((scrollY * a.depth) % H + H) % H) - py;
          var dd = ddx * ddx + ddy * ddy;
          if (dd < 22000 && dd > 1) { var f = (1 - dd / 22000) * 0.5; a.x += (ddx / Math.sqrt(dd)) * f; }
        }
        if (a.x < -20) a.x = W + 20; else if (a.x > W + 20) a.x = -20;
        if (a.y < -20) a.y = H + 20; else if (a.y > H + 20) a.y = -20;
      }
      a.dy = (((a.y - scrollY * a.depth) % H) + H) % H;
    }
    var maxD = coarse ? 90 : 120;
    ctx.lineWidth = 1;
    for (i = 0; i < n; i++) {
      a = nodes[i];
      for (j = i + 1; j < n; j++) {
        c = nodes[j];
        var lx = a.x - c.x; if (lx > maxD || lx < -maxD) continue;
        var ly = a.dy - c.dy; if (ly > maxD || ly < -maxD) continue;
        var dist = Math.sqrt(lx * lx + ly * ly);
        if (dist < maxD) {
          ctx.strokeStyle = rgba(colorAt(scrollP + (a.hue + c.hue) * 0.2), (1 - dist / maxD) * (light ? 0.30 : 0.38));
          ctx.beginPath(); ctx.moveTo(a.x, a.dy); ctx.lineTo(c.x, c.dy); ctx.stroke();
        }
      }
      if (pointerSeen && !coarse) {
        var qx = a.x - px, qy = a.dy - py, qd = Math.sqrt(qx * qx + qy * qy);
        if (qd < 170) {
          ctx.strokeStyle = rgba(base, (1 - qd / 170) * (light ? 0.32 : 0.45));
          ctx.beginPath(); ctx.moveTo(a.x, a.dy); ctx.lineTo(px, py); ctx.stroke();
        }
      }
    }
    ctx.font = '12px "JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    for (i = 0; i < n; i++) {
      a = nodes[i];
      var nc = colorAt(scrollP + a.hue * 0.35);
      if (a.glyph) {
        ctx.fillStyle = rgba(nc, light ? 0.40 : 0.42);
        ctx.fillText(a.glyph, a.x, a.dy);
      } else {
        ctx.fillStyle = rgba(nc, light ? 0.65 : 0.8);
        ctx.beginPath(); ctx.arc(a.x, a.dy, a.r, 0, 6.283); ctx.fill();
      }
    }
  }

  function loop(t) {
    rafId = 0;
    if (!running) return;
    if (document.hidden) { running = false; return; }
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    if (t - lastT < 20) { rafId = requestAnimationFrame(loop); return; } /* about 45 fps */
    lastT = t; time += dt;
    mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
    var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
    vel += (Math.abs(sy - lastScrollY) - vel) * 0.15; lastScrollY = sy;
    readScroll();
    draw(dt);
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (running || off) return;
    if (reduce) { readScroll(); draw(0); return; }
    running = true; lastT = performance.now(); rafId = requestAnimationFrame(loop);
  }
  function stop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  /* events */
  var scrollQueued = false;
  window.addEventListener('scroll', function () {
    if (reduce && !off && !scrollQueued) { scrollQueued = true; requestAnimationFrame(function () { scrollQueued = false; readScroll(); draw(0); }); }
  }, { passive: true });
  function pointer(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    if (t.clientX === undefined) return;
    tx = t.clientX / Math.max(1, W); ty = t.clientY / Math.max(1, H); pointerSeen = true;
  }
  window.addEventListener('mousemove', pointer, { passive: true });
  window.addEventListener('touchmove', pointer, { passive: true });
  window.addEventListener('mouseout', function (e) { if (!e.relatedTarget) pointerSeen = false; });
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (!off) start(); });
  if (window.MutationObserver) {
    new MutationObserver(function () { if (!running && !off) { readScroll(); draw(0); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* toggle button */
  function applyOff() {
    canvas.style.display = off ? 'none' : '';
    var btn = document.getElementById('bgToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', off ? 'false' : 'true');
      btn.setAttribute('aria-label', off ? 'Turn the animated background on' : 'Turn the animated background off');
      btn.classList.toggle('is-off', off);
    }
  }
  var btn = document.getElementById('bgToggle');
  if (btn) btn.addEventListener('click', function () {
    off = !off;
    try { localStorage.setItem('fn-bg', off ? 'off' : 'on'); } catch (e) {}
    applyOff();
    if (off) stop(); else { start(); if (!running) { readScroll(); draw(0); } }
  });

  applyOff();
  resize();
  start();
  window.fnBg = { start: start, stop: stop, redraw: function () { readScroll(); draw(0); } };
})();
