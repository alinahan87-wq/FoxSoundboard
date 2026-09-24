/* global BUTTONS, SYNTHS, EFFECTS, ColourGame, FoxGame, NumbersGame, ScratchGame, BounceGame, BlocksGame, StretchGame, PatternGame, Circuit */
'use strict';

// ---------------------------------------------------------------------------
// Settings (small per-device preferences)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  mode: 'soundboard', volume: 0.8, overlap: false, animate: true, shuffle: true,
  numbersRestart: false, numbersHint: true,
  scratchSpeak: true, scratchBrush: 'bigger',
  bounceFloaty: false, bounceHum: true,
  blocksRecolour: true,
  stretchShape: 'random', stretchSound: true, stretchColour: true, stretchWin: 'full',
  patternColourSpeed: 'slow',
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch { /* ignore */ }
}

const settings = loadSettings();
if (settings.stretchWin === 'nearly') settings.stretchWin = 'full'; // renamed setting

// ---------------------------------------------------------------------------
// Custom sound storage (IndexedDB, so files survive restarts and work offline)
// ---------------------------------------------------------------------------

const db = (() => {
  let dbPromise = null;
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('fox-soundboard', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('sounds');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function run(mode, fn) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('sounds', mode);
      const req = fn(tx.objectStore('sounds'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  return {
    get: (id) => run('readonly', (s) => s.get(id)),
    put: (id, value) => run('readwrite', (s) => s.put(value, id)),
    del: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

let ctx = null;
let master = null;
const buffers = new Map();   // id -> decoded AudioBuffer for custom sounds
const fileNames = new Map(); // id -> original file name, for the settings list
const playing = new Map();   // id -> { gain, sources[] } for the sound currently playing on that button

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = settings.volume;
    // A gentle limiter so a pile of overlapping sounds never gets painfully loud.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 12;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

async function decode(blob) {
  const data = await blob.arrayBuffer();
  const buf = await new Promise((resolve, reject) => audio().decodeAudioData(data, resolve, reject));
  return trimSilence(buf);
}

// Screen recordings have dead air at each end, so cut everything before the
// sound starts and after it stops. That way the button plays the instant it's tapped.
function trimSilence(buf, threshold = 0.02, padSec = 0.02) {
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const loud = (i) => chans.some((d) => Math.abs(d[i]) > threshold);
  let start = 0;
  let end = buf.length - 1;
  while (start < end && !loud(start)) start++;
  while (end > start && !loud(end)) end--;
  if (start >= end) return buf; // all quiet, leave it alone
  const pad = Math.floor(padSec * buf.sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(buf.length, end + pad * 4); // a bit more at the tail for natural decay
  const out = audio().createBuffer(buf.numberOfChannels, end - start, buf.sampleRate);
  chans.forEach((d, c) => out.copyToChannel(d.subarray(start, end), c));
  return out;
}

async function loadCustomSounds() {
  await Promise.all(BUTTONS.map(async (b) => {
    try {
      const rec = await db.get(b.id);
      if (!rec) return;
      fileNames.set(b.id, rec.name);
      buffers.set(b.id, await decode(rec.blob));
    } catch (err) {
      console.warn('Could not load custom sound for', b.id, err);
    }
  }));
}

function stopSound(id) {
  const p = playing.get(id);
  if (!p) return;
  playing.delete(id);
  const t = ctx.currentTime;
  // Fade out over 30 ms rather than cutting, so there's no click.
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + 0.03);
  setTimeout(() => p.gain.disconnect(), 60);
}

function stopAll() {
  for (const id of [...playing.keys()]) stopSound(id);
}

function play(id) {
  const c = audio();
  if (settings.overlap) stopSound(id); // re-tapping the same button restarts it
  else stopAll();                       // one sound at a time

  const gain = c.createGain();
  gain.connect(master);
  const entry = { gain };
  playing.set(id, entry);

  let endsAt;
  const buf = buffers.get(id);
  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start();
    endsAt = c.currentTime + buf.duration;
  } else {
    endsAt = SYNTHS[id](c, gain);
  }

  const ms = Math.max(0, (endsAt - c.currentTime) * 1000) + 150;
  setTimeout(() => {
    if (playing.get(id) === entry) {
      playing.delete(id);
      gain.disconnect();
    }
  }, ms);
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

const board = document.getElementById('board');

function renderBoard() {
  board.innerHTML = '';
  for (const b of BUTTONS) {
    const el = document.createElement('button');
    el.className = 'sound-btn';
    el.style.setProperty('--c', b.color);
    el.style.setProperty('--shade', b.shade);
    el.setAttribute('aria-label', b.label);
    el.innerHTML = `<span class="emoji" aria-hidden="true">${b.emoji}</span>`;

    // pointerdown fires the instant a finger lands, which feels much snappier than click
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (shuffling) return;
      play(b.id);
      countPress();
      if (settings.animate) {
        el.classList.remove('boing');
        void el.offsetWidth; // restart the animation
        el.classList.add('boing');
      }
      el.classList.add('pressed');
    });
    const release = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);

    board.appendChild(el);
  }
}

// ---------------------------------------------------------------------------
// Shuffle: every 10 taps the buttons hop around and land in new places
// ---------------------------------------------------------------------------

const SHUFFLE_EVERY = 10;
const HOPS = 4;
let presses = 0;
let shuffling = false;

function countPress() {
  if (!settings.shuffle) return;
  presses++;
  if (presses < SHUFFLE_EVERY) return;
  presses = 0;
  shuffling = true; // ignore taps from now until the buttons have landed
  setTimeout(shuffleBoard, 600); // let the 10th tap's sound and bounce play first
}

// A random order in which every button ends up somewhere new.
function derange(items) {
  for (;;) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.every((el, i) => el !== items[i])) return out;
  }
}

// Move the buttons into `order`, animating each one from its old spot to its
// new one (measure, reorder, then play the difference back as a transform).
function hopTo(order, { duration, easing, lift }) {
  const before = new Map(order.map((el) => [el, el.getBoundingClientRect()]));
  order.forEach((el) => board.appendChild(el));
  return Promise.all(order.map((el) => {
    const from = before.get(el);
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const tilt = (Math.random() * 2 - 1) * 10;
    el.style.zIndex = String(1 + Math.floor(Math.random() * order.length));
    return el.animate([
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(${lift}) rotate(${tilt}deg)`, offset: 0.5 },
      { transform: 'none' },
    ], { duration, easing }).finished;
  }));
}

async function shuffleBoard() {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hops = reduceMotion ? 1 : HOPS;
  for (const el of board.children) el.classList.remove('pressed', 'boing');
  try {
    for (let i = 0; i < hops; i++) {
      const last = i === hops - 1;
      EFFECTS.whoosh(audio(), master);
      await hopTo(derange([...board.children]), last
        ? { duration: 650, easing: 'cubic-bezier(.3, 1.35, .5, 1)', lift: 1.08 }
        : { duration: 340, easing: 'ease-in-out', lift: 0.85 });
    }
    EFFECTS.land(audio(), master);
  } finally {
    for (const el of board.children) el.style.zIndex = '';
    shuffling = false;
  }
}

// ---------------------------------------------------------------------------
// Modes: which activity is on screen. Only changeable from grown-up settings.
// ---------------------------------------------------------------------------

// Every game registers here with start/stop hooks. Anything in the page marked
// data-mode="<game>" (its screen and its grown-up settings section) is only
// shown while that game is selected. data-mode can list several games, e.g. a
// settings section marked data-mode="numbers circuit" shows for both. The
// circuit shows its games' screens itself.
const GAMES = {
  soundboard: { start() { presses = 0; }, stop() {} },
  colour: ColourGame,
  fox: FoxGame,
  numbers: NumbersGame,
  scratch: ScratchGame,
  bounce: BounceGame,
  blocks: BlocksGame,
  stretch: StretchGame,
  pattern: PatternGame,
  circuit: Circuit,
};

function setMode(mode) {
  if (!GAMES[mode]) mode = DEFAULTS.mode;
  settings.mode = mode;
  saveSettings();
  if (ctx) stopAll();
  for (const [name, game] of Object.entries(GAMES)) if (name !== mode) game.stop();
  document.querySelectorAll('[data-mode]').forEach((el) => {
    el.hidden = !el.dataset.mode.split(' ').includes(mode);
  });
  GAMES[mode].start();
}

// ---------------------------------------------------------------------------
// Grown-up gates: hold ▶ (top right) to pick a game, or ⚙️ (bottom right) for
// the current game's settings. Both need a 2-second hold.
// ---------------------------------------------------------------------------

const dialog = document.getElementById('settings');
const gamesDialog = document.getElementById('games');
const HOLD_MS = 2000;

function holdToOpen(gate, open) {
  let holdTimer = null;
  gate.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gate.classList.add('holding');
    holdTimer = setTimeout(() => {
      gate.classList.remove('holding');
      open();
    }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    gate.addEventListener(ev, () => {
      clearTimeout(holdTimer);
      gate.classList.remove('holding');
    });
  }
}

holdToOpen(document.getElementById('parent-gate'), () => openSettings());
holdToOpen(document.getElementById('games-gate'), () => openGames());

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

const volumeInput = document.getElementById('volume');
const overlapInput = document.getElementById('overlap');
const animateInput = document.getElementById('animate');
const shuffleInput = document.getElementById('shuffle');
const modeInputs = document.querySelectorAll('input[name="mode"]');
const numbersRestartInput = document.getElementById('numbers-restart');
const numbersHintInput = document.getElementById('numbers-hint');
const scratchSpeakInput = document.getElementById('scratch-speak');
const bounceFloatyInput = document.getElementById('bounce-floaty');
const blocksRecolourInput = document.getElementById('blocks-recolour');
const stretchShapeInput = document.getElementById('stretch-shape');
const patternSpeedInput = document.getElementById('pattern-colour-speed');
const stretchSoundInput = document.getElementById('stretch-sound');
const stretchColourInput = document.getElementById('stretch-colour');
const stretchWinInput = document.getElementById('stretch-win');
const bounceHumInput = document.getElementById('bounce-hum');
const scratchBrushInput = document.getElementById('scratch-brush');
const voiceTestButton = document.getElementById('voice-test');
const voiceStatus = document.getElementById('voice-status');
const soundList = document.getElementById('sound-list');
const fileInput = document.getElementById('file-input');
let pickingFor = null;

volumeInput.addEventListener('input', () => {
  settings.volume = Number(volumeInput.value);
  if (master) master.gain.value = settings.volume;
  saveSettings();
});
overlapInput.addEventListener('change', () => {
  settings.overlap = overlapInput.checked;
  saveSettings();
});
animateInput.addEventListener('change', () => {
  settings.animate = animateInput.checked;
  saveSettings();
});
// Picking a game switches to it and closes settings. 'click' also fires when
// the game that's already selected is tapped again, so that closes settings too.
modeInputs.forEach((input) => input.addEventListener('click', () => {
  if (input.value !== settings.mode) setMode(input.value);
  setTimeout(() => gamesDialog.close(), 150); // a moment to see the card light up
}));
numbersRestartInput.addEventListener('change', () => {
  settings.numbersRestart = numbersRestartInput.checked;
  saveSettings();
});
patternSpeedInput.addEventListener('change', () => {
  settings.patternColourSpeed = patternSpeedInput.value;
  saveSettings();
});
document.getElementById('pattern-reset').addEventListener('click', () => {
  dialog.close();
  PatternGame.reset();
});
stretchShapeInput.addEventListener('change', () => {
  settings.stretchShape = stretchShapeInput.value;
  saveSettings();
  StretchGame.reset();
});
stretchWinInput.addEventListener('change', () => {
  settings.stretchWin = stretchWinInput.value;
  saveSettings();
});
stretchColourInput.addEventListener('change', () => {
  settings.stretchColour = stretchColourInput.checked;
  saveSettings();
});
stretchSoundInput.addEventListener('change', () => {
  settings.stretchSound = stretchSoundInput.checked;
  saveSettings();
});
document.getElementById('stretch-reset').addEventListener('click', () => {
  dialog.close();
  StretchGame.reset();
});
blocksRecolourInput.addEventListener('change', () => {
  settings.blocksRecolour = blocksRecolourInput.checked;
  saveSettings();
});
document.getElementById('blocks-reset').addEventListener('click', () => {
  dialog.close();
  BlocksGame.reset();
});
bounceFloatyInput.addEventListener('change', () => {
  settings.bounceFloaty = bounceFloatyInput.checked;
  saveSettings();
});
bounceHumInput.addEventListener('change', () => {
  settings.bounceHum = bounceHumInput.checked;
  saveSettings();
});
scratchSpeakInput.addEventListener('change', () => {
  settings.scratchSpeak = scratchSpeakInput.checked;
  saveSettings();
});
voiceTestButton.addEventListener('click', () => {
  pickVoice(); // voices can finish loading late on Android
  if (!say("Hello! It's a fox!")) {
    voiceStatus.textContent = "This browser can't speak. Open the app in Chrome, and check a text-to-speech voice is installed in Android Settings.";
    return;
  }
  voiceStatus.textContent = voice
    ? `Using the voice "${voice.name}". If you heard nothing, check the tablet's media volume.`
    : "Using the device's default voice. If you heard nothing, check Android Settings > Text-to-speech output has a voice installed.";
});
scratchBrushInput.addEventListener('change', () => {
  settings.scratchBrush = scratchBrushInput.value;
  saveSettings();
});
numbersHintInput.addEventListener('change', () => {
  settings.numbersHint = numbersHintInput.checked;
  saveSettings();
});
shuffleInput.addEventListener('change', () => {
  settings.shuffle = shuffleInput.checked;
  presses = 0;
  saveSettings();
});

function openSettings() {
  volumeInput.value = settings.volume;
  overlapInput.checked = settings.overlap;
  animateInput.checked = settings.animate;
  shuffleInput.checked = settings.shuffle;
  numbersRestartInput.checked = settings.numbersRestart;
  numbersHintInput.checked = settings.numbersHint;
  scratchSpeakInput.checked = settings.scratchSpeak;
  bounceFloatyInput.checked = settings.bounceFloaty;
  blocksRecolourInput.checked = settings.blocksRecolour;
  stretchShapeInput.value = settings.stretchShape;
  patternSpeedInput.value = settings.patternColourSpeed;
  stretchSoundInput.checked = settings.stretchSound;
  stretchColourInput.checked = settings.stretchColour;
  stretchWinInput.value = settings.stretchWin;
  bounceHumInput.checked = settings.bounceHum;
  scratchBrushInput.value = settings.scratchBrush;
  voiceStatus.textContent = '';
  renderSoundList();
  dialog.showModal();
}

function openGames() {
  modeInputs.forEach((input) => { input.checked = input.value === settings.mode; });
  gamesDialog.showModal();
}

function renderSoundList() {
  soundList.innerHTML = '';
  for (const b of BUTTONS) {
    const li = document.createElement('li');
    const custom = fileNames.get(b.id);
    li.innerHTML = `
      <span class="swatch" style="background:${b.color}">${b.emoji}</span>
      <span class="info">
        <b>${b.label}</b>
        <small></small>
      </span>
      <span class="actions">
        <button type="button" data-act="test" aria-label="Play ${b.label}">▶</button>
        <button type="button" data-act="pick">Choose file</button>
        ${custom ? '<button type="button" data-act="reset">Reset</button>' : ''}
      </span>`;
    // file names are user-supplied, so set them as text rather than HTML
    li.querySelector('small').textContent = custom ? custom : 'Built-in sound';
    li.querySelector('[data-act="test"]').onclick = () => play(b.id);
    li.querySelector('[data-act="pick"]').onclick = () => {
      pickingFor = b.id;
      fileInput.value = '';
      fileInput.click();
    };
    const reset = li.querySelector('[data-act="reset"]');
    if (reset) {
      reset.onclick = async () => {
        await db.del(b.id);
        buffers.delete(b.id);
        fileNames.delete(b.id);
        renderSoundList();
      };
    }
    soundList.appendChild(li);
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  const id = pickingFor;
  if (!file || !id) return;
  try {
    const buf = await decode(file);
    await db.put(id, { blob: file, name: file.name });
    buffers.set(id, buf);
    fileNames.set(id, file.name);
    renderSoundList();
    play(id);
  } catch (err) {
    console.error(err);
    alert("Sorry, that file couldn't be played. Try an MP3, M4A, WAV or MP4 file.");
  }
});

// ---------------------------------------------------------------------------
// Speaking words out loud, with the tablet's own text-to-speech voice
// ---------------------------------------------------------------------------

const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let voice = null;

// Prefer the device's default voice if it's English, then any English voice.
function pickVoice() {
  if (!canSpeak) return;
  const voices = speechSynthesis.getVoices();
  const english = voices.filter((v) => /^en\b/i.test(v.lang));
  voice = english.find((v) => v.default) || english.find((v) => v.localService) || english[0] || null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function say(text) {
  if (!canSpeak) return false;
  try {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en';
    u.rate = 0.8;
    u.pitch = 1.15;
    u.volume = settings.volume;
    // Chrome can drop speech queued straight after a cancel, so only cancel
    // when something is actually talking, and give it a moment first.
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      setTimeout(() => speechSynthesis.speak(u), 120);
    } else {
      speechSynthesis.speak(u);
    }
    return true;
  } catch {
    return false; // no voice available; games still show the word on screen
  }
}
say.stop = () => {
  if (canSpeak && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
};

// ---------------------------------------------------------------------------
// Tablet niceties
// ---------------------------------------------------------------------------

// No long-press menus, text selection or pinch zoom.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Keep the screen awake while the board is showing.
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* not supported or denied, no big deal */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
  else stopAll();
});

// Offline support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err));
  });
}

renderBoard();
setMode(settings.mode);
keepAwake();
loadCustomSounds();
