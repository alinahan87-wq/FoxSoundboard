/* global Matter, audio, master, EFFECTS, PALETTE, settings */
/* exported BlocksGame */
'use strict';

// Building blocks: 8 squares, 4 long rectangles and 4 triangles with real
// gravity (Matter.js does the physics). Most of them tumble in from the top at
// the start. Drag them around with a finger and stack them up to build
// things. A good bump makes a marimba note and changes the block's colour.
// No goal, just play.

const BlocksGame = (() => {
  const { Engine, Bodies, Body, Composite, Constraint, Query, Events, Sleeping } = Matter;
  const STEP_MS = 1000 / 60;
  const BUMP_SPEED = 2.2;      // how hard a hit has to be to count as a bump
  const BUMP_COOLDOWN_MS = 350; // per block, so resting contacts don't chatter
  const MAX_SOUNDS_PER_S = 14;

  const screen = document.getElementById('blocks-game');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');
  const colours = PALETTE.map((p) => p.hex);

  let engine = null;
  let walls = [];
  let blocks = [];
  const drags = new Map(); // pointerId -> constraint, so several fingers can drag at once
  let W = 0;
  let H = 0;
  let running = false;
  let frame = 0;
  let lastT = 0;
  let acc = 0;
  let recentSounds = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const unit = () => Math.min(W, H) * 0.11; // the side of a square block

  // ---- world ---------------------------------------------------------------

  function makeWalls() {
    if (walls.length) Composite.remove(engine.world, walls);
    const t = 400; // thick, so fast blocks can't tunnel through
    const opts = { isStatic: true, friction: 1, label: 'wall' };
    walls = [
      Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, opts),          // floor
      Bodies.rectangle(-t / 2, H / 2 - H, t, H * 4, opts),             // left
      Bodies.rectangle(W + t / 2, H / 2 - H, t, H * 4, opts),          // right
      Bodies.rectangle(W / 2, -H * 1.5 - t / 2, W + t * 2, t, opts),   // a lid well above the screen
    ];
    Composite.add(engine.world, walls);
  }

  function makeBlock(kind, x, y) {
    const s = unit();
    const opts = {
      friction: 0.9,
      frictionStatic: 1.2,
      restitution: 0.08,
      density: 0.002,
      chamfer: kind === 'triangle' ? undefined : { radius: s * 0.12 },
      angle: rnd(-0.6, 0.6),
    };
    let body;
    if (kind === 'square') body = Bodies.rectangle(x, y, s, s, opts);
    else if (kind === 'rect') body = Bodies.rectangle(x, y, s * 2, s, opts);
    else body = Bodies.polygon(x, y, 3, s * 0.72, opts);
    body.kind = kind;
    body.colour = Math.floor(Math.random() * colours.length);
    body.lastBump = 0;
    body.pop = 0; // a little flash when it changes colour
    return body;
  }

  function dropBlocks() {
    if (blocks.length) Composite.remove(engine.world, blocks);
    const kinds = [
      ...Array(8).fill('square'),
      ...Array(4).fill('rect'),
      ...Array(4).fill('triangle'),
    ].sort(() => Math.random() - 0.5);
    const s = unit();
    blocks = kinds.map((kind, i) => {
      // A few start on the floor; the rest fall in from above, one after another.
      const onFloor = i < 4;
      const x = rnd(s * 1.2, W - s * 1.2);
      const y = onFloor ? H - s * 0.6 : -s * (1 + (i - 4) * 1.4) - rnd(0, s);
      return makeBlock(kind, x, y);
    });
    Composite.add(engine.world, blocks);
  }

  function setupEngine() {
    engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    Events.on(engine, 'collisionStart', onCollision);
  }

  // ---- bumps: sound and colour -----------------------------------------------

  function onCollision(e) {
    const now = performance.now();
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (speed < BUMP_SPEED) continue;
      for (const body of [a, b]) {
        if (!body.kind || now - body.lastBump < BUMP_COOLDOWN_MS) continue;
        body.lastBump = now;
        if (settings.blocksRecolour) {
          body.colour = (body.colour + 1 + Math.floor(Math.random() * (colours.length - 1))) % colours.length;
          body.pop = 1;
        }
        bumpSound(body.kind, Math.min(1, speed / 14));
      }
    }
  }

  function bumpSound(kind, strength) {
    const now = performance.now();
    recentSounds = recentSounds.filter((t) => now - t < 1000);
    if (recentSounds.length >= MAX_SOUNDS_PER_S) return;
    recentSounds.push(now);
    EFFECTS.marimba(audio(), master, kind, strength);
  }

  // ---- dragging --------------------------------------------------------------

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = point(e);
    const hit = Query.point(blocks, p).find((b) => ![...drags.values()].some((c) => c.bodyB === b));
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    Sleeping.set(hit, false);
    // Hold the block where the finger touched it, so it can swing and tilt naturally.
    const local = Matter.Vector.rotate(Matter.Vector.sub(p, hit.position), -hit.angle);
    const c = Constraint.create({ pointA: p, bodyB: hit, pointB: Matter.Vector.rotate(local, hit.angle), stiffness: 0.25, damping: 0.1, length: 0 });
    c.localPoint = local;
    Composite.add(engine.world, c);
    drags.set(e.pointerId, c);
    EFFECTS.marimba(audio(), master, hit.kind, 0.25);
  });

  canvas.addEventListener('pointermove', (e) => {
    const c = drags.get(e.pointerId);
    if (!c) return;
    c.pointA = point(e);
    Sleeping.set(c.bodyB, false);
  });

  function release(e) {
    const c = drags.get(e.pointerId);
    if (!c) return;
    Composite.remove(engine.world, c);
    drags.delete(e.pointerId);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---- loop and drawing ---------------------------------------------------------

  function loop(t) {
    if (!running) return;
    acc += Math.min(100, t - lastT);
    lastT = t;
    while (acc >= STEP_MS) {
      // keep the grab point on the block as it rotates
      for (const c of drags.values()) c.pointB = Matter.Vector.rotate(c.localPoint, c.bodyB.angle);
      Engine.update(engine, STEP_MS);
      acc -= STEP_MS;
    }
    for (const b of blocks) b.pop = Math.max(0, b.pop - 0.06);
    draw();
    frame = requestAnimationFrame(loop);
  }

  // Darken a #rrggbb colour by `amount` percent, for the block outlines.
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const k = 1 - amount / 100;
    const r = Math.round(((n >> 16) & 255) * k);
    const gr = Math.round(((n >> 8) & 255) * k);
    const b = Math.round((n & 255) * k);
    return `rgb(${r}, ${gr}, ${b})`;
  }

  function drawBlock(b) {
    const v = b.vertices;
    const hex = colours[b.colour];
    g.beginPath();
    g.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) g.lineTo(v[i].x, v[i].y);
    g.closePath();
    g.fillStyle = hex;
    g.fill();
    g.lineJoin = 'round';
    g.lineWidth = Math.max(3, unit() * 0.06);
    g.strokeStyle = shade(hex, 30);
    g.stroke();

    // a soft shine towards the block's top-left, turning with the block
    g.save();
    g.translate(b.position.x, b.position.y);
    g.rotate(b.angle);
    g.globalAlpha = 0.35;
    g.fillStyle = '#fff';
    const s = unit();
    g.beginPath();
    if (b.kind === 'triangle') g.ellipse(-s * 0.05, -s * 0.05, s * 0.14, s * 0.08, -0.6, 0, Math.PI * 2);
    else if (b.kind === 'rect') g.ellipse(-s * 0.55, -s * 0.22, s * 0.3, s * 0.08, 0, 0, Math.PI * 2);
    else g.ellipse(-s * 0.18, -s * 0.22, s * 0.16, s * 0.07, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    if (b.pop > 0) {
      g.save();
      g.globalAlpha = b.pop * 0.6;
      g.lineWidth = unit() * 0.12 * b.pop;
      g.strokeStyle = '#fff';
      g.stroke();
      g.restore();
    }
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    for (const b of blocks) drawBlock(b);
  }

  // ---- sizing, start and stop ---------------------------------------------------------

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
    if (!engine || (oldW === W && oldH === H)) return;
    makeWalls();
    // keep every block inside the new screen
    for (const b of blocks) {
      Body.setPosition(b, {
        x: Math.min(Math.max(b.position.x, unit()), W - unit()),
        y: Math.min(b.position.y, H - unit()),
      });
      Sleeping.set(b, false);
    }
  }

  function start() {
    stop();
    resize();
    setupEngine();
    makeWalls();
    dropBlocks();
    running = true;
    lastT = performance.now();
    acc = 0;
    frame = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    drags.clear();
    if (engine) {
      Events.off(engine);
      Engine.clear(engine);
      engine = null;
    }
    walls = [];
    blocks = [];
    window.removeEventListener('resize', resize);
  }

  // Grown-ups can tip out a fresh set from settings.
  function reset() {
    if (running) dropBlocks();
  }

  return { start, stop, reset };
})();
