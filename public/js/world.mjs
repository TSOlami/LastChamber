/* The After-Hours Shooting Gallery: shared world data.
   Five enamel inks, the tin target figures, carnival names, and the
   target painter used by both the 3D booth and the 2.5D fallback. */

/* ---------------- inks ----------------
   Every surface, paint-shop colour and UI state prints from these five.
   A paint-shop colour is ink * 3 + tint (0 deep, 1 base, 2 light). */
export const INKS = [
  { id: "soot",    name: "Soot",    base: "#14100d", deep: "#0a0806", light: "#3a312a" },
  { id: "teal",    name: "Teal",    base: "#0f5a52", deep: "#093a35", light: "#2f8a7e" },
  { id: "oxide",   name: "Oxide",   base: "#b8321f", deep: "#7c1f12", light: "#d8634c" },
  { id: "mustard", name: "Mustard", base: "#e3a723", deep: "#a8760f", light: "#f0c862" },
  { id: "cream",   name: "Cream",   base: "#f2dfb4", deep: "#c9b384", light: "#fbf1d8" }
];
const TINT_KEYS = ["deep", "base", "light"];
export const TINT_NAMES = ["Deep", "Base", "Light"];
export const PAINT_COUNT = INKS.length * 3;
export const paint = i => {
  const k = Math.max(0, Math.min(PAINT_COUNT - 1, i | 0));
  return INKS[Math.floor(k / 3)][TINT_KEYS[k % 3]];
};
export const paintName = i => {
  const k = Math.max(0, Math.min(PAINT_COUNT - 1, i | 0));
  return `${TINT_NAMES[k % 3]} ${INKS[Math.floor(k / 3)].name.toLowerCase()}`;
};
const TIN = "#8f8a7c";

/* ---------------- figures ----------------
   Outlines in a 200 x 300 box, y down, hinge tab at the bottom edge.
   The same path cuts the tin in 3D and paints it on canvas. */
export const FIGURES = [
  { id: "strongman", name: "Strongman",
    d: "M60 300 L66 274 C40 270 26 254 24 230 L22 168 C22 138 40 120 70 114 L86 108 C70 100 62 86 62 68 C62 44 80 30 100 30 C120 30 138 44 138 68 C138 86 130 100 114 108 L130 114 C160 120 178 138 178 168 L176 230 C174 254 160 270 134 274 L140 300 Z",
    head: [100, 70, 33] },
  { id: "duchess", name: "Duchess",
    d: "M50 300 L58 280 C30 276 16 262 18 244 C24 206 40 176 62 160 L70 132 C74 122 82 116 88 114 C76 106 70 96 70 84 C70 74 74 66 80 62 L52 62 C48 62 46 56 52 54 L74 50 L76 30 C76 22 84 18 100 18 C110 18 118 20 122 24 C130 10 146 2 158 8 C150 12 140 20 134 34 L126 50 L148 54 C154 56 152 62 148 62 L120 62 C126 66 130 74 130 84 C130 96 124 106 112 114 C118 116 126 122 130 132 L138 160 C160 176 176 206 182 244 C184 262 170 276 142 280 L150 300 Z",
    head: [100, 86, 28] },
  { id: "ringmaster", name: "Ringmaster",
    d: "M56 300 L62 278 C46 276 36 262 30 240 L26 170 C26 144 44 128 72 122 L88 118 C76 110 70 100 70 88 C70 78 74 70 80 64 L58 64 C52 64 52 56 58 56 L70 56 L72 14 C72 10 76 8 80 8 L120 8 C124 8 128 10 128 14 L130 56 L142 56 C148 56 148 64 142 64 L120 64 C126 70 130 78 130 88 C130 100 124 110 112 118 L128 122 C156 128 174 144 174 170 L170 240 C164 262 154 276 138 278 L144 300 Z",
    head: [100, 89, 29] },
  { id: "sailor", name: "Sailor",
    d: "M54 300 L60 276 C44 272 34 258 32 238 L30 172 C30 144 46 128 72 122 L88 116 C76 108 68 98 68 84 C68 72 74 64 80 60 C70 58 64 54 66 48 C70 40 84 34 100 34 C116 34 130 40 134 48 C136 54 130 58 120 60 C126 64 132 72 132 84 C132 98 124 108 112 116 L128 122 C154 128 170 144 170 172 L168 238 C166 258 156 272 140 276 L146 300 Z",
    head: [100, 85, 31] }
];

