/* global makeScratchGame */
/* exported DinoGame */
'use strict';

// Dino scratch: Scratch & reveal, but a friendly cartoon dinosaur hides under
// the pattern. There are only a couple of dinosaur emoji, so these are drawn
// here as little SVG pictures, all facing right, in the same chunky style.

const DinoGame = (() => {
  const LINE = '#3c3c3c';

  // A big friendly eye with a shine, and a smile, used by every dinosaur.
  const eye = (x, y, r = 9) => `
    <circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${LINE}" stroke-width="2.5"/>
    <circle cx="${x + r * 0.2}" cy="${y + r * 0.1}" r="${r * 0.58}" fill="${LINE}"/>
    <circle cx="${x + r * 0.42}" cy="${y - r * 0.2}" r="${r * 0.22}" fill="#fff"/>`;
  const smile = (d) => `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="3.5" stroke-linecap="round"/>`;
  const cheek = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="4.5" fill="#ff86d0" opacity="0.55"/>`;

  // Shapes in a <g class="body"> get the dinosaur's colour and a soft outline.
  const svg = (body, colour, extra = '') => `<svg viewBox="0 0 200 200" overflow="visible" xmlns="http://www.w3.org/2000/svg">
    <g fill="${colour}" stroke="rgba(0,0,0,0.28)" stroke-width="3" stroke-linejoin="round">${body}</g>${extra}</svg>`;

  const DINOS = [
    // T-Rex: big head, tiny arms, strong legs
    ['T-Rex', svg(`
      <path d="M62 112 Q30 122 8 156 Q44 146 74 136 Z"/>
      <rect x="78" y="134" width="24" height="40" rx="10"/>
      <rect x="66" y="166" width="38" height="12" rx="6"/>
      <ellipse cx="96" cy="112" rx="46" ry="34" transform="rotate(-22 96 112)"/>
      <rect x="108" y="132" width="24" height="40" rx="10"/>
      <rect x="104" y="164" width="38" height="12" rx="6"/>
      <ellipse cx="124" cy="80" rx="22" ry="26"/>
      <rect x="116" y="34" width="72" height="48" rx="22"/>
      <path d="M134 104 q14 2 16 12" fill="none" stroke-width="8" stroke-linecap="round" stroke="#4aa802"/>
      <path d="M96 128 Q112 140 128 126" fill="#c8f08f" stroke="none"/>`, '#58cc02',
    `${eye(150, 52)}${cheek(156, 70)}${smile('M160 70 Q172 78 184 68')}
      <circle cx="180" cy="44" r="2.6" fill="${LINE}"/>`)],

    // Brachiosaurus: very long neck, small head up high
    ['Brachiosaurus', svg(`
      <path d="M40 124 Q14 136 6 162 Q26 152 50 144 Z"/>
      <rect x="48" y="138" width="20" height="40" rx="8"/>
      <rect x="104" y="138" width="20" height="40" rx="8"/>
      <path d="M98 112 Q122 64 140 22 Q154 14 166 26 Q148 70 134 122 Z"/>
      <ellipse cx="86" cy="126" rx="56" ry="32"/>
      <rect x="62" y="140" width="20" height="38" rx="8"/>
      <rect x="118" y="140" width="20" height="38" rx="8"/>
      <ellipse cx="160" cy="30" rx="26" ry="16"/>
      <circle cx="78" cy="118" r="7" fill="#7fd3fa" stroke="none"/>
      <circle cx="98" cy="108" r="5" fill="#7fd3fa" stroke="none"/>
      <circle cx="64" cy="104" r="5" fill="#7fd3fa" stroke="none"/>`, '#1cb0f6',
    `${eye(160, 24, 7.5)}${smile('M170 36 Q178 40 184 34')}`)],

    // Triceratops: frill and three horns
    ['Triceratops', svg(`
      <path d="M44 116 Q18 120 8 138 Q30 136 50 132 Z"/>
      <rect x="52" y="136" width="22" height="38" rx="9"/>
      <rect x="104" y="136" width="22" height="38" rx="9"/>
      <ellipse cx="88" cy="118" rx="54" ry="34"/>
      <rect x="66" y="138" width="22" height="38" rx="9"/>
      <rect x="118" y="138" width="22" height="38" rx="9"/>
      <circle cx="138" cy="92" r="36" fill="#e07f00"/>
      <circle cx="120" cy="66" r="6" fill="#ffc800"/><circle cx="138" cy="58" r="6" fill="#ffc800"/>
      <circle cx="156" cy="62" r="6" fill="#ffc800"/><circle cx="106" cy="82" r="6" fill="#ffc800"/>
      <path d="M140 86 Q170 82 190 104 Q190 124 168 130 Q144 132 134 112 Z"/>
      <path d="M150 88 L178 52 L162 92 Z" fill="#fff4d6"/>
      <path d="M164 92 L196 62 L176 98 Z" fill="#fff4d6"/>
      <path d="M184 102 L198 90 L192 110 Z" fill="#fff4d6"/>`, '#ff9600',
    `${eye(160, 102, 8)}${cheek(166, 118)}${smile('M172 120 Q180 124 188 116')}`)],

    // Stegosaurus: plates along the back and a spiky tail
    ['Stegosaurus', svg(`
      <path d="M50 60 L64 30 L80 56 Z M78 50 L96 16 L112 48 Z M110 50 L128 20 L142 56 Z M138 62 L156 40 L164 72 Z M30 80 L36 52 L54 70 Z" fill="#ff86d0"/>
      <path d="M40 120 Q16 120 4 104 Q26 140 50 140 Z"/>
      <path d="M6 104 L-2 84 L14 102 Z M18 114 L12 92 L26 112 Z" fill="#fff4d6"/>
      <rect x="54" y="134" width="20" height="40" rx="8"/>
      <rect x="118" y="134" width="20" height="40" rx="8"/>
      <path d="M30 120 Q40 50 104 50 Q164 50 170 120 Q170 140 150 142 L50 142 Q30 140 30 120 Z"/>
      <rect x="68" y="136" width="20" height="40" rx="8"/>
      <rect x="132" y="136" width="20" height="40" rx="8"/>
      <path d="M160 108 Q180 104 194 118 Q194 136 176 138 Q160 138 154 126 Z"/>`, '#9b59f5',
    `${eye(178, 116, 7)}${smile('M182 130 Q188 132 192 128')}`)],

    // Pterodactyl: wings out, crest and long beak
    ['Pterodactyl', svg(`
      <path d="M92 92 L6 56 Q26 96 30 126 Q60 106 92 118 Z"/>
      <path d="M108 92 L194 56 Q174 96 170 126 Q140 106 108 118 Z"/>
      <path d="M30 126 L40 112 M50 116 L56 104" fill="none" stroke="#e03a3a" stroke-width="3"/>
      <ellipse cx="100" cy="112" rx="20" ry="32"/>
      <path d="M90 142 l-6 14 M110 142 l6 14" fill="none" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/>
      <path d="M96 66 L58 48 L92 80 Z"/>
      <circle cx="102" cy="74" r="18"/>
      <path d="M114 70 L160 82 L114 86 Z" fill="#ffc800"/>`, '#ff4b4b',
    `${eye(104, 70, 7.5)}`)],

    // Ankylosaurus: knobbly armour and a club tail
    ['Ankylosaurus', svg(`
      <path d="M40 132 Q20 132 14 126" fill="none" stroke-width="12" stroke-linecap="round" stroke="#c9a227"/>
      <circle cx="14" cy="124" r="15" fill="#a9871a"/>
      <rect x="52" y="140" width="20" height="32" rx="8"/>
      <rect x="120" y="140" width="20" height="32" rx="8"/>
      <path d="M30 140 Q32 80 96 78 Q160 80 164 140 Z"/>
      <rect x="66" y="142" width="20" height="32" rx="8"/>
      <rect x="134" y="142" width="20" height="32" rx="8"/>
      <g fill="#a9871a" stroke="none">
        <circle cx="62" cy="104" r="8"/><circle cx="86" cy="94" r="8"/><circle cx="110" cy="94" r="8"/>
        <circle cx="134" cy="104" r="8"/><circle cx="74" cy="122" r="7"/><circle cx="98" cy="114" r="7"/>
        <circle cx="122" cy="122" r="7"/><circle cx="48" cy="124" r="6"/><circle cx="146" cy="124" r="6"/>
      </g>
      <path d="M36 138 L24 146 L40 146 Z M156 138 L168 148 L152 148 Z" fill="#fff4d6"/>
      <path d="M156 118 Q182 112 194 130 Q194 148 174 150 Q158 150 152 138 Z"/>`, '#ffc800',
    `${eye(176, 128, 7)}${smile('M180 142 Q186 145 191 140')}`)],

    // Spinosaurus: a big sail on its back and a long snout
    ['Spinosaurus', svg(`
      <path d="M52 92 Q66 14 100 14 Q134 14 146 86 Z" fill="#ff9600"/>
      <path d="M72 88 L80 32 M98 86 L100 18 M122 86 L120 30" fill="none" stroke="#e07f00" stroke-width="4"/>
      <path d="M50 116 Q22 124 4 156 Q38 146 64 136 Z"/>
      <rect x="70" y="134" width="22" height="40" rx="9"/>
      <rect x="60" y="166" width="34" height="11" rx="5"/>
      <ellipse cx="98" cy="110" rx="52" ry="30" transform="rotate(-10 98 110)"/>
      <rect x="110" y="132" width="22" height="40" rx="9"/>
      <rect x="106" y="164" width="34" height="11" rx="5"/>
      <path d="M140 76 Q160 64 198 76 Q198 92 170 94 Q146 96 136 100 Z"/>
      <ellipse cx="140" cy="92" rx="18" ry="20"/>
      <path d="M142 116 q12 2 14 10" fill="none" stroke-width="7" stroke-linecap="round" stroke="#1a9a8c"/>`, '#2bc4b4',
    `${eye(148, 78, 8)}${smile('M164 90 Q178 94 192 86')}
      <circle cx="193" cy="78" r="2.4" fill="${LINE}"/>`)],

    // Parasaurolophus: a long tube crest sweeping back from its head
    ['Parasaurolophus', svg(`
      <path d="M146 42 Q110 22 82 26" fill="none" stroke-width="14" stroke-linecap="round" stroke="#e05aa8"/>
      <path d="M52 118 Q26 126 8 152 Q40 144 66 136 Z"/>
      <rect x="72" y="134" width="22" height="40" rx="9"/>
      <rect x="62" y="166" width="34" height="11" rx="5"/>
      <ellipse cx="100" cy="112" rx="48" ry="32" transform="rotate(-15 100 112)"/>
      <rect x="110" y="132" width="22" height="40" rx="9"/>
      <rect x="106" y="164" width="34" height="11" rx="5"/>
      <ellipse cx="134" cy="84" rx="20" ry="26"/>
      <path d="M132 50 Q160 38 186 60 Q194 72 184 78 Q160 82 136 76 Z"/>
      <path d="M136 112 q14 0 18 12" fill="none" stroke-width="8" stroke-linecap="round" stroke="#e05aa8"/>`, '#ff86d0',
    `${eye(154, 56, 8)}${cheek(160, 72)}${smile('M168 72 Q178 76 186 70')}`)],
  ];

  return makeScratchGame(document.getElementById('dino-game'), DINOS.map(([name, art]) => [art, name]));
})();
