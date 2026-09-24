/* global audio, master, EFFECTS, PALETTE, settings */
/* exported BounceGame */
'use strict';

// Bouncy ball: a smiley ball bounces around the screen. Tap anywhere and it
// hops to that spot and bounces from there. Hold a finger down to charge it
// up: it grows, and shakes when it's full. Let go and it launches; the more
// charge, the harder it bounces, with stars, colours and rings on big hits,
// until the energy wears off and it settles down again. No goal, just play.

const BounceGame = (() => {
  const CHARGE_MS = 1800; // how long a hold takes to fully charge
  const TRAIL = 10;

  const screen = document.getElementById('bounce-game');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let running = false;
  let frame = 0;
  let lastT = 0;
  const colours = PALETTE.map((p) => p.hex);

  const ball = {
    x: 0, y: 0, vx: 0, vy: 0,
    r: 0,           // current radius
    energy: 0,      // 0..1, from the last launch; wears off over time and bounces
    colour: 0,      // index into colours
    squash: 0,      // 0..1, how squashed it is right after a hit
    squashAxis: 'y',
    trail: [],
  };
  let hold = null;  // { id, start } while a finger is charging the ball
  let particles = [];
  let rings = [];
  let flash = null; // { colour, alpha }
  let hum = null;   // the rising "charging up" tone

  const baseR = () => Math.min(W, H) * 0.075;
  const gravity = () => H * (settings.bounceFloaty ? 1.3 : 2.4);
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- sizing and the main loop ----------------------------------------------

  function resize() {
    const rect = screen.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!ball.r) ball.r = baseR();
    ball.x = Math.min(Math.max(ball.x, ball.r), W - ball.r);
    ball.y = Math.min(Math.max(ball.y, ball.r), H - ball.r);
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0);
    lastT = t;
    update(dt);
    draw();
    frame = requestAnimationFrame(loop);
  }

  // ---- charging and launching ---------------------------------------------------

  function charge() {
    return hold ? Math.min(1, (performance.now() - hold.start) / CHARGE_MS) : 0;
  }

  function startHum() {
    if (!settings.bounceHum) return;
    const ctx = audio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + CHARGE_MS / 1000);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0175, ctx.currentTime + 0.15);
    osc.connect(gain).connect(master);
    osc.start();
    hum = { osc, gain };
  }

  function stopHum() {
    if (!hum) return;
    const ctx = audio();
    const { osc, gain } = hum;
    hum = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
    osc.stop(ctx.currentTime + 0.08);
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function moveBallTo(p) {
    ball.x = Math.min(Math.max(p.x, ball.r), W - ball.r);
    ball.y = Math.min(Math.max(p.y, ball.r), H - ball.r);
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (hold) return; // one finger at a time drives the ball
    canvas.setPointerCapture(e.pointerId);
    hold = { id: e.pointerId, start: performance.now() };
    moveBallTo(point(e));
    EFFECTS.pop(audio(), master);
    startHum();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (hold && e.pointerId === hold.id) moveBallTo(point(e));
  });

  function release(e) {
    if (!hold || e.pointerId !== hold.id) return;
    const c = charge();
    hold = null;
    stopHum();
    // A quick tap gives a little hop; a full charge sends it flying.
    ball.energy = Math.max(ball.energy * 0.5, c);
    // Launch angle, measured from straight up. A little hop goes nearly straight
    // up; the more charge, the wider the possible angles, so a full charge can
    // fly off almost sideways as well as high.
    const speed = H * (0.9 + 2.6 * c);
    const spread = (15 + 60 * c) * (Math.PI / 180); // 15° for a tap, up to 75° at full
    const angle = rnd(-spread, spread);
    ball.vx = Math.sin(angle) * speed * 1.2;
    ball.vy = -Math.cos(angle) * speed;
    if (c > 0.3) EFFECTS.whoosh(audio(), master);
    if (c > 0.6) burst(ball.x, ball.y, Math.round(24 * c), 1.2);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---- physics -----------------------------------------------------------------

  function update(dt) {
    const c = charge();
    // Size: grows while charging; after a launch it shrinks back as the energy wears off.
    const target = baseR() * (1 + 0.75 * (hold ? c : ball.energy));
    ball.r += (target - ball.r) * Math.min(1, dt * (hold ? 10 : 2.5));
    ball.squash = Math.max(0, ball.squash - dt * 5);

    if (!hold) {
      ball.energy = Math.max(0, ball.energy - dt * 0.12);
      ball.vy += gravity() * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      collide();
      ball.trail.unshift({ x: ball.x, y: ball.y, r: ball.r });
      if (ball.trail.length > TRAIL) ball.trail.pop();
    }

    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.vy += gravity() * 0.35 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.vspin * dt;
    }
    rings = rings.filter((r) => (r.life -= dt) > 0);
    if (flash && (flash.alpha -= dt * 0.8) <= 0) flash = null;
  }

  function collide() {
    const rest = 0.7 + 0.12 * ball.energy; // livelier bounces while it's charged up
    if (ball.y + ball.r > H) {
      ball.y = H - ball.r;
      if (ball.vy > 0) {
        const hit = ball.vy;
        if (hit < H * 0.25) {
          ball.vy = 0; // settled on the floor
          ball.vx *= 0.9;
        } else {
          ball.vy = -hit * rest;
          ball.vx *= 0.92;
          impact(ball.x, H, hit, 'y');
          ball.energy *= 0.8;
        }
      } else {
        ball.vx *= 0.96; // rolling friction
      }
    }
    if (ball.y - ball.r < 0 && ball.vy < 0) {
      ball.y = ball.r;
      impact(ball.x, 0, -ball.vy, 'y');
      ball.vy = -ball.vy * rest;
    }
    if (ball.x - ball.r < 0 && ball.vx < 0) {
      ball.x = ball.r;
      impact(0, ball.y, -ball.vx, 'x');
      ball.vx = -ball.vx * rest;
    }
    if (ball.x + ball.r > W && ball.vx > 0) {
      ball.x = W - ball.r;
      impact(W, ball.y, ball.vx, 'x');
      ball.vx = -ball.vx * rest;
    }
  }

  // The harder the hit, the bigger the show.
  function impact(x, y, speed, axis) {
    const s = Math.min(1, speed / (H * 2.6)); // 0 = gentle, 1 = huge
    const power = Math.min(1, s * (0.5 + ball.energy));
    ball.squash = 0.4 + 0.6 * s;
    ball.squashAxis = axis;
    EFFECTS.boing(audio(), master, s, baseR() / ball.r);
    if (power > 0.12) burst(x, y, Math.round(6 + 40 * power), 0.5 + power);
    if (power > 0.4) {
      rings.push({ x, y, life: 0.6, max: 0.6, colour: colours[ball.colour], size: ball.r * (2 + 4 * power) });
      ball.colour = (ball.colour + 1) % colours.length;
      if (power > 0.6) {
        flash = { colour: colours[ball.colour], alpha: 0.18 * power };
        EFFECTS.sparkle(audio(), master);
      }
    }
  }

  function burst(x, y, n, speed) {
    if (reduceMotion()) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(0.2, 1) * H * 0.9 * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - H * 0.3,
        size: rnd(0.25, 0.55) * baseR() * (0.6 + speed * 0.4),
        colour: colours[Math.floor(Math.random() * colours.length)],
        star: Math.random() < 0.6,
        spin: rnd(0, Math.PI),
        vspin: rnd(-6, 6),
        life: rnd(0.7, 1.4),
        max: 1.4,
      });
    }
  }

  // ---- drawing -----------------------------------------------------------------

  function star(x, y, r, spin) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = spin + (i * Math.PI) / 5 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }

  function drawBall(x, y, r, colour, alpha = 1) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    const sq = ball.squash * 0.35;
    if (alpha === 1 && sq > 0) {
      if (ball.squashAxis === 'y') g.scale(1 + sq, 1 - sq);
      else g.scale(1 - sq, 1 + sq);
    }
    const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, colour);
    grad.addColorStop(1, colour);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(3, r * 0.08);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.stroke();
    if (alpha === 1) drawFace(r);
    g.restore();
  }

  function drawFace(r) {
    const full = charge() >= 1;
    g.fillStyle = '#3c3c3c';
    // eyes: squeezed shut with excitement when fully charged
    for (const side of [-1, 1]) {
      if (full) {
        g.lineWidth = r * 0.08;
        g.strokeStyle = '#3c3c3c';
        g.beginPath();
        g.moveTo(side * r * 0.42, -r * 0.2);
        g.lineTo(side * r * 0.22, -r * 0.1);
        g.lineTo(side * r * 0.42, 0);
        g.stroke();
      } else {
        g.beginPath();
        g.ellipse(side * r * 0.3, -r * 0.12, r * 0.09, r * 0.14, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // smile, bigger with more energy
    const open = hold ? charge() : ball.energy;
    g.lineWidth = r * 0.08;
    g.strokeStyle = '#3c3c3c';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, r * 0.15, r * (0.28 + 0.1 * open), Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }

  function draw() {
    g.clearRect(0, 0, W, H);

    if (flash) {
      g.globalAlpha = flash.alpha;
      g.fillStyle = flash.colour;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }

    for (const ring of rings) {
      const t = 1 - ring.life / ring.max;
      g.globalAlpha = 1 - t;
      g.strokeStyle = ring.colour;
      g.lineWidth = 10 * (1 - t) + 2;
      g.beginPath();
      g.arc(ring.x, ring.y, ring.size * t, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;

    const colour = colours[ball.colour];
    // a colourful trail when it's moving fast with energy to spare
    if (!hold && ball.energy > 0.15) {
      ball.trail.forEach((p, i) => {
        if (i === 0) return;
        drawBall(p.x, p.y, p.r * (1 - i / (TRAIL * 1.4)), colours[(ball.colour + i) % colours.length], 0.25 * ball.energy * (1 - i / TRAIL));
      });
    }

    let { x, y } = ball;
    const c = charge();
    if (hold && c >= 1 && !reduceMotion()) {
      // full: it shakes with excitement
      x += rnd(-1, 1) * ball.r * 0.08;
      y += rnd(-1, 1) * ball.r * 0.08;
    }
    if (hold && c > 0) {
      // a glow that builds as it charges
      g.globalAlpha = 0.25 + 0.35 * c;
      g.fillStyle = colour;
      g.beginPath();
      g.arc(x, y, ball.r * (1.15 + 0.25 * c + (c >= 1 ? 0.08 * Math.sin(performance.now() / 60) : 0)), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    drawBall(x, y, ball.r, colour);

    for (const p of particles) {
      g.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      g.fillStyle = p.colour;
      if (p.star) {
        star(p.x, p.y, p.size, p.spin);
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // ---- start / stop ----------------------------------------------------------------

  function start() {
    stop();
    resize();
    // drop in from the middle so there's something moving straight away
    ball.r = baseR();
    ball.x = W / 2;
    ball.y = H * 0.35;
    ball.vx = rnd(-1, 1) * H * 0.2;
    ball.vy = 0;
    ball.energy = 0;
    ball.trail = [];
    running = true;
    lastT = performance.now();
    frame = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
    hold = null;
    stopHum();
    particles = [];
    rings = [];
    flash = null;
    window.removeEventListener('resize', resize);
  }

  return { start, stop };
})();