export const GUNS = ["Pocket", "Service", "Marshal"];
export const FINISHES = ["Blued steel", "Brass", "Nickel"];
export const AWNINGS = [
  { id: "teal", name: "Teal stripe", ink: 1, need: 0 },
  { id: "oxide", name: "Oxide stripe", ink: 2, need: 3 },
  { id: "soot", name: "Soot stripe", ink: 0, need: 8 }
];

/* Wire format for appearance. The server clamps every key to these ranges. */
export const LOOK_RANGES = { fig: FIGURES.length, body: PAINT_COUNT, trim: PAINT_COUNT,
                             plate: PAINT_COUNT, gun: GUNS.length, finish: FINISHES.length };
export const DEFAULT_LOOK = { fig: 0, body: 4, trim: 13, plate: 10, gun: 1, finish: 0 };

export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
/* House players keep the same paint job every night. */
export function seededLook(name) {
  const h = hashStr(name);
  const body = [1, 4, 7, 10, 2, 5][h % 6];
  const trim = [13, 10, 7, 4, 12][(h >>> 3) % 5];
  return { fig: (h >>> 6) % FIGURES.length, body, trim: trim === body ? 13 : trim,
           plate: [10, 1, 13, 7][(h >>> 9) % 4], gun: (h >>> 11) % 3, finish: (h >>> 13) % 3 };
}
export function cleanLook(raw) {
  const out = { ...DEFAULT_LOOK };
  if (!raw || typeof raw !== "object") return out;
  for (const [k, n] of Object.entries(LOOK_RANGES)) {
    const v = raw[k] | 0;
    if (k in raw && v >= 0 && v < n) out[k] = v;
  }
  return out;
}

/* ---------------- carnival names ----------------
   Nobody sits down as "Guest". */
const NAME_A = ["Lucky", "Brass", "Velvet", "Two-Bit", "Midnight", "Cracker", "Penny", "Ticket",
                "Tin", "Copper", "Dusty", "Sawdust", "Neon", "Calliope", "Spitfire", "Silver",
                "Dime", "Hot", "Rusty", "Gilded", "Sugar", "Thunder", "Quiet", "Crooked"];
const NAME_B = ["Duck", "Barker", "Jack", "Annie", "Rabbit", "Kid", "Pickle", "Magpie",
                "Lou", "Ace", "Biscuit", "Comet", "Maverick", "Sparrow", "Weasel", "Dutch",
                "Rosie", "Hound", "Marlowe", "Popcorn", "Gus", "Juniper", "Moxie", "Fitz"];
export function carnivalName(taken = []) {
  const used = new Set(taken.map(s => String(s).toLowerCase()));
  for (let i = 0; i < 40; i++) {
    const n = NAME_A[Math.floor(Math.random() * NAME_A.length)] + " " +
              NAME_B[Math.floor(Math.random() * NAME_B.length)];
    if (n.length <= 16 && !used.has(n.toLowerCase())) return n;
  }
  return "Ticket " + (100 + Math.floor(Math.random() * 900));
}

/* ---------------- the target painter ----------------
   Paints one lithographed tin target onto a 2D canvas: enamel inks,
   a painted nameplate with life stars, chips where the paint has worn,
   and dents where live rounds landed. Returns the canvas. */
const W = 512, H = 768, S = W / 200;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function fontsReady() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('48px "Rye"'),
      document.fonts.load('600 32px "Barlow Semi Condensed"'),
      document.fonts.load('700 32px "Barlow Semi Condensed"')
    ]);
  } catch {}
}

