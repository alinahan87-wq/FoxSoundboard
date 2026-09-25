/* global audio, master, EFFECTS, PALETTE, settings, Celebrate */
/* exported StretchGame */
'use strict';

// Stretchy shape: one big shape with a thick outline and a coloured fill. The
// shape stays put, but its outline is like soft dough: grab near the edge and
// pull to stretch it, and when you let go it keeps its new shape. Parts of the
// outline push each other away instead of overlapping, so the outline never
// crosses itself. Tapping inside the shape gives it a jiggle. Stretch it until
// it fills (nearly) the whole screen and it pops, with bubbles, then a new
// shape appears.

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
  // How close the outline may come to the centre. Just enough that two parts of
  // the thick outline pushed in from opposite sides meet without overlapping,
  // so they can squeeze almost together.
  const minLength = () => thick() * 0.6;

  const screen = document.getElementById('stretch-game');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let cx = 0;
  let cy = 0;
  let angles = [];  // direction of each spoke
  let base = [];    // each spoke's length in the original shape
  let home = [];    // where each spoke rests now: it keeps whatever shape it was pulled into
  let r = [];       // current length
  let v = [];       // how fast each spoke is growing or shrinking
  let shape = 'circle';
  let colour = PALETTE[0].hex;
  let hsl = { h: 0, s: 90, l: 60 }; // the colour on screen; its hue drifts as the outline is pulled around
  const grabs = new Map(); // pointerId -> { x, y }
  let running = false;
  let frame = 0;
  let hum = null;
  let celebrating = false;
  let popStart = 0;  // when the winning pop began, for the burst-and-fade
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

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
    cx = W / 2;
    cy = H / 2;
    const poly = polygonFor(shape);
    angles = Array.from({ length: N }, (_, i) => (i / N) * TAU);
    base = angles.map((a) => rayLength(poly, a));
    home = [...base];
  }

  function newShape() {
    const choice = settings.stretchShape || 'random';
    const options = SHAPES.filter((s) => s !== shape);
    shape = choice === 'random' ? options[Math.floor(Math.random() * options.length)] : choice;
    const others = PALETTE.filter((p) => p.hex !== colour);
    colour = others[Math.floor(Math.random() * others.length)].hex;
    hsl = toHsl(colour);
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

  // A finger pushing an edge in doesn't stop at the middle: the pushed-in edge
  // stays pressed in as deep as it can go, and the far side is pushed away
  // ahead of the finger, like pressing into dough.
  const pushGap = () => minLength() + thick() * 1.5;

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
      // Bumps this finger makes: [direction, target length at that direction].
      const bumps = [];
      if (Math.abs(angDiff(fa, gr.a0)) <= Math.PI / 2) {
        // still on the side it grabbed: the outline passes through the finger
        bumps.push([fa, fr]);
      } else {
        // pushed past the middle: keep the grabbed edge pressed right in...
        bumps.push([gr.a0, minLength()]);
        // ...and push the far side away, gently at first, then staying just
        // ahead of the finger as it gets there
        const iF = i0;
        bumps.push([fa, Math.max(home[iF], home[iF] + fr * 0.5, fr + pushGap())]);
      }
      for (const [dir, len] of bumps) {
        const ib = Math.round((((dir % TAU) + TAU) % TAU) / TAU * N) % N;
        const lift = len - home[ib];
        for (let i = 0; i < N; i++) {
          const d = angDiff(angles[i], dir);
          const w = Math.exp(-(d * d) / (2 * SPREAD * SPREAD));
          if (w < 0.01) continue;
          if (w > weight[i]) {
            want[i] = home[i] + lift * w;
            weight[i] = w;
          }
        }
      }
    }

    const next = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const prev = r[(i + N - 1) % N];
      const nxt = r[(i + 1) % N];
      // Spring towards the resting shape, and smooth out only the bumps that
      // aren't part of it, so a shape that's been pulled into place stays put.
      const restBend = (home[(i + N - 1) % N] + home[(i + 1) % N]) / 2 - home[i];
      let a = (home[i] - r[i]) * SPRING + ((prev + nxt) / 2 - r[i] - restBend) * SMOOTH;
      v[i] = (v[i] + a) * DAMPING;
      let len = r[i] + v[i];
      if (weight[i] > 0) {
        // fingers win: pull strongly towards the bump
        const pull = Math.min(1, weight[i] * 0.6);
        const target = want[i];
        len += (target - len) * pull;
        v[i] *= 1 - pull;
      }
      const lo = minLength();
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
    if (celebrating) return;
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
    // Moving it around slowly shifts the colour through the rainbow.
    if (settings.stretchColour) hsl.h = (hsl.h + Math.hypot(p.x - gr.x, p.y - gr.y) * 0.04) % 360;
    gr.x = p.x;
    gr.y = p.y;
  });

  function release(e) {
    const gr = grabs.get(e.pointerId);
    if (!gr) return;
    grabs.delete(e.pointerId);
    const s = stretchOf(gr);
    // Keep the new shape: wherever the outline is now becomes where it rests.
    home = [...r];
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

  function toHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const rr = ((n >> 16) & 255) / 255;
    const gg = ((n >> 8) & 255) / 255;
    const bb = (n & 255) / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === rr) h = ((gg - bb) / d) % 6;
      else if (max === gg) h = (bb - rr) / d + 2;
      else h = (rr - gg) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function outlinePoints() {
    return r.map((len, i) => ({ x: cx + Math.cos(angles[i]) * len, y: cy + Math.sin(angles[i]) * len }));
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    // after a win the shape bursts: it swells a little and fades away
    const burst = celebrating ? Math.min(1, (performance.now() - popStart) / 450) : 0;
    if (burst >= 1) return;
    g.save();
    g.globalAlpha = 1 - burst;
    g.translate(cx, cy);
    g.scale(1 + burst * 0.12, 1 + burst * 0.12);
    g.translate(-cx, -cy);
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
    // a little brighter while it's being stretched
    let s = 0;
    for (const gr of grabs.values()) s = Math.max(s, stretchOf(gr));
    // Same brightness for every colour, so each shade of the rainbow looks equally bold.
    g.fillStyle = `hsl(${hsl.h.toFixed(1)}, 88%, ${(58 + s * 8).toFixed(1)}%)`;
    g.fill();
    g.lineWidth = thick();
    g.lineJoin = 'round';
    g.strokeStyle = `hsl(${hsl.h.toFixed(1)}, 80%, 36%)`;
    g.stroke();
    g.restore();

  }

  // ---- loop, sizing, start and stop ------------------------------------------------------

  // ---- winning: fill the screen ------------------------------------------------------

  const polyArea = (lens) => {
    let a = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      a += lens[i] * lens[j] * Math.sin(angles[j] - angles[i] + (j === 0 ? Math.PI * 2 : 0));
    }
    return Math.abs(a) / 2;
  };

  // How much of the screen the shape covers, compared with the most it could.
  function coverage() {
    return polyArea(r) / polyArea(angles.map(maxLength));
  }

  // How close the emptiest direction is to the screen edge (0..1). This stops a
  // shape that's huge on one side but still leaves a big gap elsewhere from counting.
  function reach() {
    let worst = 1;
    for (let i = 0; i < N; i++) worst = Math.min(worst, r[i] / maxLength(angles[i]));
    return worst;
  }

  // The screen counts as full when enough of it is covered AND the shape gets
  // close to the edge in every direction.
  const GOALS = {
    full: { area: 0.95, reach: 0.8 },
    most: { area: 0.85, reach: 0.6 },
  };

  function win() {
    celebrating = true;
    grabs.clear();
    stopHum();
    popStart = performance.now();
    for (let k = 0; k < 6; k++) later(() => EFFECTS.pop(audio(), master), k * 70);
    const fill = `hsl(${hsl.h.toFixed(1)}, 88%, 58%)`;
    Celebrate.run([fill], () => {
      celebrating = false;
      newShape();
    });
  }

  function loop() {
    if (!running) return;
    if (!celebrating) step();
    updateHum();
    const goal = GOALS[settings.stretchWin];
    if (!celebrating && goal && coverage() >= goal.area && reach() >= goal.reach) win();
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
    // same shape, fitted to the new screen (keeping any pulls, scaled to fit)
    const kept = home.map((h, i) => h / base[i]);
    fitHome();
    home = base.map((b, i) => b * kept[i]);
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
    timers.forEach(clearTimeout);
    timers = [];
    Celebrate.stop();
    celebrating = false;
    grabs.clear();
    stopHum();
    window.removeEventListener('resize', resize);
  }

  // Grown-ups can swap in a new shape from settings.
  function reset() {
    if (running && !celebrating) newShape();
  }

  // A copy of the outline points (used by tests to check it never crosses itself).
  const outline = () => outlinePoints();

  return { start, stop, reset, outline, coverage, reach };
})();
