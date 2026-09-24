/* global audio, master, EFFECTS, Celebrate */
/* exported FoxGame */
'use strict';

// Spell FOX: three big letter tiles. Each tap turns a tile into the next
// letter (F, O, X, F...), and each letter has its own colour and note. When the
// tiles read F-O-X, it celebrates, then mixes the letters up again.

const FoxGame = (() => {
  // The notes are C, E and G, so tapping out F-O-X plays a happy rising chord.
  const LETTERS = [
    { char: 'F', hex: '#ff9600', note: 0 },
    { char: 'O', hex: '#1cb0f6', note: 2 },
    { char: 'X', hex: '#58cc02', note: 3 },
  ];
  const WORD = [0, 1, 2]; // F, O, X

  const screen = document.getElementById('fox-game');
  const row = screen.querySelector('.letters');
  let tiles = [];
  let values = [];
  let celebrating = false;

  const rand = (n) => Math.floor(Math.random() * n);
  const spelled = () => values.every((v, i) => v === WORD[i]);

  function paint(i) {
    const letter = LETTERS[values[i]];
    tiles[i].style.setProperty('--c', letter.hex);
    tiles[i].firstChild.textContent = letter.char;
    tiles[i].setAttribute('aria-label', `Letter ${letter.char}`);
  }

  // Random letters, but never already spelling FOX.
  function randomise() {
    do values = tiles.map(() => rand(LETTERS.length));
    while (spelled());
    tiles.forEach((tile, i) => {
      paint(i);
      tile.animate([
        { transform: 'scale(0.6) rotate(-6deg)', opacity: 0.4 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'none' },
      ], { duration: 450, delay: i * 110, easing: 'ease-out', fill: 'backwards' });
    });
  }

  function build() {
    row.innerHTML = '';
    tiles = WORD.map((_, i) => {
      const tile = document.createElement('button');
      tile.className = 'letter-tile';
      tile.innerHTML = '<span class="letter" aria-hidden="true"></span>';
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        tap(i);
      });
      row.appendChild(tile);
      return tile;
    });
  }

  function tap(i) {
    if (celebrating) return;
    values[i] = (values[i] + 1) % LETTERS.length;
    paint(i);
    EFFECTS.ding(audio(), master, LETTERS[values[i]].note);
    const tile = tiles[i];
    tile.classList.remove('flip');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('flip');
    if (spelled()) celebrate();
  }

  function celebrate() {
    celebrating = true;
    screen.classList.add('won');
    Celebrate.run(LETTERS.map((l) => l.hex), () => {
      screen.classList.remove('won');
      randomise();
      celebrating = false;
    });
  }

  function start() {
    if (!tiles.length) build();
    randomise();
  }

  function stop() {
    Celebrate.stop();
    celebrating = false;
    screen.classList.remove('won');
  }

  return { start, stop };
})();
