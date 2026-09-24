/* global audio, master, EFFECTS, PALETTE, settings */
/* exported StretchGame */
'use strict';

// Stretchy shape: one big shape with a thick outline and a coloured fill. The
// shape stays put, but its outline is rubbery: grab near the edge and pull to
// stretch it, let go and it wobbles back. Parts of the outline push each
// other away instead of overlapping, so the outline never crosses itself.
// Tapping inside the shape gives it a jiggle. No goal, just play.

const StretchGame = (() => {
  // The outline is a ring of "spokes" coming out of a fixed centre: each spoke
  // has its own direction and only its length changes. That means the outline
  // can bulge, dent and wobble, but it can never cross over itself, and the
  // shape itself never moves. When one part is pushed towards another, the
  // other side gets shoved outwards instead of the two overlapping.
  const N = 120;             // spokes around the outline
  const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];
  const SPRING = 0.06;       // pull back towards the resting shape
  const DAMPING = 0.86;      // how quickly the wobble settles
  const SMOOTH = 0.25;       // keeps neighbouring spokes similar, so the outline stays rubbery
  const SPREAD = 0.3;        // how wide a pulled bump is (radians)
  const MIN_R = 0.18;        // the outline never gets closer to the centre than this share of its resting size

  const screen = document.getElementById('stretch-game');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let cx = 0;
  let cy = 0;
  let angles = [];  // direction of each spoke
  let home = [];    // resting length of each spoke
  let r = [];       // current length
  let v = [];       // how fast each spoke is growing or shrinking
  let shape = 'circle';
  let colour = PALETTE[0].hex;
  const grabs = new Map(); // pointerId -> { x, y }
  let running = false;
  let frame = 0;
  let hum = null;

  const thick = () => Math.min(W, H) * 0.035;
  const TAU = Math.PI * 2;
  const angDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  // ---- the resting shape ----------------------------------------------------

  function polygonFor(kind) {
    const R = Math.min(W, H) * 0.3;
    const poly = [];
    const M = 360;
    if (kind === 'circle') {
      for (let i = 0; i < M; i++) {
        const a = (i / M) * TAU;
        poly.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
      }
    } else if (kind === 'square') {
      const s = R * 0.88;
      poly.push({ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s });
    } else if (kind === 'triangle') {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 3;
        poly.push({ x: Math.cos(a) * R * 1.2, y: R * 0.15 + Math.sin(a) * R * 1.2 });
      }
    } else if (kind === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? R * 0.55 : R * 1.1;
        poly.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      }
    } else {
      for (let i = 0; i < M; i++) {
        const t = (i / M) * TAU;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        poly.push({ x: (x / 17) * R * 1.15, y: (y / 17) * R * 1.15 + R * 0.08 });
      }
    }
    return poly;
  }

  // How far a ray from the centre at angle `a` travels before it meets the polygon.
  function rayLength(poly, a) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (p.x * ey - p.y * ex) / den;   // along the ray
      const u = (p.x * dy - p.y * dx) / den;   // along the edge
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best === Infinity ? Math.min(W, H) * 0.3 : best;
  }

  function fitHome() {
    const poly = polygonFor(shape);
    angles = Array.from({ length: N }, (_, i) => (i / N) * TAU);
    home = angles.map((a) => rayLength(poly, a));
  }

  function newShape() {
    const choice = settings.stretchShape || 'random';
    const options = SHAPES.filter((s) => s !== shape);
    shape = choice === 'random' ? options[Math.floor(Math.random() * options.length)] : choice;
    const others = PALETTE.filter((p) => p.hex !== colour);
    colour = others[Math.floor(Math.random() * others.length)].hex;
    fitHome();
    // pop in from small and wobble into shape
    r = home.map((h) => h * 0.3);
    v = home.map(() => 0);
    grabs.clear();
    stopHum();
  }

  // the longest a spoke can get before the outline would leave the screen
  function maxLength(a) {
    const m = thick();
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = dx > 0 ? (W - m - cx) / dx : dx < 0 ? (m - cx) / dx : Infinity;
    const ty = dy > 0 ? (H - m - cy) / dy : dy < 0 ? (m - cy) / dy : Infinity;
    return Math.min(tx, ty);
  }

  // ---- physics ------------------------------------------------------------------

  function step() {
    // where each finger wants the outline to be: a smooth bump that passes
    // through the finger, centred on the finger's direction
    const want = new Float32Array(N);
    const weight = new Float32Array(N);
    for (const gr of grabs.values()) {
      const fx = gr.x - cx;
      const fy = gr.y - cy;
      const fa = Math.atan2(fy, fx);
      const fr = Math.hypot(fx, fy);
      const i0 = Math.round((((fa % TAU) + TAU) % TAU) / TAU * N) % N;
      let lift = fr - home[i0];
      // Once the finger has crossed over to the far side of the shape, it only
      // pushes that side outwards (it doesn't grab and pull it in).
      if (Math.abs(angDiff(fa, gr.a0)) > Math.PI / 2) lift = Math.max(0, lift);
      for (let i = 0; i < N; i++) {
        const d = angDiff(angles[i], fa);
        const w = Math.exp(-(d * d) / (2 * SPREAD * SPREAD));
        if (w < 0.01) continue;
        if (w > weight[i]) {
          want[i] = home[i] + lift * w;
          weight[i] = w;
        }
      }
    }

    const next = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const prev = r[(i + N - 1) % N];
      const nxt = r[(i + 1) % N];
      let a = (home[i] - r[i]) * SPRING + ((prev + nxt) / 2 - r[i]) * SMOOTH;
      v[i] = (v[i] + a) * DAMPING;
      let len = r[i] + v[i];
      if (weight[i] > 0) {
        // fingers win: pull strongly towards the bump
        const pull = Math.min(1, weight[i] * 0.6);
        const target = want[i];
        len += (target - len) * pull;
        v[i] *= 1 - pull;
      }
      const lo = home[i] * MIN_R;
      const hi = maxLength(angles[i]);
      if (len < lo) {
        len = lo;
        v[i] = Math.max(0, v[i]);
      }
      if (len > hi) {
        len = hi;
        v[i] = Math.min(0, v[i]);
      }
      next[i] = len;
    }
    r = Array.from(next);
  }

  // ---- fingers ----------------------------------------------------------------------

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // spoke index nearest to a direction, and how far the outline is there
  function spokeAt(p) {
    const a = Math.atan2(p.y - cy, p.x - cx);
    const i = Math.round((((a % TAU) + TAU) % TAU) / TAU * N) % N;
    return { i, dist: Math.hypot(p.x - cx, p.y - cy) };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = point(e);
    const { i, dist } = spokeAt(p);
    const reach = Math.min(W, H) * 0.14;
    if (Math.abs(dist - r[i]) > reach) {
      // tapping well inside gives it a jiggle; tapping far outside does nothing
      if (dist < r[i]) jiggle(p);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    grabs.set(e.pointerId, { x: p.x, y: p.y, a0: Math.atan2(p.y - cy, p.x - cx) });
    EFFECTS.pop(audio(), master);
    startHum();
  });

  canvas.addEventListener('pointermove', (e) => {
    const gr = grabs.get(e.pointerId);
    if (!gr) return;
    const p = point(e);
    gr.x = p.x;
    gr.y = p.y;
  });

  function release(e) {
    const gr = grabs.get(e.pointerId);
    if (!gr) return;
    grabs.delete(e.pointerId);
    const s = stretchOf(gr);
    if (!grabs.size) stopHum();
    if (s > 0.1) EFFECTS.boing(audio(), master, s * 0.6, 1.2);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // how far a finger has pulled the outline from where it rests, 0..1
  function stretchOf(gr) {
    const { i, dist } = spokeAt(gr);
    return Math.min(1, Math.abs(dist - home[i]) / (Math.min(W, H) * 0.35));
  }

  // A tap inside: the outline puffs out around that side and wobbles.
  function jiggle(p) {
    const a = Math.atan2(p.y - cy, p.x - cx);
    const kick = Math.min(W, H) * 0.03;
    for (let i = 0; i < N; i++) {
      const d = angDiff(angles[i], a);
      v[i] += kick * (0.4 + Math.cos(d) * 0.6);
    }
    EFFECTS.boing(audio(), master, 0.3, 1.4);
  }

  // A quiet rising "stretch" note that follows how far it's pulled.
  function startHum() {
    if (hum || !settings.stretchSound) return;
    const ctx = audio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 0.1);
    osc.connect(gain).connect(master);
    osc.start();
    hum = { osc, gain };
  }

  function updateHum() {
    if (!hum) return;
    let s = 0;
    for (const gr of grabs.values()) s = Math.max(s, stretchOf(gr));
    hum.osc.frequency.setTargetAtTime(200 + 450 * s, audio().currentTime, 0.05);
  }

  function stopHum() {
    if (!hum) return;
    const ctx = audio();
    const { osc, gain } = hum;
    hum = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);
    osc.stop(ctx.currentTime + 0.1);
  }

  // ---- drawing ----------------------------------------------------------------------

  function darker(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const k = 1 - amount / 100;
    return `rgb(${Math.round(((n >> 16) & 255) * k)}, ${Math.round(((n >> 8) & 255) * k)}, ${Math.round((n & 255) * k)})`;
  }

  function outlinePoints() {
    return r.map((len, i) => ({ x: cx + Math.cos(angles[i]) * len, y: cy + Math.sin(angles[i]) * len }));
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const pts = outlinePoints();
    // a smooth closed curve through the points (via midpoints)
    g.beginPath();
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(pts[N - 1], pts[0]);
    g.moveTo(start.x, start.y);
    for (let i = 0; i < N; i++) {
      const m = mid(pts[i], pts[(i + 1) % N]);
      g.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    g.closePath();
    g.fillStyle = colour;
    g.fill();
    g.lineWidth = thick();
    g.lineJoin = 'round';
    g.strokeStyle = darker(colour, 35);
    g.stroke();

    // soft shine near the top-left of the resting shape
    g.save();
    g.globalAlpha = 0.25;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(cx - Math.min(W, H) * 0.1, cy - Math.min(W, H) * 0.12, Math.min(W, H) * 0.07, Math.min(W, H) * 0.035, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // ---- loop, sizing, start and stop ------------------------------------------------------

  function loop() {
    if (!running) return;
    step();
    updateHum();
    draw();
    frame = requestAnimationFrame(loop);
  }

  function resize() {
    const rect = screen.getBoundingClientRect();
    const oldW = W;
    const oldH = H;
    W = rect.width;
    H = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H / 2;
    if (!r.length || (oldW === W && oldH === H)) return;
    // same shape, fitted to the new screen
    fitHome();
    r = [...home];
    v = home.map(() => 0);
    grabs.clear();
  }

  function start() {
    stop();
    resize();
    newShape();
    running = true;
    frame = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    grabs.clear();
    stopHum();
    window.removeEventListener('resize', resize);
  }

  // Grown-ups can swap in a new shape from settings.
  function reset() {
    if (running) newShape();
  }

  // A copy of the outline points (used by tests to check it never crosses itself).
  const outline = () => outlinePoints();

  return { start, stop, reset, outline };
})();
