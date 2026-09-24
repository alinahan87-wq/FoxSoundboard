/* global ColourGame, FoxGame, NumbersGame, ScratchGame */
/* exported Circuit */
'use strict';

// Circuit: plays each game in turn. When a game is won (bubbles and all), the
// next one slides in. After the last game it goes back to the first. The order
// is always the same, so it stays predictable.

const Circuit = (() => {
  const STEPS = [
    ['colour', ColourGame],
    ['fox', FoxGame],
    ['numbers', NumbersGame],
    ['scratch', ScratchGame],
  ];
  let step = 0;
  let active = false;

  const screenFor = (name) => document.querySelector(`main[data-mode="${name}"]`);

  function show(n) {
    step = n;
    STEPS.forEach(([name, game], i) => {
      if (i !== n) game.stop();
      screenFor(name).hidden = i !== n;
    });
    const [name, game] = STEPS[n];
    game.start({ onDone: advance });
    screenFor(name).animate([
      { opacity: 0, transform: 'translateX(8%)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 450, easing: 'ease-out' });
  }

  function advance() {
    if (active) show((step + 1) % STEPS.length);
  }

  function start() {
    active = true;
    show(0);
  }

  function stop() {
    active = false;
    STEPS.forEach(([, game]) => game.stop());
  }

  return { start, stop };
})();
