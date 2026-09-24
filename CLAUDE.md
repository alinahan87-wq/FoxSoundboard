# Fox's Games

A toddler games app (PWA) for an Android tablet, for an autistic toddler. Plain HTML/CSS/JS with no
build step: `index.html`, `style.css`, `sounds.js`, `celebrate.js`, `colour.js`, `fox.js`, `numbers.js`, `scratch.js`, `bounce.js`, `blocks.js`, `stretch.js`, `pattern.js`, `circuit.js`, `app.js`, `sw.js`.
Third-party code lives in `vendor/` (Matter.js 0.19.0 physics, MIT), kept locally so the app works offline.

## Adding a new game (mode)

Every game must follow this pattern:

1. **Screen:** add a `<main id="…" data-mode="<name>" hidden>` in `index.html`.
2. **Code:** put the game in its own file (like `colour.js`) exposing `{ start, stop }`.
   `stop()` must cancel timers, clear effects and leave the game safe to restart. Add the
   `<script>` before `app.js`, and add the file to `FILES` in `sw.js`.
3. **Register it** in `GAMES` in `app.js`.
4. **Activity card:** add a `.mode-card` radio (`name="mode" value="<name>"`) to the second group
   of the game picker (the `#games` dialog, opened by holding ▶ in the top-right corner; the first
   group is Soundboard and Circuit). Games are only switchable from there, never from the child's screen.
   Keep game content clear of the top-right (▶) and bottom-right (⚙️) corners.
5. **Circuit:** games take `start({ onDone })`. When `onDone` is set, a win (always ending with the
   `Celebrate` bubbles) calls `onDone()` instead of starting a new round. Add the game to `STEPS` in
   `circuit.js`, and add `circuit` to its settings section's `data-mode` (e.g. `data-mode="numbers circuit"`).
   Free-play toys with no goal (like Bouncy ball, Building blocks and Endless pattern) stay out of the circuit.
6. **Game-specific settings** go in their own `<section data-mode="<name>">` in the settings dialog
   (`#settings`, opened by holding ⚙️),
   so they only appear while that game is selected. Settings shared by every game go under
   "All games". Add new setting defaults to `DEFAULTS` in `app.js`.
7. Bump `VERSION` in `sw.js`.

## Design rules for games

- Big touch targets, no words on the child's screen, respond on `pointerdown`.
- Sounds are gentle and cheerful and go through `master` (volume and limiter). Use `EFFECTS`/`SYNTHS`
  in `sounds.js`.
- Winning uses the shared `Celebrate.run(colours, onDone)` in `celebrate.js` (ta-da plus bubbles).
  Call `Celebrate.stop()` in the game's `stop()`. Use `PALETTE` for colours.
- Respect `prefers-reduced-motion` where there's big motion.

## Publishing

- **Phone preview (for testing):** a claude.ai artifact built by bundling everything into one HTML
  file. It has no service worker, and `alert()` doesn't show there.
- **Tablet:** GitHub Pages, deployed **manually only** (Actions → Deploy to GitHub Pages →
  Run workflow). Don't publish to the tablet unless the user asks. New work goes to the phone
  preview first.
