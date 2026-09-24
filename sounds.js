// Button definitions and built-in placeholder sounds.
//
// Each built-in sound is synthesised with the Web Audio API, so the app works
// straight away with no audio files. A grown-up can replace any of them with a
// real recording from the settings screen.

/* exported BUTTONS, SYNTHS, EFFECTS */

const BUTTONS = [
  { id: 'correct',  label: 'Correct!',        emoji: '✅', color: '#58cc02', shade: '#46a302' },
  { id: 'wrong',    label: 'Oops',            emoji: '🙊', color: '#ff4b4b', shade: '#d33131' },
  { id: 'complete', label: 'Lesson complete', emoji: '🎉', color: '#ffc800', shade: '#e0a800' },
  { id: 'streak',   label: 'Streak',          emoji: '🔥', color: '#ff9600', shade: '#d97f00' },
  { id: 'levelup',  label: 'Level up',        emoji: '🏆', color: '#1cb0f6', shade: '#1899d6' },
  { id: 'gem',      label: 'Gems',            emoji: '💎', color: '#ce82ff', shade: '#a568cc' },
  { id: 'heart',    label: 'Heart',           emoji: '❤️', color: '#ff86d0', shade: '#e06bb4' },
  { id: 'owl',      label: 'Hoot',            emoji: '🦉', color: '#2bdcc0', shade: '#1fb89f' },
];

// --- tiny synth toolkit -----------------------------------------------------

function tone(ctx, out, { freq, start = 0, dur = 0.2, type = 'sine', gain = 0.5, slideTo = null }) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  // quick attack, smooth release: no clicks, nothing harsh
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  return t0 + dur;
}

// A bell-ish note: fundamental plus a soft octave overtone.
function bell(ctx, out, freq, start, dur = 0.35, gain = 0.4) {
  tone(ctx, out, { freq, start, dur, type: 'triangle', gain });
  tone(ctx, out, { freq: freq * 2, start, dur: dur * 0.6, type: 'sine', gain: gain * 0.35 });
  return ctx.currentTime + start + dur;
}

function noiseSweep(ctx, out, { start = 0, dur = 0.4, from = 400, to = 4000, gain = 0.25 }) {
  const t0 = ctx.currentTime + start;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 3;
  filt.frequency.setValueAtTime(from, t0);
  filt.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  return t0 + dur;
}

// Note frequencies
const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77,
            C6: 1046.5, D6: 1174.66, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093 };

// Each synth plays into `out` and returns the time (ctx clock) it finishes.
const SYNTHS = {
  // bright two-note "ding-ding"
  correct: (ctx, out) => {
    bell(ctx, out, N.E6, 0, 0.18, 0.4);
    return bell(ctx, out, N.A6, 0.09, 0.45, 0.4);
  },
  // soft, low "bwoop" (deliberately gentle, not a scary buzzer)
  wrong: (ctx, out) => {
    tone(ctx, out, { freq: 330, start: 0, dur: 0.18, type: 'triangle', gain: 0.35 });
    return tone(ctx, out, { freq: 247, start: 0.16, dur: 0.35, type: 'triangle', gain: 0.35, slideTo: 200 });
  },
  // ta-da fanfare
  complete: (ctx, out) => {
    [N.C5, N.E5, N.G5].forEach((f, i) => bell(ctx, out, f, i * 0.1, 0.2, 0.32));
    bell(ctx, out, N.C6, 0.3, 0.7, 0.35);
    bell(ctx, out, N.E6, 0.3, 0.7, 0.2);
    return bell(ctx, out, N.G6, 0.3, 0.7, 0.15);
  },
  // whoosh + sparkle
  streak: (ctx, out) => {
    noiseSweep(ctx, out, { dur: 0.45, from: 300, to: 3500, gain: 0.3 });
    bell(ctx, out, N.G6, 0.35, 0.3, 0.3);
    return bell(ctx, out, N.C7, 0.45, 0.45, 0.25);
  },
  // rising run then a big chord
  levelup: (ctx, out) => {
    [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6].forEach((f, i) =>
      tone(ctx, out, { freq: f, start: i * 0.06, dur: 0.12, type: 'square', gain: 0.12 }));
    bell(ctx, out, N.C6, 0.4, 0.8, 0.3);
    bell(ctx, out, N.E6, 0.4, 0.8, 0.2);
    return bell(ctx, out, N.G6, 0.4, 0.8, 0.18);
  },
  // glittery high twinkle
  gem: (ctx, out) => {
    let end = 0;
    [N.C7, N.G6, N.E6, N.G6, N.C7, N.E6 * 2].forEach((f, i) => {
      end = tone(ctx, out, { freq: f, start: i * 0.055, dur: 0.25, type: 'sine', gain: 0.25 });
    });
    return end;
  },
  // bubbly "pop-pop"
  heart: (ctx, out) => {
    tone(ctx, out, { freq: 400, start: 0, dur: 0.12, type: 'sine', gain: 0.5, slideTo: 900 });
    return tone(ctx, out, { freq: 500, start: 0.14, dur: 0.16, type: 'sine', gain: 0.5, slideTo: 1200 });
  },
  // "hoo-hoo" owl call
  owl: (ctx, out) => {
    tone(ctx, out, { freq: 420, start: 0, dur: 0.28, type: 'sine', gain: 0.5, slideTo: 360 });
    return tone(ctx, out, { freq: 420, start: 0.34, dur: 0.4, type: 'sine', gain: 0.5, slideTo: 340 });
  },
};

// Sounds for the shuffle animation, not tied to a button.
const EFFECTS = {
  // soft swish for each hop
  whoosh: (ctx, out) => noiseSweep(ctx, out, { dur: 0.3, from: 600, to: 2400, gain: 0.12 }),
  // little "plip" when the buttons land
  land: (ctx, out) => tone(ctx, out, { freq: 600, dur: 0.18, type: 'sine', gain: 0.3, slideTo: 1100 }),
};
