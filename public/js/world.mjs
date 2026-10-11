/* The After-Hours Shooting Gallery: shared world data.
   Five enamel inks, the automaton figures, carnival names, and small
   colour helpers shared by the booths and the paint shop. */

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

/* ---------------- figures ----------------
   The four automaton builds. Their shapes live in automaton.mjs (3D) and
   automaton2d.mjs (the Lite booth). */
export const FIGURES = [
  { id: "strongman", name: "Strongman" },
  { id: "duchess", name: "Duchess" },
  { id: "ringmaster", name: "Ringmaster" },
  { id: "sailor", name: "Sailor" }
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

/* ---------------- shared helpers ---------------- */
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
