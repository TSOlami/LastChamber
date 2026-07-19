/* Last Chamber client.
   Three drivers share one renderer and event animator:
   solo and hot seat run the engine locally, online plays against the server. */

import * as E from "/shared/engine.mjs";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const delay = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);

const ICON = { peek: "i-peek", eject: "i-eject", spin: "i-spin", shield: "i-shield",
               flask: "i-flask", double: "i-double", cuffs: "i-cuffs" };

/* ---------------- appearance system ----------------
   Original suit cast. look keys keep their wire names for compatibility:
   skin = visor tint, outfit = suit trim, color = suit color, hat = helmet kit. */
const SKINS = ["#8fd4e8", "#ffd58f", "#a9e8b4", "#e8a9c8", "#c9c4f2"];
const COLORS = ["#8a3a30", "#31597d", "#9c7a2e", "#3d7d5a", "#6e4a8c", "#b5ad97"];
const OUTFITS = ["Standard", "Plated", "Scout", "Heavy"];
const HATS = ["Bare", "Antenna", "Fin", "Bolts", "Crown", "Lamp"];
const GUNS = ["Pocket", "Service", "Marshal"];
const FINISHES = ["Steel", "Brass", "Nickel"];
const FINISH_GRAD = ["g-steel", "g-brass", "g-nickel"];
const DEFAULT_LOOK = { skin: 0, outfit: 0, color: 1, hat: 1, gun: 1, finish: 0 };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return "#" + [c(n >> 16), c((n >> 8) & 255), c(n & 255)]
    .map(v => v.toString(16).padStart(2, "0")).join("");
}
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
function seededLook(name) {
  const h = hashStr(name);
  return { skin: h % 5, outfit: (h >>> 2) % 4, color: (h >>> 4) % 6,
           hat: (h >>> 7) % 6, gun: (h >>> 9) % 3, finish: (h >>> 11) % 3 };
}
const lookOf = p => p.look || seededLook(p.name);

/* One suit: rigid cutout pieces, jointed by CSS transforms.
   Lives render as lamps on the chest panel; the visor cracks on elimination. */
function rigSVG(look, phase = 0) {
  const visor = SKINS[look.skin], col = COLORS[look.color];
  const colDk = shade(col, .55), colLt = shade(col, .8);
  const dark = "#10141a";

  let trim = "";
  if (look.outfit === 1) trim = `
    <circle cx="46" cy="98" r="1.4" fill="${colDk}"/><circle cx="74" cy="98" r="1.4" fill="${colDk}"/>
    <circle cx="46" cy="112" r="1.4" fill="${colDk}"/><circle cx="74" cy="112" r="1.4" fill="${colDk}"/>
    <path d="M30 122 Q60 128 90 122" stroke="${colDk}" stroke-width="2.6" fill="none"/>
    <path d="M28 96 Q33 90 40 88 M92 96 Q87 90 80 88" stroke="${colDk}" stroke-width="2.2" fill="none"/>`;
  else if (look.outfit === 2) trim = `
    <path d="M40 84 L82 126 L74 130 L34 90 Z" fill="${shade(col, .68)}" stroke="${colDk}" stroke-width="1"/>
    <rect x="56" y="102" width="10" height="7" rx="1.6" fill="#2c261c" stroke="${colDk}" stroke-width="1"/>`;
  else if (look.outfit === 3) trim = `
    <rect x="40" y="74" width="40" height="9" rx="4.5" fill="${shade(col, .68)}" stroke="${colDk}" stroke-width="1.2"/>
    <circle cx="46" cy="78.5" r="1.3" fill="${colDk}"/><circle cx="74" cy="78.5" r="1.3" fill="${colDk}"/>
    <path d="M26 118 Q60 126 94 118" stroke="${colDk}" stroke-width="4" fill="none"/>`;

  let kit = "";
  if (look.hat === 1) kit = `
    <path d="M74 20 L82 7" stroke="#8a8f96" stroke-width="2"/>
    <circle cx="83" cy="5.5" r="2.6" fill="#c9a24b"/>`;
  else if (look.hat === 2) kit = `
    <path d="M50 17 Q60 2 70 17 Z" fill="${colLt}" stroke="${colDk}" stroke-width="1.3"/>`;
  else if (look.hat === 3) kit = `
    <rect x="30.5" y="28" width="5" height="9" rx="2" fill="#8a8f96" stroke="#4a4e54" stroke-width="1"/>
    <rect x="84.5" y="28" width="5" height="9" rx="2" fill="#8a8f96" stroke="#4a4e54" stroke-width="1"/>`;
  else if (look.hat === 4) kit = `
    <path d="M50 15 L52 6 L57 12 L60 3 L63 12 L68 6 L70 15 Z" fill="#c9a24b" stroke="#8a6c2c" stroke-width="1.2"/>`;
  else if (look.hat === 5) kit = `
    <circle cx="60" cy="15" r="4.4" fill="#2a2e33" stroke="#15181c" stroke-width="1"/>
    <circle cx="60" cy="15" r="2" fill="#ffd76a"/>`;

  const lamps = Array.from({ length: 5 }, (_, i) =>
    `<circle class="lamp" cx="${49 + i * 5.6}" cy="103" r="2.1"/>`).join("");

  return `<svg class="rig" viewBox="0 0 120 132" style="--ph:${phase}s">
    <g class="torso">
      <rect x="15" y="80" width="15" height="36" rx="5" fill="${shade(col, .62)}" stroke="${colDk}" stroke-width="1.3"/>
      <path d="M19 88 h7 M19 100 h7" stroke="${colDk}" stroke-width="1.6"/>
      <path d="M28 132 Q26 100 34 90 Q41 80 60 80 Q79 80 86 90 Q94 100 92 132 Z"
        fill="${col}" stroke="${colDk}" stroke-width="1.6"/>
      <path d="M30 118 H90" stroke="${colDk}" stroke-width="1.4" opacity=".6"/>
      <ellipse cx="36" cy="88" rx="9" ry="6" fill="${colLt}" stroke="${colDk}" stroke-width="1.2"/>
      <ellipse cx="84" cy="88" rx="9" ry="6" fill="${colLt}" stroke="${colDk}" stroke-width="1.2"/>
      <rect x="44" y="95" width="32" height="17" rx="3" fill="#1d1913" stroke="${colDk}" stroke-width="1.3"/>
      ${lamps}
      <path d="M49 108.5 H71" stroke="#3a342a" stroke-width="1.6"/>
      ${trim}
      <g class="head">
        <rect x="48" y="70" width="24" height="9" rx="3.5" fill="#3c4148" stroke="#23262b" stroke-width="1.2"/>
        <ellipse cx="60" cy="42" rx="25" ry="27" fill="${col}" stroke="${colDk}" stroke-width="1.6"/>
        <path d="M42 24 Q50 16 62 17" stroke="#f5efdf" stroke-width="2.4" fill="none" opacity=".16"/>
        <rect class="visor" x="40" y="30" width="40" height="22" rx="11" fill="${visor}" stroke="${dark}" stroke-width="1.6"/>
        <path d="M46 35 Q56 32 66 34" stroke="#ffffff" stroke-width="2" fill="none" opacity=".35"/>
        <g class="eyes-open">
          <circle cx="52" cy="42" r="2.6" fill="${dark}"/>
          <circle cx="68" cy="42" r="2.6" fill="${dark}"/>
          <circle cx="52.9" cy="41" r=".8" fill="#f2f5f7"/><circle cx="68.9" cy="41" r=".8" fill="#f2f5f7"/>
        </g>
        <g class="eyes-x" stroke="${dark}" stroke-width="1.7" stroke-linecap="round">
          <path d="M48.5 38.5 l7 7 M55.5 38.5 l-7 7 M64.5 38.5 l7 7 M71.5 38.5 l-7 7"/>
        </g>
        <g class="crack" stroke="#eef2f5" stroke-width="1.1" fill="none" opacity=".8">
          <path d="M44 33 L52 40 L49 46 M52 40 L58 44 L57 50 M58 44 L66 39"/>
        </g>
        <g class="hat">${kit}</g>
      </g>
    </g>
  </svg>`;
}

