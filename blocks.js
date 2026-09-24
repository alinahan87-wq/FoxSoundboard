/* global Matter, audio, master, EFFECTS, PALETTE, settings */
/* exported BlocksGame */
'use strict';

// Building blocks: 10 squares, 6 long rectangles and 6 triangles with real
// gravity (Matter.js does the physics). Most of them tumble in from the top at
// the start. Drag them around with a finger and stack them up to build
// things. Tipping the tablet tips the blocks, and a shake throws them all into
// the air. A good bump makes a marimba note and changes the block's colour.
// No goal, just play.

const BlocksGame = (() => {
  const { Engine, Bodies, Body, Composite, Constraint, Query, Events, Sleeping } = Matter;
  const STEP_MS = 1000 / 60;
  const BUMP_SPEED = 2.2;      // how hard a hit has to be to count as a bump
  const BUMP_COOLDOWN_MS = 350; // per block, so resting contacts don't chatter
  const MAX_SOUNDS_PER_S = 14;
  const ON_FLOOR = 5;           // blocks that start on the floor; the rest drop in from above
  const BUMP_VOLUME = 0.25; // bumps and grabs play at a quarter of full volume

  const screen = document.getElementById('blocks-game');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');
  const colours = PALETTE.map((p) => p.hex);

  let engine = null;
  let walls = [];
  let lid = null; // the ceiling at the top of the screen, added once every block has dropped in
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
      // side walls reach far up, so blocks dropping in from above stay inside them
      Bodies.rectangle(-t / 2, -H * 3, t, H * 8 + t, opts),            // left
      Bodies.rectangle(W + t / 2, -H * 3, t, H * 8 + t, opts),         // right
      // a lid far above the screen (well clear of where blocks start), used while they drop in
      Bodies.rectangle(W / 2, -H * 6 - t / 2, W + t * 2, t, opts),
    ];
    Composite.add(engine.world, walls);
    removeLid();
  }

  // Once every block is on screen, close the top so tipping the tablet upside
  // down or a big shake can't send blocks up out of sight.
  function addLidWhenReady() {
    if (lid || !blocks.length || blocks.some((b) => b.bounds.min.y < 2)) return;
    const t = 400;
    lid = Bodies.rectangle(W / 2, -t / 2, W + t * 2, t, { isStatic: true, friction: 1, label: 'wall' });
    Composite.add(engine.world, lid);
  }

  function removeLid() {
    if (lid) Composite.remove(engine.world, lid);
    lid = null;
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
    removeLid();
    const kinds = [
      ...Array(10).fill('square'),
      ...Array(6).fill('rect'),
      ...Array(6).fill('triangle'),
    ].sort(() => Math.random() - 0.5);
    const s = unit();
    blocks = kinds.map((kind, i) => {
      // A few start on the floor; the rest fall in from above, one after another.
      const onFloor = i < ON_FLOOR;
      const x = rnd(s * 1.2, W - s * 1.2);
      const y = onFloor ? H - s * 0.6 : -s * (1 + (i - ON_FLOOR) * 1.4) - rnd(0, s);
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
    EFFECTS.marimba(audio(), master, kind, strength, BUMP_VOLUME);
  }

  // ---- dragging --------------------------------------------------------------

  // How far outside a block a touch can land and still grab it. Fingers are
  // big and phone screens are small, so this is generous.
  const grabReach = () => Math.max(26, unit() * 0.45);

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // The closest point on a block's outline to p, and how far away it is.
  function closestOnBlock(body, p) {
    const v = body.vertices;
    let best = null;
    for (let i = 0; i < v.length; i++) {
      const a = v[i];
      const b = v[(i + 1) % v.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
      const q = { x: a.x + ex * t, y: a.y + ey * t };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!best || d < best.d) best = { q, d };
    }
    return best;
  }

  const isHeld = (b) => [...drags.values()].some((list) => list.some((c) => c.bodyB === b));

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = point(e);
    const free = blocks.filter((b) => !isHeld(b));
    // A touch right on a block grabs just that block. A touch in a gap grabs
    // whatever is within reach: often one block, sometimes a few together.
    let picks = Query.point(free, p).slice(0, 1).map((b) => ({ body: b, at: p }));
    if (!picks.length) {
      picks = free
        .map((b) => ({ body: b, ...closestOnBlock(b, p) }))
        .filter((x) => x.d <= grabReach())
        .sort((x, y) => x.d - y.d)
        .slice(0, 2) // at most the two nearest, so a touch never scoops up a whole pile
        .map((x) => ({ body: x.body, at: x.q }));
    }
    if (!picks.length) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* keep going without capture */ }
    const list = picks.map(({ body, at }) => {
      Sleeping.set(body, false);
      // Hold each block where it was touched (or its nearest edge), and keep it
      // the same distance from the finger as it started, so several blocks move
      // together without being pulled into each other.
      const local = Matter.Vector.rotate(Matter.Vector.sub(at, body.position), -body.angle);
      const c = Constraint.create({ pointA: { ...at }, bodyB: body, pointB: Matter.Vector.rotate(local, body.angle), stiffness: 0.25, damping: 0.1, length: 0 });
      c.localPoint = local;
      c.offset = Matter.Vector.sub(at, p);
      Composite.add(engine.world, c);
      return c;
    });
    drags.set(e.pointerId, list);
    EFFECTS.marimba(audio(), master, picks[0].body.kind, 0.25, BUMP_VOLUME); // grabbing is quiet too
  });

  canvas.addEventListener('pointermove', (e) => {
    const list = drags.get(e.pointerId);
    if (!list) return;
    const p = point(e);
    for (const c of list) {
      c.pointA = Matter.Vector.add(p, c.offset);
      Sleeping.set(c.bodyB, false);
    }
  });

  function release(e) {
    const list = drags.get(e.pointerId);
    if (!list) return;
    for (const c of list) Composite.remove(engine.world, c);
    drags.delete(e.pointerId);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---- tilting and shaking the tablet ----------------------------------------------

  // Gravity follows the way the tablet is tipped. Held upright, "down" is
  // whichever edge is lowest; lying flat on a table, down stays towards the
  // bottom of the screen and tipping it leans the blocks sideways.
  let tilt = { x: 0, y: 1 };  // smoothed gravity direction, in screen terms
  let lastShake = 0;
  let lastAcc = null;

  function screenGravity(acc) {
    // The sensor measures in the device's own frame; turn that into screen
    // directions for however the screen is currently rotated.
    const gx = -acc.x / 9.81;
    const gy = acc.y / 9.81;
    const angle = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * (Math.PI / 180);
    const c = Math.cos(-angle);
    const s = Math.sin(-angle);
    return { x: gx * c - gy * s, y: gx * s + gy * c };
  }

  function onMotion(e) {
    if (!running) return;
    const acc = e.accelerationIncludingGravity;
    if (settings.blocksTilt && acc && acc.x != null) {
      const t = screenGravity(acc);
      const m = Math.hypot(t.x, t.y);
      // flat: down the screen, leaning sideways with the tilt
      let fx = t.x * 2;
      let fy = 1;
      const fl = Math.hypot(fx, fy);
      fx /= fl;
      fy /= fl;
      // upright: true gravity
      const ux = m > 1e-3 ? t.x / m : 0;
      const uy = m > 1e-3 ? t.y / m : 1;
      const w = Math.min(1, Math.max(0, (m - 0.3) / 0.3));
      const target = { x: fx + (ux - fx) * w, y: fy + (uy - fy) * w };
      tilt.x += (target.x - tilt.x) * 0.2;
      tilt.y += (target.y - tilt.y) * 0.2;
      const tl = Math.hypot(tilt.x, tilt.y) || 1;
      setGravity(tilt.x / tl, tilt.y / tl);
    }
    // How hard the tablet was jolted: from the sensor's motion reading if it
    // has one, otherwise from how suddenly the tilt reading jumped.
    const lin = e.acceleration;
    let jolt = 0;
    if (lin && lin.x != null) {
      jolt = Math.hypot(lin.x, lin.y, lin.z || 0);
    } else if (acc && acc.x != null) {
      if (lastAcc) jolt = Math.hypot(acc.x - lastAcc.x, acc.y - lastAcc.y, (acc.z || 0) - (lastAcc.z || 0));
      lastAcc = { x: acc.x, y: acc.y, z: acc.z };
    }
    if (settings.blocksShake && jolt) {
      const now = performance.now();
      if (jolt > 14 && now - lastShake > 700) {
        lastShake = now;
        shake(Math.min(1, (jolt - 14) / 20 + 0.5));
      }
    }
  }

  function setGravity(x, y) {
    if (!engine) return;
    const moved = Math.abs(engine.gravity.x - x) + Math.abs(engine.gravity.y - y) > 0.08;
    engine.gravity.x = x;
    engine.gravity.y = y;
    // sleeping blocks don't notice gravity changing, so wake them when it does
    if (moved) for (const b of blocks) Sleeping.set(b, false);
  }

  // Throw every block up into the air.
  function shake(strength) {
    const s = unit() * 0.18 * strength;
    for (const b of blocks) {
      Sleeping.set(b, false);
      Body.setVelocity(b, { x: b.velocity.x + (Math.random() - 0.5) * s, y: b.velocity.y - s * (0.6 + Math.random() * 0.6) });
      Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.3 * strength);
    }
    EFFECTS.whoosh(audio(), master);
  }

  // While blocks are on screen, try to stop the screen itself from rotating
  // when the tablet is tipped. (Only works in the installed, full-screen app.)
  function lockRotation() {
    try {
      const o = screen.orientation;
      if (o && o.lock) o.lock(o.type).catch(() => {});
    } catch { /* not supported here */ }
  }

  function unlockRotation() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch { /* not supported here */ }
  }

  // ---- loop and drawing ---------------------------------------------------------

  function loop(t) {
    if (!running) return;
    acc += Math.min(100, t - lastT);
    lastT = t;
    while (acc >= STEP_MS) {
      // keep the grab point on the block as it rotates
      for (const list of drags.values()) for (const c of list) c.pointB = Matter.Vector.rotate(c.localPoint, c.bodyB.angle);
      Engine.update(engine, STEP_MS);
      acc -= STEP_MS;
    }
    for (const b of blocks) b.pop = Math.max(0, b.pop - 0.06);
    addLidWhenReady();
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
    tilt = { x: 0, y: 1 };
    window.addEventListener('devicemotion', onMotion);
    if (settings.blocksTilt) lockRotation();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    drags.clear();
    window.removeEventListener('devicemotion', onMotion);
    unlockRotation();
    if (engine) {
      Events.off(engine);
      Engine.clear(engine);
      engine = null;
    }
    walls = [];
    lid = null;
    blocks = [];
    window.removeEventListener('resize', resize);
  }

  // Grown-ups can tip out a fresh set from settings.
  function reset() {
    if (running) dropBlocks();
  }

  // Used by tests to check the tilt and shake handling.
  const debug = {
    onMotion,
    gravity: () => engine && { x: engine.gravity.x, y: engine.gravity.y },
    speeds: () => blocks.map((b) => b.speed),
    lidInfo: () => ({ lid: !!lid, highest: Math.round(Math.min(...blocks.map((b) => b.bounds.min.y))) }),
    blocks: () => blocks.map((b) => ({ x: b.position.x, y: b.position.y, box: b.bounds })),
    held: () => [...drags.values()].reduce((n, list) => n + list.length, 0),
    // deepest overlap (in px) between any two blocks being held
    heldOverlap: () => {
      const held = [...drags.values()].flat().map((c) => c.bodyB);
      let deepest = 0;
      for (let i = 0; i < held.length; i++) {
        for (const hit of Matter.Query.collides(held[i], held.slice(i + 1))) deepest = Math.max(deepest, hit.depth);
      }
      return deepest;
    },
  };

  // Turning tilt off in settings puts gravity straight back to "down".
  function tiltChanged() {
    if (!running) return;
    if (settings.blocksTilt) {
      lockRotation();
    } else {
      unlockRotation();
      tilt = { x: 0, y: 1 };
      setGravity(0, 1);
    }
  }

  return { start, stop, reset, debug, tiltChanged };
})();
