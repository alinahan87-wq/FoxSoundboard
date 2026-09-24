/* global audio, master, EFFECTS, SYNTHS */
/* exported ColourGame */
'use strict';

// Colour match: four big squares. Each tap moves a square on to the next
// colour. When all four are the same colour, bubbles float up and the squares
// get new random colours.

const ColourGame = (() => {
  const COLOURS = [
    { name: 'red',    hex: '#ff4b4b' },
    { name: 'orange', hex: '#ff9600' },
    { name: 'yellow', hex: '#ffc800' },
    { name: 'green',  hex: '#58cc02' },
    { name: 'blue',   hex: '#1cb0f6' },
    { name: 'purple', hex: '#9b59f5' },
    { name: 'pink',   hex: '#ff86d0' },
  ];
  const SQUARES = 4;
  const CELEBRATE_MS = 4500;

  const screen = document.getElementById('colour-game');
  const grid = screen.querySelector('.squares');
  const bubbleLayer = document.getElementById('bubbles');
  let squares = [];
  let values = [];
  let celebrating = false;
  let timers = [];

  const rand = (n) => Math.floor(Math.random() * n);
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function paint(i) {
    squares[i].style.setProperty('--c', COLOURS[values[i]].hex);
    squares[i].setAttribute('aria-label', `${COLOURS[values[i]].name} square`);
  }

  // Random colours, but never already all matching.
  function randomise() {
    do values = squares.map(() => rand(COLOURS.length));
    while (values.every((v) => v === values[0]));
    squares.forEach((sq, i) => {
      paint(i);
      sq.animate([
        { transform: 'scale(0.6) rotate(-6deg)', opacity: 0.4 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'none' },
      ], { duration: 450, delay: i * 90, easing: 'ease-out', fill: 'backwards' });
    });
  }

  function build() {
    grid.innerHTML = '';
    squares = [];
    for (let i = 0; i < SQUARES; i++) {
      const sq = document.createElement('button');
      sq.className = 'colour-sq';
      sq.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        tap(i);
      });
      grid.appendChild(sq);
      squares.push(sq);
    }
  }

  function tap(i) {
    if (celebrating) return;
    values[i] = (values[i] + 1) % COLOURS.length;
    paint(i);
    EFFECTS.ding(audio(), master, values[i]);
    const sq = squares[i];
    sq.classList.remove('squish');
    void sq.offsetWidth; // restart the animation
    sq.classList.add('squish');
    if (values.every((v) => v === values[0])) celebrate();
  }

  function celebrate() {
    celebrating = true;
    const hex = COLOURS[values[0]].hex;
    screen.classList.add('won');
    later(() => SYNTHS.complete(audio(), master), 180);
    for (let i = 0; i < 36; i++) later(() => bubble(hex), 150 + i * 45 + rand(80));
    later(() => bubbleLayer.classList.add('clearing'), CELEBRATE_MS - 500);
    later(() => {
      bubbleLayer.innerHTML = '';
      bubbleLayer.classList.remove('clearing');
      screen.classList.remove('won');
      randomise();
      celebrating = false;
    }, CELEBRATE_MS);
  }

  // One cartoon bubble that floats from the bottom to the top of the screen.
  // Half take the matched colour, the rest are a mix so the screen fills with colour.
  function bubble(matchHex) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = 50 + rand(90);
    const c = Math.random() < 0.5 ? matchHex : COLOURS[rand(COLOURS.length)].hex;
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
    bubbleLayer.appendChild(b);
  }

  function start() {
    if (!squares.length) build();
    randomise();
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    celebrating = false;
    bubbleLayer.innerHTML = '';
    bubbleLayer.classList.remove('clearing');
    screen.classList.remove('won');
  }

  return { start, stop };
})();