/* One revolver: model sets the barrel, finish sets the metal. */
function gunSVG(look) {
  const metal = `url(#${FINISH_GRAD[look.finish]})`;
  const barrel = [26, 40, 54][look.gun];
  const tip = 54 + barrel;
  return `<svg class="gun" viewBox="0 0 110 58" width="84" height="44">
    <rect x="${tip - 2}" y="21" width="3.4" height="14" rx="1.6" fill="#c9a24b"/>
    <rect x="${tip - 8}" y="17.5" width="2.6" height="5.5" rx="1" fill="#c9a24b"/>
    <rect x="52" y="23" width="${barrel}" height="10" rx="3.4" fill="${metal}" stroke="#0b0d10" stroke-width="1.1"/>
    <rect x="27" y="22" width="22" height="13" rx="2.4" fill="${metal}" stroke="#0b0d10" stroke-width="1.1"/>
    <path d="M30 22 L23 14 l4 -3.4 6.4 6.4 z" fill="${metal}" stroke="#0b0d10" stroke-width="1"/>
    <circle cx="42" cy="28" r="14" fill="${metal}" stroke="#0b0d10" stroke-width="1.3"/>
    <g fill="#0b0d10">
      <circle cx="42" cy="20.3" r="2.5"/><circle cx="48.7" cy="24.2" r="2.5"/>
      <circle cx="48.7" cy="31.8" r="2.5"/><circle cx="42" cy="35.7" r="2.5"/>
      <circle cx="35.3" cy="31.8" r="2.5"/><circle cx="35.3" cy="24.2" r="2.5"/>
    </g>
    <circle cx="42" cy="28" r="2.1" fill="#c9a24b"/>
    <path d="M33 35 q-.8 7 -6 12.5 q-3 3.4 -7 1.4 q-3.2 -2 -1.6 -6.2 l5 -10.6 q1.6 -3.1 4.6 -3.1 h5z"
      fill="url(#g-wood)" stroke="#1c1108" stroke-width="1"/>
    <path d="M36 37 a5.8 5.8 0 1 0 9.4 2.4" fill="none" stroke="#c9a24b" stroke-width="1.7"/>
  </svg>`;
}

/* ---------------- persistent settings ---------------- */
const store = {
  get games() { return +(localStorage.getItem("lc.games") || 0); },
  set games(v) { localStorage.setItem("lc.games", v); },
  get felt() { return localStorage.getItem("lc.felt") || "green"; },
  set felt(v) { localStorage.setItem("lc.felt", v); },
  get finish() { return localStorage.getItem("lc.finish") || "steel"; },
  set finish(v) { localStorage.setItem("lc.finish", v); },
  get streamer() { return localStorage.getItem("lc.streamer") === "1"; },
  set streamer(v) { localStorage.setItem("lc.streamer", v ? "1" : "0"); },
  get look() {
    try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem("lc.look")) }; }
    catch { return { ...DEFAULT_LOOK }; }
  },
  set look(v) { localStorage.setItem("lc.look", JSON.stringify(v)); }
};
const UNLOCKS = { felt: { green: 0, oxblood: 3, midnight: 8 } };

/* ---------------- audio ----------------
   All procedural WebAudio through one compressed bus. The suspense layer:
   hammer cock and a heartbeat under every aim, casing tinks, a felt slide
   when the gun changes hands, a low thud for eliminations, a resolve sting. */
