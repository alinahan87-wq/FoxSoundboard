# 🦊 Fox's Games

A simple, toddler-proof soundboard for an Android tablet: eight big, bright buttons
that each play a fun sound. It's styled after the Duolingo "correct!", "lesson complete",
"streak" and similar sounds.

It's a web app (PWA). You install it from Chrome onto the home screen, it opens
full-screen like a normal app, and it works with no internet.

## Toddler-friendly by design

- **Big buttons, no words.** Just colours and pictures. Sound plays the instant a finger lands.
- **Calm and predictable.** No pop-ups, no ads, no menus.
- **Eight activities.** Soundboard; Colour match (tap the four squares until they're all the same colour, then bubbles!); Spell FOX (tap the three letters until they read F-O-X); Count to 10 (tap the scattered numbers in order); Scratch & reveal (scratch away a pattern to find an animal, whose name is then shown and spoken); Bouncy ball (tap to bounce it, hold to power it up for bigger, sparklier bounces); Building blocks (drag and stack blocks that fall with real gravity); and Stretchy shape (pull the outline of a big shape to reshape it; it keeps its new shape). Switch between them from the grown-up game menu. **Circuit** plays the four goal games in turn, moving on after each win.
- **Surprise shuffle.** Every 10 taps the buttons tumble around and land in new spots (can be turned off in settings).
- **Mash-proof.** Only one sound plays at a time (or they can overlap; it's a setting).
  A built-in limiter stops piled-up sounds from getting too loud.
- **No accidental exits.** No long-press menus, no zooming, no scrolling. The screen stays awake.
- **Grown-up gates.** Two faint buttons that only open when *held* for 2 seconds:
  ▶ in the top-right corner picks the game, and ⚙️ in the bottom-right corner has the
  settings for the game that's on.
- **Gentle sounds.** The "oops" sound is a soft bwoop, not a harsh buzzer.

## Putting it on the tablet

1. **Publish it (one-time):** in this GitHub repo go to **Settings → Pages**, and under
   *Build and deployment* set **Source** to **GitHub Actions**. Then go to the **Actions**
   tab → **Deploy to GitHub Pages** → **Run workflow**. That publishes the app to
   `https://<your-username>.github.io/FoxSoundboard/`. Run it again whenever you want
   the tablet to get the latest changes.
2. On the tablet, open that link in **Chrome**.
3. Tap **⋮ → Add to Home screen → Install**.
4. Open it from the new home-screen icon. It runs full-screen.

**Recommended:** turn on **App pinning** (Settings → Security and privacy → More security
settings → Pin app) so he can't swipe out of it. Open the app, go to Recents, tap the app's
icon and choose **Pin this app**. To unpin, hold Back + Recents.

## Getting the real Duolingo sounds

The app ships with built-in sounds in the same spirit. Duolingo's own sound effects belong
to Duolingo, so they aren't bundled here, but you can load them yourself for personal use:

1. On the tablet (or a phone), swipe down and start **Screen recorder**, with
   **Sound → Media sounds** selected.
2. Open Duolingo and do a lesson (or just a few questions) to trigger the sounds you want.
3. Stop recording. Trim the video in Gallery (Edit ✂️) to roughly one sound per clip.
   It doesn't have to be exact.
4. In the soundboard, hold ⚙️ for 2 seconds, tap **Choose file** next to a button, and pick
   the clip. MP3/M4A/WAV and MP4 screen recordings all work, and silence at the start and
   end is trimmed automatically.

Sounds are saved on the tablet itself and keep working offline. **Reset** puts the
built-in sound back.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page layout and the settings dialog |
| `style.css` | Look and feel (landscape 4×2 grid, portrait 2×4) |
| `sounds.js` | The 8 buttons (label, emoji, colour) and their built-in synthesised sounds |
| `app.js` | Audio playback, custom-sound storage, grown-up gate, settings, switching activities |
| `celebrate.js` | The shared win celebration (ta-da and bubbles) |
| `colour.js` | The Colour match activity |
| `fox.js` | The Spell FOX activity |
| `numbers.js` | The Count to 10 activity |
| `scratch.js` | The Scratch & reveal activity |
| `bounce.js` | The Bouncy ball activity |
| `blocks.js` | The Building blocks activity (physics by Matter.js in `vendor/`) |
| `stretch.js` | The Stretchy shape activity |
| `circuit.js` | Circuit: plays the games one after another |
| `sw.js` | Offline cache. **Bump `VERSION`** when you change any file |
| `manifest.webmanifest`, `icons/` | What makes it installable as an app |

To try it on a computer, run `python3 -m http.server` in this folder and open
http://localhost:8000.

To change a button's picture or colour, edit the `BUTTONS` list in `sounds.js`.
