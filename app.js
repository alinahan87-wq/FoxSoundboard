/* global BUTTONS, SYNTHS */
'use strict';

// ---------------------------------------------------------------------------
// Settings (small per-device preferences)
// ---------------------------------------------------------------------------

const DEFAULTS = { volume: 0.8, overlap: false, animate: true };

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
      play(b.id);
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
// Grown-up gate: hold the gear for 2 seconds
// ---------------------------------------------------------------------------

const gate = document.getElementById('parent-gate');
const dialog = document.getElementById('settings');
const HOLD_MS = 2000;
let holdTimer = null;

gate.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  gate.classList.add('holding');
  holdTimer = setTimeout(() => {
    gate.classList.remove('holding');
    openSettings();
  }, HOLD_MS);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  gate.addEventListener(ev, () => {
    clearTimeout(holdTimer);
    gate.classList.remove('holding');
  });
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

const volumeInput = document.getElementById('volume');
const overlapInput = document.getElementById('overlap');
const animateInput = document.getElementById('animate');
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

function openSettings() {
  volumeInput.value = settings.volume;
  overlapInput.checked = settings.overlap;
  animateInput.checked = settings.animate;
  renderSoundList();
  dialog.showModal();
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
keepAwake();
loadCustomSounds();