const AC = window.AudioContext || window.webkitAudioContext;
let actx = null, bus = null;
function audio() {
  if (!actx) {
    actx = new AC();
    bus = actx.createDynamicsCompressor();
    bus.threshold.value = -18; bus.knee.value = 20; bus.ratio.value = 6;
    const master = actx.createGain();
    master.gain.value = .9;
    bus.connect(master).connect(actx.destination);
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function tone({ f = 440, type = "sine", g = .2, dur = .12, when = 0, fEnd = null }) {
  const a = audio(), t0 = a.currentTime + when;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
  gn.gain.setValueAtTime(g, t0);
  gn.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  o.connect(gn).connect(bus);
  o.start(t0); o.stop(t0 + dur + .02);
}
function noiseHit({ dur = .3, g = .5, when = 0, fc = 1000, type = "lowpass", q = 1 }) {
  const a = audio(), t0 = a.currentTime + when;
  const len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = fc; f.Q.value = q;
  const gn = a.createGain(); gn.gain.value = g;
  s.connect(f).connect(gn).connect(bus);
  s.start(t0);
}
/* trigger click: two-part mechanical snap */
function sClick() {
  tone({ f: 1900, type: "square", g: .09, dur: .045 });
  tone({ f: 620, type: "square", g: .05, dur: .04, when: .018 });
}
/* hammer drawn back: double ratchet, lower and drier than the click */
function sCock() {
  tone({ f: 460, type: "square", g: .07, dur: .035 });
  tone({ f: 700, type: "square", g: .08, dur: .045, when: .09 });
}
/* heartbeat under the aim: lub-dub, twice */
function sHeart() {
  for (let i = 0; i < 2; i++) {
    const base = .15 + i * .58;
    tone({ f: 72, g: .5, dur: .16, when: base, fEnd: 46 });
    tone({ f: 64, g: .34, dur: .14, when: base + .2, fEnd: 42 });
  }
}
/* gunshot: noise crack over a deep sine thump */
function sBang() {
  noiseHit({ dur: .38, g: .8, fc: 850 });
  noiseHit({ dur: .1, g: .3, fc: 3200, type: "highpass" });
  tone({ f: 130, g: .7, dur: .3, fEnd: 40 });
}
/* ejected casing bouncing on the table */
function sTink() {
  tone({ f: 2600, type: "triangle", g: .11, dur: .06 });
  tone({ f: 2150, type: "triangle", g: .06, dur: .05, when: .13 });
  tone({ f: 2900, type: "triangle", g: .035, dur: .04, when: .23 });
}
/* revolver sliding across the felt */
function sSlide() { noiseHit({ dur: .34, g: .16, fc: 620, type: "bandpass", q: .9 }); }
/* soft exhale after a blank */
function sPuff() { noiseHit({ dur: .28, g: .1, fc: 1500, type: "highpass", when: .12 }); }
/* elimination: low drop with a body of noise */
function sThud() {
  tone({ f: 115, g: .6, dur: .5, fEnd: 36 });
  noiseHit({ dur: .22, g: .22, fc: 320 });
}
/* end of game resolve */
function sWin() {
  tone({ f: 392, type: "triangle", g: .16, dur: .2 });
  tone({ f: 523, type: "triangle", g: .16, dur: .2, when: .18 });
  tone({ f: 659, type: "triangle", g: .18, dur: .45, when: .36 });
}
function sSpin() { for (let i = 0; i < 8; i++) setTimeout(sClick, i * (45 + i * 10)); }

/* ---------------- ui state ---------------- */
const ui = {
  mode: null,          /* solo | hot | online */
  st: null,            /* local authoritative state */
  pub: null,           /* rendered snapshot */
  you: 0,              /* seat shown in the hand bar; null = spectator */
  humans: [0],
  ws: null, host: false, spectating: false,
  queue: [], anim: false, canAct: false,
  pendingState: null, pendingPeek: null,
  botTimer: 0, counted: false
};
window.LC = ui;   /* debug handle */

/* ---------------- helpers ---------------- */
const nameOf = pid => ui.pub?.players.find(p => p.id === pid)?.name || "?";
const isYou = pid => pid === ui.you;
const N = pid => isYou(pid) ? "You" : nameOf(pid);          /* subject */
const No = pid => isYou(pid) ? "you" : nameOf(pid);          /* object */
const Np = pid => isYou(pid) ? "Your" : nameOf(pid) + "'s";  /* possessive */
const V = (pid, third, second) => isYou(pid) ? second : third;
function show(id) { $$(".screen").forEach(s => s.classList.add("hidden")); $(id).classList.remove("hidden"); }
function modal(id, on = true) { $(id).classList.toggle("hidden", !on); }

function log(html, cls = "") {
  const p = document.createElement("p");
  if (cls) p.className = cls;
  p.innerHTML = html;
  $("#ledger").appendChild(p);
  $("#ledger").scrollTop = $("#ledger").scrollHeight;
}

/* ---------------- render ---------------- */
function shellSvg(sym) { return `<svg><use href="#${sym}"/></svg>`; }

function buildSeats() {
  const wrap = $("#seats"); wrap.innerHTML = "";
  for (const p of ui.pub.players) {
    const s = document.createElement("div");
    s.className = "seat"; s.id = "seat" + p.id;
    const phase = -((hashStr(p.name) % 40) / 10);   /* desync the idle loops */
    s.innerHTML = `
      <div class="seatrow">
        <div class="rigbox">${rigSVG(lookOf(p), phase)}</div>
        <div class="gear"></div>
      </div>
      <button class="cap"><svg class="i"><use href="#i-cross"/></svg><span class="nm"></span></button>`;
    s.querySelector(".cap").addEventListener("click", () => humanShoot(p.id));
    wrap.appendChild(s);
  }
  $("#gunLayer").innerHTML = `<div id="gunRot"></div>`;
  layoutSeats();
  renderState();
  placeGun(ui.pub.turn, false);
  /* seats settle size after fonts and media queries apply; follow them */
  ui.seatRO?.disconnect();
  ui.seatRO = new ResizeObserver(() => ui.pub && layoutSeats());
  const s0 = wrap.querySelector(".seat");
  if (s0) ui.seatRO.observe(s0);
}

function layoutSeats() {
  const t = $("#table").getBoundingClientRect();
  if (!t.width) return;
  const s0 = $(".seat");
  const sw = s0 ? s0.offsetWidth : 128, sh = s0 ? s0.offsetHeight : 160;
  const cx = t.width / 2, cy = t.height / 2;
  const rx = Math.min(t.width / 2 - sw / 2 - 10, t.width * .38);
  const ry = Math.min(t.height / 2 - sh / 2 - 12, t.height * .42);
  const n = ui.pub.players.length;
  const anchor = ui.you ?? 0;   /* your seat at the bottom */
  ui.layout = { cx, cy, rx, ry, n, anchor };
  ui.tblW = t.width; ui.tblH = t.height;
  ui.pub.players.forEach((p, i) => {
    const ang = Math.PI / 2 + ((i - anchor + n) % n) / n * Math.PI * 2;
    const s = $("#seat" + p.id);
    s.style.left = (cx + Math.cos(ang) * rx) + "px";
    s.style.top = (cy + Math.sin(ang) * ry) + "px";
  });
  if (ui.gunAt != null) placeGun(ui.gunAt, false);
}
window.addEventListener("resize", () => ui.pub && layoutSeats());
/* keep a live reference: an unreferenced observer can be garbage collected */
const tableRO = new ResizeObserver(() => ui.pub && layoutSeats());
tableRO.observe($("#table"));

/* ---------------- the traveling gun ---------------- */
function seatAngle(pid) {
  const L = ui.layout, i = ui.pub.players.findIndex(p => p.id === pid);
  return Math.PI / 2 + ((i - L.anchor + L.n) % L.n) / L.n * Math.PI * 2;
}
function seatXY(pid) {
  const L = ui.layout, a = seatAngle(pid);
  if (Number.isNaN(a)) return { x: L.cx, y: L.cy };
  return { x: L.cx + Math.cos(a) * L.rx, y: L.cy + Math.sin(a) * L.ry };
}
function gunXY(pid) {
  const L = ui.layout, a = seatAngle(pid);
  return { x: L.cx + Math.cos(a) * L.rx * .2, y: L.cy + Math.sin(a) * L.ry * .2 };
}
/* Put the revolver on the felt in front of pid, drawn in their design. */
function placeGun(pid, animate = true) {
  const rot = $("#gunRot");
  if (pid == null || !ui.layout || !rot) return;
  const layer = $("#gunLayer");
  const p = ui.pub.players.find(q => q.id === pid);
  if (!p) return;
  if (ui.gunSkin !== p.id) { rot.innerHTML = gunSVG(lookOf(p)); ui.gunSkin = p.id; }
  const g = gunXY(pid);
  if (!animate) { layer.style.transition = "none"; rot.style.transition = "none"; }
  layer.style.left = g.x + "px";
  layer.style.top = g.y + "px";
  const c = ui.layout;
  rot.style.transform = `rotate(${Math.atan2(c.cy - g.y, c.cx - g.x) * 180 / Math.PI}deg)`;
  if (!animate) requestAnimationFrame(() => { layer.style.transition = ""; rot.style.transition = ""; });
  ui.gunAt = pid;
}
/* Swing the barrel from the holder's spot toward the target's seat. */
function aimGun(tid) {
  const rot = $("#gunRot");
  if (ui.gunAt == null || !ui.layout || !rot) return;
  const g = gunXY(ui.gunAt), t = seatXY(tid);
  rot.style.transform =
    `rotate(${Math.atan2(t.y - g.y, t.x - g.x) * 180 / Math.PI}deg)`;
}
function recoilGun() {
  const rot = $("#gunRot");
  if (!rot) return;
  rot.classList.add("recoil");
  setTimeout(() => rot.classList.remove("recoil"), 400);
}
const rigOf = pid => $("#seat" + pid + " .rig");

/* ---------------- impact effects ---------------- */
function fxSpawn(html, x, y) {
  const d = document.createElement("div");
  d.className = "fxn";
  d.style.left = x + "px"; d.style.top = y + "px";
  d.innerHTML = html;
  $("#fxLayer").appendChild(d);
  return d;
}
const fxDone = (el, ms) => setTimeout(() => el.remove(), ms);

function fxMuzzle(x, y, deg) {
  const el = fxSpawn(`<svg width="46" height="46" viewBox="-23 -23 46 46" style="transform:rotate(${deg}deg)">
    <path d="M3 0 L21 -5.5 L14 0 L21 5.5 Z" fill="#ffd76a"/>
    <path d="M1 -3.5 L15 -10 M1 3.5 L15 10" stroke="#ffb84a" stroke-width="2"/>
    <circle cx="4.5" cy="0" r="4.5" fill="#fff1c4"/>
  </svg>`, x, y);
  el.animate(
    [{ opacity: 1, transform: "translate(-50%,-50%) scale(.5)" },
     { opacity: 0, transform: "translate(-50%,-50%) scale(1.5)" }],
    { duration: 180, easing: "ease-out" });
  fxDone(el, 200);
}
function fxCasing(x, y, deg) {
  const el = fxSpawn(`<svg width="12" height="12" viewBox="0 0 12 12">
    <rect x="3.5" y="1" width="5" height="10" rx="1.8" fill="#b08d3f" stroke="#6b5321" stroke-width=".8"/>
  </svg>`, x, y);
  const side = (deg - 90) * Math.PI / 180;
  const dx = Math.cos(side) * (24 + rnd(18)), dy = Math.sin(side) * (24 + rnd(18));
  el.animate([
    { transform: "translate(-50%,-50%) rotate(0)", opacity: 1 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy - 30}px)) rotate(260deg)`, opacity: 1, offset: .45 },
    { transform: `translate(calc(-50% + ${dx * 1.7}px), calc(-50% + ${dy + 24}px)) rotate(480deg)`, opacity: 0 }
  ], { duration: 720, easing: "cubic-bezier(.3,.6,.6,1)" });
  fxDone(el, 740);
  setTimeout(sTink, 420);
}
function fxBurst(x, y) {
  for (let i = 0; i < 9; i++) {
    const el = fxSpawn(`<svg width="10" height="10"><circle cx="5" cy="5" r="${2 + Math.random() * 2.2}" fill="${i % 3 ? "#a8281f" : "#6e150f"}"/></svg>`, x, y);
    const a = Math.random() * Math.PI * 2, d = 16 + rnd(30);
    el.animate([
      { transform: "translate(-50%,-50%)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 9}px)) scale(.5)`, opacity: 0 }
    ], { duration: 430 + rnd(160), easing: "ease-out" });
    fxDone(el, 620);
  }
  const splat = fxSpawn(`<svg width="46" height="30" viewBox="0 0 46 30">
    <ellipse cx="18" cy="16" rx="9" ry="5.6" fill="#5a1713"/>
    <ellipse cx="31" cy="12" rx="5" ry="3.4" fill="#6e150f"/>
    <ellipse cx="27" cy="21" rx="3.4" ry="2.2" fill="#5a1713"/>
  </svg>`, x, y + 28);
  splat.animate([{ opacity: .85 }, { opacity: .85, offset: .6 }, { opacity: 0 }], { duration: 3600 });
  fxDone(splat, 3650);
}
function fxPuff(x, y) {
  const el = fxSpawn(`<svg width="26" height="26"><circle cx="13" cy="13" r="8" fill="#9a968c" opacity=".5"/></svg>`, x, y);
  el.animate([
    { transform: "translate(-50%,-50%) scale(.4)", opacity: .55 },
    { transform: "translate(-50%,-95%) scale(1.7)", opacity: 0 }
  ], { duration: 720, easing: "ease-out" });
  fxDone(el, 740);
}
function fxShake() {
  $("#table").animate([
    { transform: "translate(0,0)" }, { transform: "translate(-5px,3px)" },
    { transform: "translate(5px,-3px)" }, { transform: "translate(-3px,-2px)" },
    { transform: "translate(2px,2px)" }, { transform: "translate(0,0)" }
  ], { duration: 300 });
}

function renderState() {
  const pub = ui.pub;
  if (!pub) return;
  for (const p of pub.players) {
    const s = $("#seat" + p.id);
    if (!s) continue;
    s.classList.toggle("dead", !p.alive);
    s.classList.toggle("current", pub.turn === p.id && p.alive && !pub.over);
    s.classList.toggle("me", p.id === ui.you);
    s.querySelector(".nm").innerHTML = p.alive ? p.name : `${p.name}<span class="out">out</span>`;
    const cap = pub.rules?.lives ?? 3;
    s.querySelectorAll(".lamp").forEach((l, i) => {
      l.style.display = i < cap ? "" : "none";
      l.classList.toggle("on", i < p.lives);
      l.classList.toggle("low", p.alive && p.lives === 1 && i === 0);
    });
    const state =
      (p.shield ? `<svg class="i state"><use href="#i-shield"/></svg>` : "") +
      (p.cuffed ? `<svg class="i state"><use href="#i-cuffs"/></svg>` : "");
    const held = p.id === ui.you ? "" :
      p.items.map(k => `<svg class="i"><use href="#${ICON[k]}"/></svg>`).join("");
    s.querySelector(".gear").innerHTML = state + held;
  }
  $("#roundLabel").textContent = `Round ${pub.round}`;
  $("#shellRow").innerHTML =
    Array(pub.live).fill(shellSvg("sh-live")).join("") +
    `<span class="gap"></span>` +
    Array(pub.blank).fill(shellSvg("sh-blank")).join("");
  renderHand();
}

function renderHand() {
  const wrap = $("#hand"); wrap.innerHTML = "";
  const me = ui.you == null ? null : ui.pub.players.find(p => p.id === ui.you);
  if (me) me.items.forEach((k, idx) => {
    const b = document.createElement("button");
    b.className = "itembtn";
    b.title = E.ITEMS[k].desc;
    b.innerHTML = `<svg class="i"><use href="#${ICON[k]}"/></svg>${E.ITEMS[k].name}`;
    b.disabled = !ui.canAct;
    b.addEventListener("click", () => humanItem(idx));
    wrap.appendChild(b);
  });
  /* the hand changes the action bar's height; frame-based observers can be
     throttled, so measure the table directly and re-lay seats if it moved */
  if (ui.layout) {
    const t = $("#table").getBoundingClientRect();
    if (Math.abs(t.width - ui.tblW) > .5 || Math.abs(t.height - ui.tblH) > .5) layoutSeats();
  }
}

function setPrompt(html) { $("#prompt").innerHTML = html || "&nbsp;"; }
function setTargets(on) {
  for (const p of ui.pub.players) {
    const s = $("#seat" + p.id);
    s.classList.toggle("targetable", on && p.alive);
    s.querySelector(".cap").title =
      on && p.alive ? (p.id === ui.you ? "Shoot yourself" : `Shoot ${p.name}`) : "";
  }
}


/* ---------------- event animation ---------------- */
function enqueue(events) {
  ui.queue.push(...events);
  if (!ui.anim) runQueue();
}
async function runQueue() {
  ui.anim = true;
  while (ui.queue.length) await animate(ui.queue.shift());
  ui.anim = false;
  afterQueue();
}

async function animate(ev) {
  const pub = ui.pub;
  switch (ev.e) {
    case "round": {
      pub.round = ev.round; pub.live = ev.live; pub.blank = ev.blank;
      if (ui.st) ui.pub = E.pub(ui.st);       /* pick up dealt items locally */
      log(`The dealer loads <b>${ev.live} live</b> and <b>${ev.blank} blank</b>, then spins the cylinder.`, "sys");
      sSpin();
      renderState();
      await delay(1000);
      break;
    }
    case "turn": {
      pub.turn = ev.pid;
      renderState();
      if (ui.gunAt != null && ui.gunAt !== ev.pid) sSlide();
      placeGun(ev.pid, true);
      await delay(450);
      break;
    }
    case "skip": {
      const p = pub.players.find(q => q.id === ev.pid);
      if (p) p.cuffed = false;
      log(`<b>${N(ev.pid)}</b> ${V(ev.pid, "sits", "sit")} this one out, cuffed.`);
      renderState();
      await delay(700);
      break;
    }
    case "item": {
      await animateItem(ev);
      break;
    }
    case "shot": {
      const self = ev.pid === ev.tid;
      aimGun(ev.tid);
      sCock();
      sHeart();
      const tRig = rigOf(ev.tid);
      if (tRig) tRig.classList.add("gasp");
      const aimLine = self
        ? `<b>${N(ev.pid)}</b> ${V(ev.pid, "turns", "turn")} the gun inward.`
        : `<b>${N(ev.pid)}</b> ${V(ev.pid, "draws", "draw")} on <b>${No(ev.tid)}</b>.`;
      setPrompt(aimLine);
      log(aimLine);
      await delay(1400);
      const msg = $("#centerMsg");
      const t = pub.players.find(q => q.id === ev.tid);
      if (!t) break;   /* stale event from an abandoned game */
      /* geometry for the effects layer */
      const g = ui.gunAt != null ? gunXY(ui.gunAt) : null;
      const ts = seatXY(ev.tid);
      const deg = g ? Math.atan2(ts.y - g.y, ts.x - g.x) * 180 / Math.PI : 0;
      const mx = g ? g.x + Math.cos(deg * Math.PI / 180) * 48 : 0;
      const my = g ? g.y + Math.sin(deg * Math.PI / 180) * 48 : 0;
      if (ev.live) {
        pub.live = Math.max(0, pub.live - 1);
        sBang();
        recoilGun();
        fxShake();
        if (g) { fxMuzzle(mx, my, deg); fxCasing(g.x, g.y, deg); }
        fxBurst(ts.x, ts.y - 16);
        if (tRig) {
          tRig.classList.add("flinch");
          setTimeout(() => tRig.classList.remove("flinch"), 600);
        }
        $("#flash").style.opacity = .8;
        setTimeout(() => $("#flash").style.opacity = 0, 70);
        msg.textContent = "BANG"; msg.className = "show bang";
        if (ev.shielded) {
          t.shield = false;
          log(`Live. <b>${Np(t.id)}</b> shield takes the hit.`, "hit");
        } else {
          t.lives = Math.max(0, t.lives - ev.dmg);
          const el = $("#seat" + t.id);
          if (el) {
            el.classList.add("hit");
            setTimeout(() => el.classList.remove("hit"), 500);
          }
          log(`Live. <b>${N(t.id)}</b> ${V(t.id, "loses", "lose")} ${ev.dmg === 2 ? "two lives" : "a life"}.`, "hit");
          if (ev.killed) {
            t.alive = false;
            setTimeout(sThud, 320);
            log(`<b>${N(t.id)}</b> ${V(t.id, "is", "are")} out.`, "hit");
          }
        }
      } else {
        pub.blank = Math.max(0, pub.blank - 1);
        sClick();
        sPuff();
        if (g) fxPuff(mx, my);
        msg.textContent = "click"; msg.className = "show click";
        log(`Click. Blank.`, "safe");
        if (ev.keep) log(`<b>${N(ev.pid)}</b> ${V(ev.pid, "keeps", "keep")} the gun.`, "sys");
      }
      renderState();
      await delay(1150);
      msg.className = "";
      if (tRig) tRig.classList.remove("gasp");
      break;
    }
    case "end": {
      await delay(300);
      break;
    }
  }
}

async function animateItem(ev) {
  const p = ui.pub.players.find(q => q.id === ev.pid);
  if (p && ui.st) ui.pub = E.pub(ui.st);
  else if (p) {  /* trust the event; full state lands after the queue */
    const meIdx = p.items.indexOf(ev.item);
    if (meIdx >= 0) p.items.splice(meIdx, 1);
  }
  const n = `<b>${N(ev.pid)}</b>`;
  const v = (third, second) => V(ev.pid, third, second);
  switch (ev.item) {
    case "peek":
      log(`${n} ${v("steals", "steal")} a look at the next shell.`);
      if (ev.pid === ui.you && ui.pendingPeek != null) {
        await showPeek(ui.pendingPeek);
        ui.pendingPeek = null;
      }
      break;
    case "eject": {
      ui.pub[ev.live ? "live" : "blank"] = Math.max(0, ui.pub[ev.live ? "live" : "blank"] - 1);
      sTink();
      if (ui.gunAt != null && ui.layout) {
        const g = gunXY(ui.gunAt);
        fxCasing(g.x, g.y, Math.atan2(ui.layout.cy - g.y, ui.layout.cx - g.x) * 180 / Math.PI);
      }
      log(`${n} ${v("ejects", "eject")} the next shell. It was ${ev.live ? "<b>live</b>" : "a blank"}.`, ev.live ? "hit" : "safe");
      break;
    }
    case "spin": sSpin(); log(`${n} ${v("gives", "give")} the cylinder a spin.`); break;
    case "shield": if (p) p.shield = true; log(`${n} ${v("braces", "brace")} behind a shield.`); break;
    case "flask":
      if (p && ev.gained) p.lives = Math.min(ui.pub.rules?.lives ?? 3, p.lives + 1);
      log(ev.gained
        ? `${n} ${v("takes", "take")} a pull from the flask. One life back.`
        : `${n} ${v("drinks", "drink")}. Nothing to gain.`, ev.gained ? "safe" : "");
      break;
    case "double": log(`${n} ${v("loads", "load")} a hot round. The next live shell hits twice.`, "hit"); break;
    case "cuffs":
      if (ev.tid != null) {
        const t = ui.pub.players.find(q => q.id === ev.tid);
        if (t) t.cuffed = true;
        log(`${n} ${v("cuffs", "cuff")} <b>${No(ev.tid)}</b>.`);
      }
      break;
  }
  renderState();
  await delay(600);
}

function showPeek(live) {
  return new Promise(res => {
    const r = $("#peekResult");
    const reveal = () => { r.textContent = live ? "Live" : "Blank"; r.className = "peek-result " + (live ? "live" : "blank"); };
    const hide = () => { r.textContent = "· · ·"; r.className = "peek-result"; };
    if (store.streamer) {
      hide();
      const b = $("#peekHold");
      b.classList.remove("hidden");
      b.onpointerdown = reveal;
      b.onpointerup = b.onpointerleave = hide;
    } else {
      $("#peekHold").classList.add("hidden");
      reveal();
    }
    modal("#peekModal");
    $("#peekOk").onclick = () => { modal("#peekModal", false); res(); };
  });
}

/* ---------------- flow control ---------------- */
function afterQueue() {
  if (ui.pendingState) { ui.pub = ui.pendingState; ui.pendingState = null; renderState(); }
  else if (ui.st) { ui.pub = E.pub(ui.st); renderState(); }
  const pub = ui.pub;
  if (!pub) return;

  if (pub.over) {
    if (!ui.counted) { ui.counted = true; store.games++; sWin(); }
    const w = pub.players.find(p => p.id === pub.winner);
    if (w) rigOf(w.id)?.classList.add("cheer");
    $("#overTitle").textContent = !w ? "Nobody" : w.id === ui.you ? "You take the table" : `${w.name} takes the table`;
    $("#overSub").textContent = w ? `${pub.round} ${pub.round === 1 ? "round" : "rounds"} played.` : "The table is silent.";
    $("#againBtn").classList.toggle("hidden", ui.mode === "online" && !ui.host);
    modal("#overModal");
    return;
  }

  const cur = pub.players.find(p => p.id === pub.turn);
  if (!cur) return;

  if (ui.mode === "online") {
    if (ui.you != null && cur.id === ui.you) enableInput();
    else waitPrompt(cur);
    return;
  }

  if (cur.bot) {
    waitPrompt(cur);
    clearTimeout(ui.botTimer);
    ui.botTimer = setTimeout(botStep, 900 + rnd(700));
  } else if (ui.mode === "hot" && cur.id !== ui.you) {
    setPrompt("&nbsp;");
    setTargets(false);
    $("#passName").textContent = cur.name;
    modal("#passModal");
    $("#passOk").onclick = () => {
      modal("#passModal", false);
      ui.you = cur.id;
      layoutSeats();
      renderState();
      enableInput();
    };
  } else {
    enableInput();
  }
}

function enableInput() {
  ui.canAct = true;
  setPrompt(`Your move. An item first, or click a name to shoot. Your own counts.`);
  setTargets(true);
  renderHand();
}
function waitPrompt(cur) {
  ui.canAct = false;
  setPrompt(cur.bot ? `<b>${cur.name}</b> is thinking.` : `Waiting on <b>${cur.name}</b>.`);
  setTargets(false);
  renderHand();
}
function lockInput() {
  ui.canAct = false;
  setTargets(false);
  renderHand();
}

function botStep() {
  const st = ui.st;
  if (!st || st.over) return;
  const cur = st.players[st.turn];
  if (!cur.bot) return;
  const mv = E.botMove(st);
  const events = mv.a === "item" ? E.useItem(st, cur.id, mv.idx).ev : E.shoot(st, cur.id, mv.tid);
  enqueue(events);
}

/* ---------------- human actions ---------------- */
function humanShoot(tid) {
  if (!ui.canAct) return;
  lockInput();
  if (ui.mode === "online") ui.ws?.send(JSON.stringify({ t: "shoot", tid }));
  else enqueue(E.shoot(ui.st, ui.pub.turn, tid));
}
function humanItem(idx) {
  if (!ui.canAct) return;
  lockInput();
  if (ui.mode === "online") { ui.ws?.send(JSON.stringify({ t: "item", idx })); return; }
  const { ev, priv } = E.useItem(ui.st, ui.pub.turn, idx);
  if (priv) ui.pendingPeek = priv.live;
  enqueue(ev);
}

/* ---------------- game starters ---------------- */
const LIVES_WORD = ["", "One", "Two", "Three", "Four", "Five"];
const livesLine = (n, lives) =>
  `${n} at the table. ${LIVES_WORD[lives] || lives} ${lives === 1 ? "life" : "lives"} each.`;

function startLocal(defs, humans, rules) {
  clearTimeout(ui.botTimer);
  ui.queue.length = 0;
  ui.st = E.newGame(defs, rules);
  ui.humans = humans;
  ui.you = humans[0];
  ui.counted = false;
  ui.gunSkin = null; ui.gunAt = null;
  ui.pub = E.pub(ui.st);
  $("#ledger").innerHTML = "";
  $("#chatForm").classList.add("hidden");
  show("#game");
  buildSeats();
  log(livesLine(defs.length, ui.st.rules.lives), "sys");
  const ev = [];
  E.beginTurn(ui.st, ev);
  /* setTimeout, not rAF: rAF starves in hidden tabs and would stall the deal */
  setTimeout(() => { layoutSeats(); enqueue(ev); }, 0);
}

/* ---------------- house rules ---------------- */
const RULE_OPTS = {
  lives: { label: "Lives", values: [2, 3, 4, 5], names: ["2", "3", "4", "5"] },
  itemsPerDeal: { label: "Items each round", values: [0, 1, 2, 3], names: ["0", "1", "2", "3"] },
  heat: { label: "Chamber heat", values: [0, 1, 2], names: ["Calm", "Standard", "Reckless"] }
};
let cfgRules = (() => {
  try { return { lives: 3, itemsPerDeal: 2, heat: 1, ...JSON.parse(localStorage.getItem("lc.rules")) }; }
  catch { return { lives: 3, itemsPerDeal: 2, heat: 1 }; }
})();
function renderRules(sel) {
  const box = $(sel);
  if (!box) return;
  box.innerHTML = "";
  for (const [k, o] of Object.entries(RULE_OPTS)) {
    const lab = document.createElement("label");
    lab.textContent = o.label;
    const seg = document.createElement("div");
    seg.className = "seg";
    o.values.forEach((v, i) => {
      const b = document.createElement("button");
      b.textContent = o.names[i];
      b.classList.toggle("sel", cfgRules[k] === v);
      b.onclick = () => {
        cfgRules[k] = v;
        localStorage.setItem("lc.rules", JSON.stringify(cfgRules));
        renderRules(sel);
      };
      seg.appendChild(b);
    });
    box.append(lab, seg);
  }
}

$("#mSolo").onclick = () => { renderRules("#soloRules"); modal("#soloCfg"); };
$("#mHot").onclick = () => { renderHotNames(); renderRules("#hotRules"); modal("#hotCfg"); };
$("#mOnline").onclick = () => { $("#netErr").textContent = ""; modal("#onlineCfg"); };
$$("[data-close]").forEach(b => b.onclick = () => b.closest(".overlay").classList.add("hidden"));

/* solo */
let soloBots = 3;
$("#soloBots").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  soloBots = +b.dataset.n;
  $$("#soloBots button").forEach(x => x.classList.toggle("sel", x === b));
};
$("#soloGo").onclick = () => {
  audio();
  modal("#soloCfg", false);
  ui.mode = "solo";
  const name = $("#soloName").value.trim() || "You";
  const bots = [...E.BOT_NAMES].sort(() => Math.random() - .5).slice(0, soloBots);
  startLocal([{ name, look: store.look }, ...bots.map(n => ({ name: n, bot: true }))], [0], cfgRules);
};

/* hot seat */
let hotCount = 2, hotBots = 0;
function renderHotNames() {
  const box = $("#hotNames"); box.innerHTML = "";
  for (let i = 0; i < hotCount; i++) {
    const inp = document.createElement("input");
    inp.type = "text"; inp.maxLength = 12; inp.spellcheck = false;
    inp.placeholder = `Player ${i + 1}`;
    inp.style.marginTop = "6px";
    box.appendChild(inp);
  }
}
$("#hotCount").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  hotCount = +b.dataset.n;
  $$("#hotCount button").forEach(x => x.classList.toggle("sel", x === b));
  renderHotNames();
};
$("#hotBots").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  hotBots = +b.dataset.n;
  $$("#hotBots button").forEach(x => x.classList.toggle("sel", x === b));
};
$("#hotGo").onclick = () => {
  audio();
  modal("#hotCfg", false);
  ui.mode = "hot";
  const names = $$("#hotNames input").map((i, idx) => i.value.trim() || `Player ${idx + 1}`);
  const bots = [...E.BOT_NAMES].sort(() => Math.random() - .5).slice(0, hotBots);
  startLocal(
    [...names.map((n, i) => ({ name: n, look: i === 0 ? store.look : null })),
     ...bots.map(n => ({ name: n, bot: true }))],
    names.map((_, i) => i),
    cfgRules
  );
};

