/* global audio, master, EFFECTS, SYNTHS, PALETTE, settings, say */
/* exported ScratchGame */
'use strict';

// Scratch & reveal: a cartoon animal hides under a colourful pattern. Tapping
// or dragging a finger scratches the pattern away. Once it's (nearly) all
// gone, the animal does a happy dance and its name appears and is spoken.
// Then a new animal hides under a new pattern.

const ScratchGame = (() => {
  const ANIMALS = [
    ['🐶', 'Dog'], ['🐱', 'Cat'], ['🦊', 'Fox'], ['🐸', 'Frog'], ['🐷', 'Pig'],
    ['🐮', 'Cow'], ['🦁', 'Lion'], ['🐵', 'Monkey'], ['🐼', 'Panda'], ['🐰', 'Bunny'],
    ['🐯', 'Tiger'], ['🐨', 'Koala'], ['🐧', 'Penguin'], ['🐘', 'Elephant'], ['🦉', 'Owl'],
    ['🐻', 'Bear'], ['🐤', 'Chick'], ['🦄', 'Unicorn'], ['🐭', 'Mouse'], ['🐢', 'Turtle'],
    ['🐙', 'Octopus'], ['🐳', 'Whale'],
  ];
  const BRUSH = { big: 0.07, bigger: 0.1, huge: 0.14 }; // brush radius, as a share of the card
  const GRID = 20;          // the card is tracked as a 20×20 grid to see how much is cleared
  const DONE_AT = 0.9;      // reveal once 90% is scratched away; tiny corners don't count
  const ROUND_MS = 4800;

  const screen = document.getElementById('scratch-game');
  const card = screen.querySelector('.scratch-card');
  const animalEl = screen.querySelector('.animal');
  const nameEl = screen.querySelector('.animal-name');
  const canvas = screen.querySelector('canvas');
  const g = canvas.getContext('2d');

  let w = 0;
  let h = 0;
  let cleared = new Uint8Array(GRID * GRID);
  let clearedCount = 0;
  let done = false;
  let current = -1;
  let timers = [];
  let lastScratchSound = 0;
  const fingers = new Map(); // pointerId -> last point, so several fingers can scratch at once

  const rand = (n) => Math.floor(Math.random() * n);
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function shuffled(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ---- the cover pattern ---------------------------------------------------

  const PATTERNS = {
    stripes(a, b) {
      const s = Math.max(w, h) / 9;
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(Math.PI / 4);
      g.fillStyle = b;
      for (let x = -w * 1.5; x < w * 1.5; x += s * 2) g.fillRect(x, -h * 1.5, s, h * 3);
      g.restore();
    },
    dots(a, b, c) {
      const s = w / 6;
      for (let row = 0, y = s / 2; y < h + s; row++, y += s * 0.87) {
        for (let x = (row % 2) * s / 2; x < w + s; x += s) {
          g.fillStyle = b;
          g.beginPath();
          g.arc(x, y, s * 0.3, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = c;
          g.beginPath();
          g.arc(x + s / 2, y, s * 0.1, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    checks(a, b) {
      const s = w / 7;
      g.fillStyle = b;
      for (let y = 0, r = 0; y < h; y += s, r++) {
        for (let x = (r % 2) * s; x < w; x += s * 2) g.fillRect(x, y, s, s);
      }
    },
    zigzag(a, b, c) {
      const s = w / 7;
      g.lineWidth = s * 0.35;
      g.lineJoin = 'round';
      for (let y = -s, i = 0; y < h + s; y += s * 0.75, i++) {
        g.strokeStyle = i % 2 ? b : c;
        g.beginPath();
        for (let x = -s, up = true; x < w + s; x += s / 2, up = !up) {
          g.lineTo(x, y + (up ? 0 : s / 2));
        }
        g.stroke();
      }
    },
    confetti(a, b, c, d) {
      const size = w / 9;
      for (let i = 0; i < 90; i++) {
        g.save();
        g.translate(Math.random() * w, Math.random() * h);
        g.rotate(Math.random() * Math.PI);
        g.fillStyle = [b, c, d][i % 3];
        if (i % 2) {
          g.fillRect(-size / 2, -size / 5, size, size / 2.5);
        } else {
          g.beginPath();
          g.arc(0, 0, size / 3, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
    },
  };

  function drawCover() {
    const [a, b, c, d] = shuffled(PALETTE.map((p) => p.hex));
    const type = Object.keys(PATTERNS)[rand(Object.keys(PATTERNS).length)];
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    PATTERNS[type](a, b, c, d);
  }

  // ---- scratching ------------------------------------------------------------

  function brushRadius() {
    return Math.min(w, h) * (BRUSH[settings.scratchBrush] || BRUSH.bigger);
  }

  function scratch(x0, y0, x1, y1) {
    const r = brushRadius();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    g.lineWidth = r * 2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.beginPath();
    g.arc(x1, y1, r, 0, Math.PI * 2);
    g.fill();

    // Mark which grid cells the brush has passed over.
    const cw = w / GRID;
    const ch = h / GRID;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (r / 2)));
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * (s / steps);
      const y = y0 + (y1 - y0) * (s / steps);
      const c0 = Math.max(0, Math.floor((x - r) / cw));
      const c1 = Math.min(GRID - 1, Math.floor((x + r) / cw));
      const r0 = Math.max(0, Math.floor((y - r) / ch));
      const r1 = Math.min(GRID - 1, Math.floor((y + r) / ch));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const i = row * GRID + col;
          if (cleared[i]) continue;
          if (Math.hypot((col + 0.5) * cw - x, (row + 0.5) * ch - y) <= r) {
            cleared[i] = 1;
            clearedCount++;
          }
        }
      }
    }

    const now = performance.now();
    if (now - lastScratchSound > 110) {
      lastScratchSound = now;
      EFFECTS.scratch(audio(), master);
    }
    if (clearedCount / cleared.length >= DONE_AT) reveal();
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (done) return;
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    fingers.set(e.pointerId, p);
    scratch(p.x, p.y, p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = fingers.get(e.pointerId);
    if (!prev || done) return;
    const p = point(e);
    fingers.set(e.pointerId, p);
    scratch(prev.x, prev.y, p.x, p.y);
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(ev, (e) => fingers.delete(e.pointerId));
  }

  // ---- rounds ----------------------------------------------------------------

  function sizeCanvas() {
    const rect = card.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function speak(text) {
    if (settings.scratchSpeak) say(text);
  }

  function newRound() {
    done = false;
    fingers.clear();
    let pick;
    do pick = rand(ANIMALS.length);
    while (pick === current);
    current = pick;

    const [emoji, name] = ANIMALS[pick];
    // cover first, so the new animal is never seen before it's scratched
    sizeCanvas();
    drawCover();
    cleared = new Uint8Array(GRID * GRID);
    clearedCount = 0;
    canvas.getAnimations().forEach((a) => a.cancel());
    canvas.style.opacity = '1';

    animalEl.textContent = emoji;
    animalEl.classList.remove('happy');
    card.style.setProperty('--bg', `color-mix(in srgb, ${PALETTE[rand(PALETTE.length)].hex} 28%, #fff)`);
    nameEl.textContent = name;
    nameEl.classList.remove('show');
    card.animate([
      { transform: 'scale(0.85)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration: 350, easing: 'ease-out' });
  }

  function reveal() {
    done = true;
    fingers.clear();
    canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-out' });
    later(() => { canvas.style.opacity = '0'; }, 390);
    later(() => {
      SYNTHS.complete(audio(), master);
      animalEl.classList.add('happy');
    }, 300);
    later(() => {
      nameEl.classList.add('show');
      speak(ANIMALS[current][1]);
    }, 1100);
    later(newRound, ROUND_MS);
  }

  function onResize() {
    const rect = card.getBoundingClientRect();
    if (done || (Math.abs(rect.width - w) < 2 && Math.abs(rect.height - h) < 2)) return;
    // The card changed size (the tablet was turned): start this animal's cover again.
    sizeCanvas();
    drawCover();
    cleared = new Uint8Array(GRID * GRID);
    clearedCount = 0;
  }

  function start() {
    stop();
    newRound();
    window.addEventListener('resize', onResize);
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    fingers.clear();
    say.stop();
    window.removeEventListener('resize', onResize);
  }

  return { start, stop };
})();