export function paintTarget(p, opts = {}) {
  const look = p.look ? cleanLook(p.look) : seededLook(p.name);
  const fig = FIGURES[look.fig];
  const cv = opts.canvas || document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.clearRect(0, 0, W, H);
  c.save();
  c.scale(S, S);
  const outline = new Path2D(fig.d);
  const body = paint(look.body), trim = paint(look.trim), plateInk = paint(look.plate);
  const soot = INKS[0].base, cream = INKS[4].base, oxide = INKS[2].base;
  const r = rng(hashStr(p.name || "x"));

  /* body enamel with a litho halftone grain */
  c.fillStyle = body;
  c.fill(outline);
  c.save();
  c.clip(outline);
  c.globalAlpha = .08;
  c.fillStyle = soot;
  for (let y = 2; y < 300; y += 4)
    for (let x = (y / 4) % 2 ? 2 : 0; x < 200; x += 4) {
      c.beginPath(); c.arc(x, y, .55 + (y / 300) * .5, 0, 6.3); c.fill();
    }
  c.globalAlpha = 1;
  drawFigure(c, fig.id, fig.head, { body, trim, soot, cream, oxide });
  /* nameplate */
  const py = 226, ph = 44;
  roundRect(c, 36, py, 128, ph, 5);
  c.fillStyle = plateInk; c.fill();
  c.lineWidth = 2; c.strokeStyle = soot; c.stroke();
  /* ink chosen against the plate, never cream on cream */
  const plateText = contrast(soot, plateInk) >= contrast(INKS[4].light, plateInk) ? soot : INKS[4].light;
  c.fillStyle = plateText;
  c.textAlign = "center"; c.textBaseline = "middle";
  let size = 20;
  const label = (p.name || "").toUpperCase();
  const pf = s => `700 ${s}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
  c.font = pf(size);
  while (c.measureText(label).width > 112 && size > 10) { size -= .5; c.font = pf(size); }
  c.fillText(label, 100, py + 15);
  /* life stars: painted when held, punched through when lost */
  const cap = opts.cap ?? 3, lives = opts.lives ?? cap;
  const gap = 15, x0 = 100 - (cap - 1) * gap / 2;
  for (let i = 0; i < cap; i++) {
    const x = x0 + i * gap, y = py + 34;
    if (i < lives) { star(c, x, y, 5.6, 2.5); c.fillStyle = INKS[3].light; c.fill(); c.lineWidth = 1; c.strokeStyle = soot; c.stroke(); }
    else { c.beginPath(); c.arc(x, y, 3.4, 0, 6.3); c.fillStyle = "#050403"; c.fill();
           c.lineWidth = 1.2; c.strokeStyle = TIN; c.stroke(); }
  }
  /* worn chips along the edges show the tin underneath */
  c.fillStyle = TIN;
  /* chips gather where hands and pellets hit: the edges */
  c.lineWidth = 9;
  for (let i = 0, n = 0; i < 900 && n < 34; i++) {
    const x = r() * 200, y = 10 + r() * 285;
    if (!c.isPointInPath(outline, x * S, y * S) || !c.isPointInStroke(outline, x * S, y * S)) continue;
    blob(c, x, y, 1.2 + r() * 3, r); n++;
  }
  /* dents from live rounds that didn't put this target down */
  for (const d of opts.dents || []) {
    const x = 50 + d[0] * 100, y = 120 + d[1] * 100;
    const g = c.createRadialGradient(x - 1, y - 1, .5, x, y, 8);
    g.addColorStop(0, "#050403"); g.addColorStop(.35, "#2a2420"); g.addColorStop(.6, TIN); g.addColorStop(1, "rgba(143,138,124,0)");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 8, 0, 6.3); c.fill();
  }
  c.restore();
  /* rolled tin edge */
  c.lineWidth = 3.2; c.strokeStyle = shadeHex(body, .55); c.stroke(outline);
  c.lineWidth = 1; c.strokeStyle = "rgba(251,241,216,.25)"; c.stroke(outline);
  c.restore();
  return cv;
}

function drawFigure(c, id, [hx, hy, hr], k) {
  const { body, trim, soot, cream, oxide } = k;
  const dk = shadeHex(body, .62);
  c.lineJoin = "round"; c.lineCap = "round";
  /* torso details first, then the face on top */
  if (id === "strongman") {
    /* striped singlet and flexed arms */
    c.save(); c.beginPath(); c.rect(56, 116, 88, 116); c.clip();
    for (let y = 116; y < 232; y += 14) { c.fillStyle = (y / 14) % 2 ? trim : cream; c.fillRect(56, y, 88, 7); }
    c.restore();
    c.lineWidth = 2.4; c.strokeStyle = soot; c.strokeRect(56, 116, 88, 116);
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.ellipse(100 + sx * 66, 150, 15, 24, sx * .25, 0, 6.3);
      c.fillStyle = shadeHex(cream, .88); c.fill(); c.lineWidth = 2; c.strokeStyle = soot; c.stroke();
      c.beginPath(); c.ellipse(100 + sx * 66, 124, 10, 9, 0, 0, 6.3); c.fill(); c.stroke();
    }
    star(c, 100, 178, 11, 4.6);
    c.fillStyle = oxide; c.fill(); c.lineWidth = 1.6; c.strokeStyle = soot; c.stroke();
  } else if (id === "duchess") {
    c.beginPath(); c.moveTo(62, 160); c.quadraticCurveTo(100, 176, 138, 160);
    c.lineTo(156, 214); c.quadraticCurveTo(100, 230, 44, 214); c.closePath();
    c.fillStyle = trim; c.fill(); c.lineWidth = 2; c.strokeStyle = soot; c.stroke();
    c.fillStyle = cream;
    for (let x = 56; x <= 144; x += 11) { c.beginPath(); c.arc(x, 214 + Math.sin(x) * 2, 3, 0, 6.3); c.fill(); }
    /* bodice laces and hat band */
    c.strokeStyle = cream; c.lineWidth = 1.6;
    for (let y = 126; y < 156; y += 7) { c.beginPath(); c.moveTo(92, y); c.lineTo(108, y + 4); c.moveTo(108, y); c.lineTo(92, y + 4); c.stroke(); }
    c.fillStyle = trim; c.fillRect(76, 42, 50, 9);
    c.fillStyle = oxide; c.beginPath(); c.arc(124, 46, 5, 0, 6.3); c.fill();
  } else if (id === "ringmaster") {
    /* lapels, waistcoat, buttons, hat band */
    c.fillStyle = cream;
    c.beginPath(); c.moveTo(88, 120); c.lineTo(100, 150); c.lineTo(112, 120); c.closePath(); c.fill();
    c.fillStyle = trim;
    c.beginPath(); c.moveTo(80, 124); c.lineTo(100, 200); c.lineTo(120, 124); c.lineTo(128, 132); c.lineTo(104, 214); c.lineTo(96, 214); c.lineTo(72, 132); c.closePath(); c.fill();
    c.lineWidth = 2; c.strokeStyle = soot; c.stroke();
    c.fillStyle = INKS[3].base;
    for (const y of [160, 178, 196]) { c.beginPath(); c.arc(100, y, 3.2, 0, 6.3); c.fill(); c.stroke(); }
    c.fillStyle = soot; c.beginPath(); c.moveTo(93, 124); c.lineTo(100, 130); c.lineTo(107, 124); c.lineTo(107, 134); c.lineTo(100, 130); c.lineTo(93, 134); c.closePath(); c.fill();
    c.fillStyle = trim; c.fillRect(71, 44, 58, 10);
  } else if (id === "sailor") {
    /* square collar, stripes, neckerchief */
    c.fillStyle = trim;
    c.beginPath(); c.moveTo(66, 124); c.lineTo(134, 124); c.lineTo(128, 160); c.lineTo(100, 176); c.lineTo(72, 160); c.closePath(); c.fill();
    c.strokeStyle = cream; c.lineWidth = 2;
    c.beginPath(); c.moveTo(72, 130); c.lineTo(128, 130); c.stroke();
    c.fillStyle = oxide; c.beginPath(); c.moveTo(92, 150); c.lineTo(108, 150); c.lineTo(100, 178); c.closePath(); c.fill();
    c.strokeStyle = soot; c.lineWidth = 2; c.stroke();
    c.save(); c.beginPath(); c.rect(40, 186, 120, 44); c.clip();
    for (let y = 186; y < 230; y += 10) { c.fillStyle = (y / 10) % 2 ? cream : trim; c.fillRect(40, y, 120, 5); }
    c.restore();
    c.fillStyle = cream; c.beginPath(); c.ellipse(100, 48, 34, 12, 0, Math.PI, 0); c.fill();
    c.fillStyle = trim; c.fillRect(70, 54, 60, 5);
  }
  /* face */
  c.beginPath(); c.arc(hx, hy, hr, 0, 6.3);
  c.fillStyle = cream; c.fill(); c.lineWidth = 2.4; c.strokeStyle = soot; c.stroke();
  c.fillStyle = "rgba(184,50,31,.55)";
  c.beginPath(); c.arc(hx - hr * .55, hy + hr * .22, hr * .2, 0, 6.3); c.fill();
  c.beginPath(); c.arc(hx + hr * .55, hy + hr * .22, hr * .2, 0, 6.3); c.fill();
  c.fillStyle = soot;
  c.beginPath(); c.ellipse(hx - hr * .34, hy - hr * .12, 2.6, 3.6, 0, 0, 6.3); c.fill();
  c.beginPath(); c.ellipse(hx + hr * .34, hy - hr * .12, 2.6, 3.6, 0, 0, 6.3); c.fill();
  c.lineWidth = 2; c.strokeStyle = soot;
  c.beginPath(); c.moveTo(hx - hr * .5, hy - hr * .42); c.quadraticCurveTo(hx - hr * .34, hy - hr * .55, hx - hr * .18, hy - hr * .42); c.stroke();
  c.beginPath(); c.moveTo(hx + hr * .18, hy - hr * .42); c.quadraticCurveTo(hx + hr * .34, hy - hr * .55, hx + hr * .5, hy - hr * .42); c.stroke();
  if (id === "strongman") {
    /* curled handlebar moustache */
    c.lineWidth = 4; c.beginPath();
    c.moveTo(hx, hy + hr * .3);
    c.bezierCurveTo(hx - 10, hy + hr * .2, hx - 20, hy + hr * .5, hx - 24, hy + hr * .18);
    c.moveTo(hx, hy + hr * .3);
    c.bezierCurveTo(hx + 10, hy + hr * .2, hx + 20, hy + hr * .5, hx + 24, hy + hr * .18);
    c.stroke();
  } else {
    c.beginPath(); c.arc(hx, hy + hr * .32, hr * .3, .15 * Math.PI, .85 * Math.PI);
    c.lineWidth = 2.2; c.stroke();
  }
  if (id === "duchess") {
    c.fillStyle = dk; c.beginPath(); c.arc(hx, hy - hr * .95, hr * .5, Math.PI, 0); c.fill();
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function star(c, x, y, ro, ri) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}
function blob(c, x, y, s, r) {
  c.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, rr = s * (.6 + r() * .7);
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
}
export function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const cl = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return "#" + [cl(n >> 16), cl((n >> 8) & 255), cl(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  return .2126 * ch(n >> 16) + .7152 * ch((n >> 8) & 255) + .0722 * ch(n & 255);
}
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const L = .2126 * (n >> 16) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255);
  return L > 140;
}