/* ---------------- online ---------------- */
let lobbyBots = 2;
function connect(onOpen) {
  if (ui.ws && ui.ws.readyState === WebSocket.OPEN) { onOpen(); return; }
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
  ui.ws = ws;
  ws.onopen = onOpen;
  ws.onclose = () => { if (ui.mode === "online") { ui.mode = null; show("#menu"); } };
  ws.onmessage = raw => {
    const m = JSON.parse(raw.data);
    switch (m.t) {
      case "roster": {
        $("#lobbyCode").textContent = m.code;
        $("#lobbyRoster").innerHTML = m.players
          .map(p => `<div class="chip${p.host ? " host" : ""}">${p.name}</div>`).join("");
        $("#lobbySpec").textContent = m.spectators ? `${m.spectators} watching` : "";
        const meHost = m.players.length && m.players[0].host && ui.host;
        $("#lobbyStart").classList.toggle("hidden", !ui.host);
        $("#lobbyBots").classList.toggle("hidden", !ui.host);
        $("#lobbyRules").classList.toggle("hidden", !ui.host);
        if (ui.host && !$("#lobbyRules").childElementCount) renderRules("#lobbyRules");
        if (!m.started && !$("#game").classList.contains("hidden")) show("#lobby");
        break;
      }
      case "begin": {
        clearTimeout(ui.botTimer);
        ui.st = null;                 /* server is authoritative from here */
        ui.you = m.you;
        ui.spectating = m.you == null;
        ui.pub = m.state;
        ui.counted = false;
        ui.gunSkin = null; ui.gunAt = null;
        ui.queue.length = 0; ui.anim = false;
        modal("#overModal", false);
        $("#ledger").innerHTML = "";
        $("#chatForm").classList.remove("hidden");
        show("#game");
        buildSeats();
        log(livesLine(m.state.players.length, m.state.rules?.lives ?? 3), "sys");
        if (ui.spectating) log("You are watching this table.", "sys");
        setTimeout(layoutSeats, 0);
        break;
      }
      case "ev": {
        ui.pendingState = m.state;
        enqueue(m.events);
        break;
      }
      case "peek": ui.pendingPeek = m.live; break;
      case "note": log(m.text, "sys"); break;
      case "chat": log(`<b>${m.name}</b> ${m.text}`, "talk"); break;
      case "err": $("#netErr").textContent = m.msg; break;
    }
  };
}
$("#netCreate").onclick = () => {
  audio(); ui.mode = "online"; ui.host = true;
  connect(() => {
    ui.ws.send(JSON.stringify({ t: "create", name: $("#netName").value.trim() || "Guest", look: store.look }));
    modal("#onlineCfg", false);
    show("#lobby");
  });
};
$("#netJoin").onclick = () => {
  audio(); ui.mode = "online"; ui.host = false;
  const code = $("#netCode").value.trim().toUpperCase();
  if (code.length !== 4) { $("#netErr").textContent = "Codes are four characters."; return; }
  connect(() => {
    ui.ws.send(JSON.stringify({
      t: "join", code,
      name: $("#netName").value.trim() || "Guest",
      look: store.look,
      spectate: $("#netSpec").checked
    }));
    modal("#onlineCfg", false);
    show("#lobby");
  });
};
$("#botMinus").onclick = () => { lobbyBots = Math.max(0, lobbyBots - 1); $("#botCount").textContent = lobbyBots; };
$("#botPlus").onclick = () => { lobbyBots = Math.min(5, lobbyBots + 1); $("#botCount").textContent = lobbyBots; };
$("#lobbyStart").onclick = () => ui.ws?.send(JSON.stringify({ t: "start", bots: lobbyBots, rules: cfgRules }));
$("#lobbyLeave").onclick = () => { ui.ws?.send(JSON.stringify({ t: "leave" })); ui.mode = null; show("#menu"); };
$("#chatForm").onsubmit = e => {
  e.preventDefault();
  const text = $("#chatIn").value.trim();
  if (text) ui.ws?.send(JSON.stringify({ t: "chat", text }));
  $("#chatIn").value = "";
};

