/* global audio, master, EFFECTS, SYNTHS, Celebrate, PALETTE */
/* exported NumbersGame */
'use strict';

// Count to 10: the numbers 1-10 are scattered over the screen in different
// colours and sizes. Tapping the next number in order plays a note and clears
// it. Tapping the wrong one brings every number back in a new spot to start
// again. Clearing all ten celebrates.

const NumbersGame = (() => {
  const COUNT = 10;
  const screen = document.getElementById('numbers-game');
  let nums = [];     // nums[i] is the button for number i + 1
  let next = 1;      // the number he needs to tap next
  let busy = false;  // ignore taps while numbers move or during the celebration
  let timers = [];

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

  function build() {
    screen.innerHTML = '';
    nums = [];
    for (let n = 1; n <= COUNT; n++) {
      const el = document.createElement('button');
      el.className = 'num';
      el.textContent = String(n);
      el.setAttribute('aria-label', `Number ${n}`);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        tap(n, el);
      });
      screen.appendChild(el);
      nums.push(el);
    }
  }

  // Give every number a new place, size, colour and tilt. The screen is split
  // into a grid of cells and each number gets its own cell, so none overlap.
  function layout() {
    const w = screen.clientWidth;
    const h = screen.clientHeight;
    const landscape = w >= h;
    const cols = landscape ? 5 : 4;
    const rows = landscape ? 4 : 5;
    const pad = Math.min(w, h) * 0.03;
    const cellW = (w - pad * 2) / cols;
    const cellH = (h - pad * 2) / rows;
    // Every cell except the bottom-right one, which is where the settings gear sits.
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!(r === rows - 1 && c === cols - 1)) cells.push({ r, c });
      }
    }
    const picks = shuffled(cells).slice(0, COUNT);
    const colours = shuffled(PALETTE.map((p) => p.hex));

    nums.forEach((el, i) => {
      const { r, c } = picks[i];
      const wide = i + 1 === 10 ? 1.25 : 0.8; // "10" needs more room than one digit
      const room = Math.min(cellW / wide, cellH);
      const size = room * (0.6 + Math.random() * 0.35);
      const boxW = size * wide;
      const left = pad + c * cellW + Math.random() * (cellW - boxW);
      const top = pad + r * cellH + Math.random() * (cellH - size);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${boxW}px`;
      el.style.height = `${size}px`;
      el.style.setProperty('--fs', `${size * 0.9}px`);
      el.style.setProperty('--c', colours[i % colours.length]);
      el.style.setProperty('--rot', `${(Math.random() * 2 - 1) * 10}deg`);
    });
  }

  function popIn(el, delay) {
    el.classList.remove('gone');
    el.animate([
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1.15)', opacity: 1, offset: 0.7 },
      { transform: 'none' },
    ], { duration: 420, delay, easing: 'ease-out', fill: 'backwards' });
  }

  // A fresh round: every number pops in at a new spot.
  function newRound() {
    next = 1;
    layout();
    shuffled(nums).forEach((el, i) => popIn(el, i * 60));
  }

  // After a wrong tap: numbers still showing glide to their new spots and the
  // ones already cleared pop back in.
  function reshuffle() {
    next = 1;
    const before = new Map(nums.map((el) => [el, el.getBoundingClientRect()]));
    const wasGone = new Set(nums.filter((el) => el.classList.contains('gone')));
    layout();
    nums.forEach((el, i) => {
      if (wasGone.has(el)) {
        popIn(el, 150 + i * 40);
        return;
      }
      const from = before.get(el);
      const to = el.getBoundingClientRect();
      const sx = from.width / to.width;
      el.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx})` },
        { transform: 'none' },
      ], { duration: 600, easing: 'cubic-bezier(.3, 1.2, .5, 1)' });
    });
    later(() => { busy = false; }, 900);
  }

  function tap(n, el) {
    if (busy || el.classList.contains('gone')) return;
    if (n === next) {
      EFFECTS.count(audio(), master, n - 1);
      el.animate([
        { transform: 'none', opacity: 1 },
        { transform: 'scale(1.5)', opacity: 0 },
      ], { duration: 220, easing: 'ease-out' });
      later(() => el.classList.add('gone'), 200);
      next++;
      if (next > COUNT) {
        busy = true;
        later(() => Celebrate.run(PALETTE.map((p) => p.hex), () => {
          newRound();
          later(() => { busy = false; }, 700);
        }), 250);
      }
      return;
    }
    // Wrong number: a gentle "oops", a little wobble, then everything comes back.
    busy = true;
    SYNTHS.wrong(audio(), master);
    el.classList.remove('nope');
    void el.offsetWidth; // restart the animation
    el.classList.add('nope');
    later(reshuffle, 650);
  }

  function onResize() {
    if (!screen.hidden && !busy) layout();
  }

  function start() {
    if (!nums.length) build();
    stop();
    newRound();
    later(() => { busy = false; }, 700);
    busy = true;
    window.addEventListener('resize', onResize);
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    Celebrate.stop();
    busy = false;
    window.removeEventListener('resize', onResize);
  }

  return { start, stop };
})();
