/* global audio, master, EFFECTS, Celebrate, PALETTE */
/* exported ColourGame */
'use strict';

// Colour match: four big squares. Each tap moves a square on to the next
// colour. When all four are the same colour, bubbles float up and the squares
// get new random colours.

const ColourGame = (() => {
  const COLOURS = PALETTE;
  const SQUARES = 4;

  const screen = document.getElementById('colour-game');
  const grid = screen.querySelector('.squares');
  let squares = [];
  let values = [];
  let celebrating = false;

  const rand = (n) => Math.floor(Math.random() * n);

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
    screen.classList.add('won');
    Celebrate.run([COLOURS[values[0]].hex], () => {
      screen.classList.remove('won');
      randomise();
      celebrating = false;
    });
  }

  function start() {
    if (!squares.length) build();
    randomise();
  }

  function stop() {
    Celebrate.stop();
    celebrating = false;
    screen.classList.remove('won');
  }

  return { start, stop };
})();