/* ---------------- end of game ---------------- */
$("#againBtn").onclick = () => {
  modal("#overModal", false);
  if (ui.mode === "online") { ui.ws?.send(JSON.stringify({ t: "again" })); return; }
  const defs = ui.st.players.map(p => ({ name: p.name, bot: p.bot, look: p.look }));
  startLocal(defs, ui.humans);
};
$("#overMenu").onclick = () => {
  modal("#overModal", false);
  if (ui.mode === "online") ui.ws?.send(JSON.stringify({ t: "leave" }));
  ui.mode = null;
  show("#menu");
};

/* ---------------- settings ---------------- */
function renderSettings() {
  const games = store.games;
  $$("#feltSeg button").forEach(b => {
    const need = UNLOCKS.felt[b.dataset.v];
    const locked = games < need;
    b.classList.toggle("locked", locked);
    b.classList.toggle("sel", store.felt === b.dataset.v);
    b.textContent = b.dataset.v[0].toUpperCase() + b.dataset.v.slice(1) + (locked ? ` (${need} games)` : "");
  });
  $("#streamerChk").checked = store.streamer;
  $("#playedLine").textContent = `Games finished on this device: ${games}. More felts unlock as you play.`;
}
function applyCosmetics() {
  document.body.dataset.felt = store.felt;
}
$("#settingsBtn").onclick = () => { renderSettings(); modal("#settingsModal"); };
$("#feltSeg").onclick = e => {
  const b = e.target.closest("button");
  if (!b || b.classList.contains("locked")) return;
  store.felt = b.dataset.v; applyCosmetics(); renderSettings();
};
$("#streamerChk").onchange = e => { store.streamer = e.target.checked; };

