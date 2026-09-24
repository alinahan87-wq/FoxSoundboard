/* global settings */
/* exported PatternGame */
'use strict';

// Endless pattern: a colourful pattern that can be dragged in any direction,
// forever. Nothing is stored or tiled: every spot's shapes and colours are
// worked out from its position (and a random seed), so it never runs out and
// never repeats. Different motifs drift in and out as you travel, and the
// colours flow across the pattern and slowly change over time. A flick keeps
// it gliding for a moment. No goal, just play.

const PatternGame = (() => {
  const MOTIFS = ['dots', 'stars', 'squares', 'diamonds', 'rings', 'triangles', 'hearts', 'flowers'];
  const FRICTION = 0.94;      // how quickly a flick slows down
  const HUE_SPEED = { slow: 4, gentle: 12, still: 0 }; // degrees per second

  const screen = document.getElementById('pattern-game');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let seed = 1;
  let camX = 0;       // which part of the endless pattern is in view
  let camY = 0;
  let velX = 0;
  let velY = 0;
  let hueTime = 0;    // drifts the colours over time
  let drag = null;    // { id, x, y, t, vx, vy }
  let running = false;
  let frame = 0;
  let lastT = 0;

  const cell = () => Math.max(70, Math.min(W, H) * 0.12);

  // ---- randomness from position -----------------------------------------------

  // A repeatable pseudo-random number in 0..1 for a pair of whole numbers.
  function hash(x, y, salt = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed + salt, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Smooth "value noise": gently rolling hills of values between 0 and 1.
  function noise(x, y, salt) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, salt);
    const b = hash(x0 + 1, y0, salt);
    const c = hash(x0, y0 + 1, salt);
    const d = hash(x0 + 1, y0 + 1, salt);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  // ---- drawing -----------------------------------------------------------------

  function hueAt(wx, wy) {
    const s = 1 / (cell() * 9);
    return (hueTime + noise(wx * s, wy * s, 7) * 220) % 360;
  }

  function shapePath(motif, r, rnd) {
    g.beginPath();
    if (motif === 'dots') {
      g.arc(0, 0, r, 0, Math.PI * 2);
    } else if (motif === 'squares') {
      const s = r * 1.6;
      g.roundRect(-s / 2, -s / 2, s, s, s * 0.22);
    } else if (motif === 'diamonds') {
      g.moveTo(0, -r * 1.15);
      g.lineTo(r * 0.8, 0);
      g.lineTo(0, r * 1.15);
      g.lineTo(-r * 0.8, 0);
      g.closePath();
    } else if (motif === 'triangles') {
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        g.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      }
      g.closePath();
    } else if (motif === 'stars') {
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? r * 0.5 : r * 1.15;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    } else if (motif === 'hearts') {
      const s = r / 16;
      for (let k = 0; k <= 40; k++) {
        const t = (k / 40) * Math.PI * 2;
        g.lineTo(16 * Math.sin(t) ** 3 * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s);
      }
      g.closePath();
    } else if (motif === 'flowers') {
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5 + rnd * 2;
        g.moveTo(Math.cos(a) * r * 0.55 + r * 0.45, Math.sin(a) * r * 0.55);
        g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.45, 0, Math.PI * 2);
      }
    } else {
      // rings
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.moveTo(r * 0.55, 0);
      g.arc(0, 0, r * 0.55, 0, Math.PI * 2, true);
    }
  }

  function draw() {
    const c = cell();
    // a soft background that flows with the colours
    const bgHue = (hueAt(camX + W / 2, camY + H / 2) + 180) % 360;
    g.fillStyle = `hsl(${bgHue.toFixed(1)}, 60%, 93%)`;
    g.fillRect(0, 0, W, H);

    const c0 = Math.floor(camX / c) - 1;
    const r0 = Math.floor(camY / c) - 1;
    const c1 = Math.ceil((camX + W) / c) + 1;
    const r1 = Math.ceil((camY + H) / c) + 1;
    const regionScale = 1 / 6; // motifs change every few cells, in soft patches

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const motif = MOTIFS[Math.floor(noise(col * regionScale, row * regionScale, 3) * MOTIFS.length * 0.999)];
        // a few cells are left empty so the pattern breathes
        if (hash(col, row, 11) < 0.12) continue;
        const jx = (hash(col, row, 1) - 0.5) * c * 0.35;
        const jy = (hash(col, row, 2) - 0.5) * c * 0.35;
        const wx = col * c + c / 2 + jx;
        const wy = row * c + c / 2 + jy;
        const size = c * (0.22 + hash(col, row, 4) * 0.16);
        const rot = hash(col, row, 5) * Math.PI * 2;
        const hue = (hueAt(wx, wy) + hash(col, row, 6) * 40) % 360;
        g.save();
        g.translate(wx - camX, wy - camY);
        g.rotate(motif === 'hearts' ? (rot - Math.PI) * 0.15 : rot);
        shapePath(motif, size, hash(col, row, 8));
        g.fillStyle = `hsl(${hue.toFixed(1)}, 80%, 60%)`;
        g.fill(); // the ring's inner circle is drawn the other way round, which cuts its hole
        g.lineWidth = Math.max(2, c * 0.03);
        g.strokeStyle = `hsl(${hue.toFixed(1)}, 70%, 40%)`;
        g.stroke();
        g.restore();
      }
    }
  }

  // ---- scrolling ----------------------------------------------------------------

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (drag) return; // one finger scrolls at a time
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    drag = { id: e.pointerId, x: p.x, y: p.y, t: performance.now(), vx: 0, vy: 0 };
    velX = 0;
    velY = 0;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = point(e);
    const now = performance.now();
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    camX -= dx;
    camY -= dy;
    // remember how fast the finger was moving, for the glide afterwards
    const dt = Math.max(1, now - drag.t);
    drag.vx = drag.vx * 0.6 + (dx / dt) * 16 * 0.4;
    drag.vy = drag.vy * 0.6 + (dy / dt) * 16 * 0.4;
    drag.x = p.x;
    drag.y = p.y;
    drag.t = now;
  });

  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    // only glide if the finger was still moving when it let go
    const moving = performance.now() - drag.t < 80;
    velX = moving ? -drag.vx : 0;
    velY = moving ? -drag.vy : 0;
    drag = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---- loop, sizing, start and stop -----------------------------------------------------

  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    hueTime = (hueTime + dt * (HUE_SPEED[settings.patternColourSpeed] ?? HUE_SPEED.slow)) % 360;
    if (!drag) {
      camX += velX;
      camY += velY;
      velX *= FRICTION;
      velY *= FRICTION;
      if (Math.hypot(velX, velY) < 0.05) {
        velX = 0;
        velY = 0;
      }
    }
    draw();
    frame = requestAnimationFrame(loop);
  }

  function resize() {
    const rect = screen.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function newPattern() {
    seed = Math.floor(Math.random() * 1e9);
    hueTime = Math.random() * 360;
    camX = 0;
    camY = 0;
    velX = 0;
    velY = 0;
  }

  function start() {
    stop();
    resize();
    newPattern();
    running = true;
    lastT = performance.now();
    frame = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    drag = null;
    window.removeEventListener('resize', resize);
  }

  // Grown-ups can switch to a brand-new pattern from settings.
  function reset() {
    if (running) newPattern();
  }

  // Where the view is, used by tests to check scrolling.
  const view = () => ({ x: camX, y: camY });

  return { start, stop, reset, view };
})();
