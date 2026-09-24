/* global audio, master, EFFECTS, SYNTHS */
/* exported Celebrate, PALETTE */
'use strict';

// The shared "you did it!" moment used by the games: a ta-da, then cartoon
// bubbles float up the screen (they pop when tapped), then everything clears.

const PALETTE = [
  { name: 'red',    hex: '#ff4b4b' },
  { name: 'orange', hex: '#ff9600' },
  { name: 'yellow', hex: '#ffc800' },
  { name: 'green',  hex: '#58cc02' },
  { name: 'blue',   hex: '#1cb0f6' },
  { name: 'purple', hex: '#9b59f5' },
  { name: 'pink',   hex: '#ff86d0' },
];

const Celebrate = (() => {
  const DURATION_MS = 4500;
  const layer = document.getElementById('bubbles');
  let timers = [];

  const rand = (n) => Math.floor(Math.random() * n);
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  // `colours`: the hex colours that half the bubbles take; the rest are a mix.
  // `onDone`: called once the bubbles have cleared, to set up the next round.
  function run(colours, onDone) {
    stop();
    later(() => SYNTHS.complete(audio(), master), 180);
    for (let i = 0; i < 36; i++) later(() => bubble(colours), 150 + i * 45 + rand(80));
    later(() => layer.classList.add('clearing'), DURATION_MS - 500);
    later(() => {
      clear();
      onDone();
    }, DURATION_MS);
  }

  function bubble(colours) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = 50 + rand(90);
    const c = Math.random() < 0.5 ? colours[rand(colours.length)] : PALETTE[rand(PALETTE.length)].hex;
    b.style.setProperty('--c', c);
    b.style.setProperty('--size', `${size}px`);
    b.style.setProperty('--x', `${rand(100)}vw`);
    b.style.setProperty('--rise', `${2400 + rand(1600)}ms`);
    b.style.setProperty('--sway', `${900 + rand(700)}ms`);
    b.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 40}px`);
    b.innerHTML = '<span class="bubble-body"></span>';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b.classList.contains('popped')) return;
      b.classList.add('popped');
      EFFECTS.pop(audio(), master);
      setTimeout(() => b.remove(), 200);
    });
    b.addEventListener('animationend', (e) => {
      if (e.animationName === 'rise') b.remove();
    });
    layer.appendChild(b);
  }

  function clear() {
    layer.innerHTML = '';
    layer.classList.remove('clearing');
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    clear();
  }

  return { run, stop };
})();