/* ---------------- wardrobe ---------------- */
const FIT_SEGS = [
  { key: "skin", seg: "#fitSkin", swatch: SKINS },
  { key: "outfit", seg: "#fitOutfit", labels: OUTFITS },
  { key: "color", seg: "#fitColor", swatch: COLORS },
  { key: "hat", seg: "#fitHat", labels: HATS },
  { key: "gun", seg: "#fitGunSeg", labels: GUNS },
  { key: "finish", seg: "#fitFinish", labels: FINISHES }
];
function renderWardrobe() {
  const look = store.look;
  for (const f of FIT_SEGS) {
    const box = $(f.seg); box.innerHTML = "";
    const opts = f.swatch || f.labels;
    opts.forEach((opt, i) => {
      const b = document.createElement("button");
      if (f.swatch) b.innerHTML = `<span style="background:${opt}"></span>`;
      else b.textContent = opt;
      b.classList.toggle("sel", look[f.key] === i);
      b.onclick = () => {
        const next = store.look;
        next[f.key] = i;
        store.look = next;
        renderWardrobe();
      };
      box.appendChild(b);
    });
  }
  $("#fitPreview").innerHTML = rigSVG(look);
  $("#fitGun").innerHTML = gunSVG(look);
}
$("#wardrobeBtn").onclick = () => { renderWardrobe(); modal("#lookModal"); };

applyCosmetics();

/* Installable on phones; cached shell keeps solo and hot seat playable offline. */
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
