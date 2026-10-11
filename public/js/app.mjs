/* Last Chamber client.
   Three drivers share one booth and one event animator:
   solo and hot seat run the engine locally, online plays against the server.
   The booth (3D, or the 2.5D fallback) shows the table; this file runs the
   game flow, the paper UI around it, sound, and the replay reel. */

import * as E from "/shared/engine.mjs";
import * as W from "./world.mjs";
import qrcode from "/vendor/qrcode.mjs";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const delay = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ICON = { peek: "i-peek", eject: "i-eject", spin: "i-spin", shield: "i-shield",
               flask: "i-flask", double: "i-double", cuffs: "i-cuffs" };

/* ---------------- persistent settings ---------------- */
const ls = {
  get(k, d) { try { const v = localStorage.getItem("lc." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("lc." + k, JSON.stringify(v)); } catch {} }
};
const store = {
  get games() { return +ls.get("games", 0) || 0; }, set games(v) { ls.set("games", v); },
  get awning() { return ls.get("awning", "teal"); }, set awning(v) { ls.set("awning", v); },
  get streamer() { return !!ls.get("streamer", false); }, set streamer(v) { ls.set("streamer", !!v); },
  get quality() { return ls.get("quality", "auto"); }, set quality(v) { ls.set("quality", v); },
  get motion() { return ls.get("motion", "system"); }, set motion(v) { ls.set("motion", v); },
  get volume() { const v = ls.get("volume", 80); return typeof v === "number" ? v : 80; }, set volume(v) { ls.set("volume", v); },
  get look() {
    let l = ls.get("look2", null);
    /* a first-time player starts with their own paint job, not everyone's default */
    if (!l) { l = W.seededLook(this.name); ls.set("look2", l); }
    return W.cleanLook(l);
  },
  set look(v) { ls.set("look2", W.cleanLook(v)); },
  get name() {
    let n = ls.get("name", "");
    if (typeof n !== "string" || !n.trim()) { n = W.carnivalName(); ls.set("name", n); }
    return n;
  },
  set name(v) { ls.set("name", String(v).slice(0, 16)); },
  get rules() { return { lives: 3, itemsPerDeal: 2, heat: 1, ...ls.get("rules", {}) }; }, set rules(v) { ls.set("rules", v); }
};
/* first visit: legacy games count carries over */
try { const old = localStorage.getItem("lc.games"); if (old && !isNaN(+old)) store.games = +old; } catch {}
const params = new URLSearchParams(location.search);
if (params.has("stream")) store.streamer = params.get("stream") !== "0";

function applyMotion() {
  const sys = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const m = store.motion;
  document.documentElement.dataset.motion = m === "reduce" || (m === "system" && sys) ? "reduce" : "full";
}
applyMotion();
matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", applyMotion);
const reduced = () => document.documentElement.dataset.motion === "reduce";
document.body.classList.toggle("stream", store.streamer);

/* ---------------- audio ----------------
   Procedural WebAudio through one compressed bus. It also feeds a stream
   destination so a saved clip carries the booth's sound. */
const AC = window.AudioContext || window.webkitAudioContext;
let actx = null, bus = null, master = null, recDest = null;
function audio() {
  if (!actx) {
    actx = new AC();
    bus = actx.createDynamicsCompressor();
    bus.threshold.value = -18; bus.knee.value = 20; bus.ratio.value = 6;
    master = actx.createGain();
    master.gain.value = store.volume / 100;
    bus.connect(master).connect(actx.destination);
    if (actx.createMediaStreamDestination) { recDest = actx.createMediaStreamDestination(); master.connect(recDest); }
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function tone({ f = 440, type = "sine", g = .2, dur = .12, when = 0, fEnd = null }) {
  if (!actx) return;
  const a = actx, t0 = a.currentTime + when;
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
  if (!actx) return;
  const a = actx, t0 = a.currentTime + when;
  const len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = fc; f.Q.value = q;
  const gn = a.createGain(); gn.gain.value = g;
  s.connect(f).connect(gn).connect(bus);
  s.start(t0);
}
const sClick = () => { tone({ f: 1900, type: "square", g: .09, dur: .045 }); tone({ f: 620, type: "square", g: .05, dur: .04, when: .018 }); };
const sCock = () => { tone({ f: 460, type: "square", g: .07, dur: .035 }); tone({ f: 700, type: "square", g: .08, dur: .045, when: .09 }); };
function sHeart() {
  for (let i = 0; i < 2; i++) {
    const base = .15 + i * .58;
    tone({ f: 72, g: .5, dur: .16, when: base, fEnd: 46 });
    tone({ f: 64, g: .34, dur: .14, when: base + .2, fEnd: 42 });
  }
}
function sBang() { noiseHit({ dur: .38, g: .8, fc: 850 }); noiseHit({ dur: .1, g: .3, fc: 3200, type: "highpass" }); tone({ f: 130, g: .7, dur: .3, fEnd: 40 }); }
/* tin target slamming flat on its hinge */
function sClang() { tone({ f: 340, type: "triangle", g: .22, dur: .5, when: .05, fEnd: 300 }); tone({ f: 523, type: "triangle", g: .12, dur: .35, when: .05 }); noiseHit({ dur: .12, g: .25, fc: 2400, type: "bandpass", q: 2, when: .05 }); }
const sTink = () => { tone({ f: 2600 + rnd(500), type: "triangle", g: .08, dur: .06 }); };
const sFlip = () => { noiseHit({ dur: .04, g: .12, fc: 2600, type: "highpass" }); };
const sSlide = () => noiseHit({ dur: .42, g: .16, fc: 520, type: "bandpass", q: .9 });
const sPuff = () => noiseHit({ dur: .28, g: .1, fc: 1500, type: "highpass", when: .12 });
const sThud = () => { tone({ f: 115, g: .6, dur: .5, fEnd: 36 }); noiseHit({ dur: .22, g: .22, fc: 320 }); };
function sWin() {
  tone({ f: 392, type: "triangle", g: .16, dur: .2 });
  tone({ f: 523, type: "triangle", g: .16, dur: .2, when: .18 });
  tone({ f: 659, type: "triangle", g: .18, dur: .45, when: .36 });
}
function sSpin() { for (let i = 0; i < 8; i++) setTimeout(sClick, i * (45 + i * 10)); }

/* ---------------- the booth ---------------- */
let stage = null;
function wantsLite() {
  const q = store.quality;
  if (q === "lite") return true;
  if (q === "full") return false;
  const cv = document.createElement("canvas");
  const gl = cv.getContext("webgl2") || cv.getContext("webgl");
  if (!gl) return true;
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  return mem <= 2 || cores <= 2;
}
async function mountBooth() {
  const host = $("#booth");
  const awn = W.AWNINGS.find(a => a.id === store.awning) || W.AWNINGS[0];
  if (!wantsLite()) {
    try {
      const { createBooth } = await import("./booth3d.mjs");
      stage = await createBooth(host, { awning: awn.ink });
    } catch (err) {
      console.warn("3D booth unavailable, using the lite booth", err);
      stage = null;
    }
  }
  if (!stage) {
    const { createBooth2D } = await import("./booth2d.mjs");
    stage = await createBooth2D(host, { awning: awn.ink });
  }
  stage.on("tink", sTink);
  stage.on("flip", sFlip);
  stage.onFrame(placeHits);
  $("#loading").classList.add("done");
}

/* ---------------- ui state ---------------- */
const ui = {
  mode: null,          /* solo | hot | online */
  st: null, pub: null,
  you: 0, humans: [0],
  ws: null, host: false, spectating: false, code: null,
  queue: [], anim: false, canAct: false,
  pendingState: null, pendingPeek: null,
  botTimer: 0, counted: false, gunAt: null,
  reel: null, roster: []
};
window.LC = ui;

const nameOf = pid => ui.pub?.players.find(p => p.id === pid)?.name || "?";
const isYou = pid => pid === ui.you && !ui.spectating;
const N = pid => isYou(pid) ? "You" : esc(nameOf(pid));
const No = pid => isYou(pid) ? "you" : esc(nameOf(pid));
const Np = pid => isYou(pid) ? "Your" : esc(nameOf(pid)) + "'s";
const V = (pid, third, second) => isYou(pid) ? second : third;
const lookOf = p => p?.look ? W.cleanLook(p.look) : W.seededLook(p?.name || "house");

function show(id) {
  $$(".screen").forEach(s => s.classList.add("hidden"));
  $(id).classList.remove("hidden");
  syncInset();
}
/* on wide screens the ticket tape covers the right edge: centre the booth in what's left */
function syncInset() {
  if (!stage) return;
  if (!$("#menu").classList.contains("hidden")) {
    const r = $(".board").getBoundingClientRect();
    stage.setInset(0, innerWidth < innerHeight ? innerHeight - r.top + 8 : 0);
    return;
  }
  if (!$("#lobby").classList.contains("hidden")) {
    const r = $(".booth-window").getBoundingClientRect();
    if (r.left > innerWidth * .35) stage.setInset(innerWidth - r.left + 16, 0);
    else stage.setInset(0, innerHeight - r.top + 12);
    return;
  }
  const tape = $("#tape");
  const inGame = !$("#game").classList.contains("hidden");
  if (!inGame) { stage.setInset(0, 0); return; }
  /* wide: the tape strip sits on the right; narrow: the counter UI owns the bottom */
  if (getComputedStyle(tape).position === "fixed" && !tape.classList.contains("open")) stage.setInset(tape.offsetWidth + 14, 0);
  else stage.setInset(0, Math.max(0, innerHeight - tape.getBoundingClientRect().top + 8));
}
/* the paint shop docks beside (or under) the preview target: keep the target in view */
function paintInset() {
  const d = $("#paintDlg");
  if (!d.open) { syncInset(); return; }
  const r = d.getBoundingClientRect();
  if (r.left > innerWidth * .35) stage.setInset(innerWidth - r.left + 16, 0);
  else stage.setInset(0, innerHeight - r.top + 12);
}
addEventListener("resize", () => { if ($("#paintDlg").open) paintInset(); else syncInset(); });
function closeAll() { $$("dialog[open]").forEach(d => d.close()); }

/* ---------------- ledger: the ticket tape ---------------- */
function log(html, cls = "") {
  const p = document.createElement("p");
  if (cls) p.className = cls;
  p.innerHTML = html;
  const roll = $("#ledger");
  roll.appendChild(p);
  while (roll.childElementCount > 120) roll.firstElementChild.remove();
  roll.scrollTop = roll.scrollHeight;
  $("#tapeLatest").innerHTML = html;
  announce(p.textContent);
}
let srTimer = 0;
function announce(text) {
  const sr = $("#sr");
  clearTimeout(srTimer);
  const line = document.createElement("p");
  line.textContent = text;
  sr.appendChild(line);
  while (sr.childElementCount > 4) sr.firstElementChild.remove();
  srTimer = setTimeout(() => { sr.innerHTML = ""; }, 8000);
}
$("#tapeToggle").onclick = () => {
  const tape = $("#tape"), open = !tape.classList.contains("open");
  tape.classList.toggle("open", open);
  $("#tapeToggle").setAttribute("aria-expanded", open);
  if (open) { const r = $("#ledger"); r.scrollTop = r.scrollHeight; }
};

/* ---------------- hit buttons over the tin targets ---------------- */
function buildHits() {
  const layer = $("#hit");
  layer.innerHTML = "";
  if (!ui.pub) return;
  for (const p of ui.pub.players) {
    const b = document.createElement("button");
    b.className = "tbtn";
    b.id = "hit" + p.id;
    b.tabIndex = -1;
    b.innerHTML = `<span class="youmark" aria-hidden="true">You</span><span class="aim"><svg class="i"><use href="#i-sight"/></svg><span class="charge" aria-hidden="true"></span><span class="aim-t"></span></span><span class="ttag"></span>`;
    wireTarget(b, p.id);
    layer.appendChild(b);
  }
  renderTags();
}
/* ---------------- hold to aim, let go to pull ----------------
   A press swings the gun onto the target and cocks it; holding until the ring
   fills arms it; letting go pulls. Sliding off backs out. Keyboard: hold Enter or
   Space. Assistive tech that sends a plain click aims first, then pulls. */
const HOLD_MS = 320;
let aimS = null, pressing = false;
const idleAimText = pid => `Hold to aim at ${isYou(pid) ? "yourself" : ui.pub?.players.find(q => q.id === pid)?.name}`;
/* arming is measured from the input events' own timestamps, so a busy page can't turn a tap into a pull */
function startAim(tid, el, at = performance.now()) {
  if (!ui.canAct || aimS?.tid === tid) return;
  endAim();
  if (ui.selItem != null) { ui.selItem = null; renderHand(); }
  aimS = { tid, el, armed: false, t0: at };
  el.style.setProperty("--hold", HOLD_MS + "ms");
  el.classList.add("aiming");
  el.querySelector(".aim-t").textContent = `Aiming at ${isYou(tid) ? "yourself" : ui.pub.players.find(q => q.id === tid)?.name}`;
  stage.preview(tid);
  sCock();
  aimS.timer = setTimeout(() => {
    if (!aimS || aimS.tid !== tid) return;
    aimS.armed = true;
    el.classList.add("armed");
    el.querySelector(".aim-t").textContent = "Let go to pull";
  }, HOLD_MS);
}
function endAim() {
  if (!aimS) return;
  clearTimeout(aimS.timer);
  aimS.el.classList.remove("aiming", "armed");
  aimS.el.querySelector(".aim-t").textContent = idleAimText(aimS.tid);
  aimS = null;
}
function releaseAim(at = performance.now()) {
  if (!aimS) return;
  const { tid, t0 } = aimS;
  endAim();
  if (at - t0 >= HOLD_MS) humanShoot(tid);
  else { stage.unpreview(); $("#hint").textContent = "Keep holding until the ring fills, then let go."; }
}
function cancelAim() { if (!aimS) return; endAim(); stage.unpreview(); }
function wireTarget(b, pid) {
  b.addEventListener("pointerdown", e => {
    if (e.button > 0 || !ui.canAct || !b.classList.contains("targetable")) return;
    e.preventDefault();
    try { b.releasePointerCapture(e.pointerId); } catch {}
    pressing = true;
    startAim(pid, b, e.timeStamp);
  });
  /* sliding the finger along the rail re-aims */
  b.addEventListener("pointerenter", e => { if (pressing && b.classList.contains("targetable")) startAim(pid, b, e.timeStamp); });
  b.addEventListener("pointerleave", () => { if (aimS?.el === b) cancelAim(); });
  b.addEventListener("pointerup", e => { if (aimS?.el === b) releaseAim(e.timeStamp); });
  b.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!e.repeat) startAim(pid, b, e.timeStamp); }
    else if (e.key === "Escape" && aimS) { e.preventDefault(); cancelAim(); }
  });
  b.addEventListener("keyup", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); releaseAim(e.timeStamp); } });
  b.addEventListener("click", e => {
    if (e.detail !== 0 || !ui.canAct) return;
    if (ui.a11yAim === pid) { ui.a11yAim = null; humanShoot(pid); return; }
    ui.a11yAim = pid;
    stage.preview(pid);
    announce(`Aimed at ${isYou(pid) ? "yourself" : ui.pub.players.find(q => q.id === pid)?.name}. Activate again to pull, or press Escape to back out.`);
  });
  b.addEventListener("contextmenu", e => e.preventDefault());
}
addEventListener("pointerup", () => { pressing = false; cancelAim(); });
addEventListener("pointercancel", () => { pressing = false; cancelAim(); });

/* ---------------- first-turn coach mark ---------------- */
let coachOn = false;
function maybeCoach() {
  if (coachOn || ls.get("taught", false) || ui.spectating) return;
  coachOn = true;
  $("#coach").classList.remove("hidden");
  placeCoach();
}
function endCoach(learned) {
  if (!coachOn) return;
  coachOn = false;
  $("#coach").classList.add("hidden");
  if (learned) ls.set("taught", true);
}
function placeCoach() {
  const els = $$(".tbtn.targetable");
  if (!els.length) return;
  const rs = els.map(e => e.getBoundingClientRect());
  const x0 = Math.min(...rs.map(q => q.left)) - 14, x1 = Math.max(...rs.map(q => q.right)) + 14;
  const y0 = Math.min(...rs.map(q => q.top)) - 44, y1 = Math.max(...rs.map(q => q.bottom)) + 36;
  Object.assign($("#coachSpot").style, { left: x0 + "px", top: y0 + "px", width: (x1 - x0) + "px", height: (y1 - y0) + "px" });
  const opp = els.find(e => !e.classList.contains("is-you")) || els[0];
  const o = opp.getBoundingClientRect();
  Object.assign($("#coachHand").style, { left: (o.left + o.width / 2) + "px", top: (o.top + o.height * .42) + "px" });
  const card = $("#coachCard"), ch = card.offsetHeight;
  card.style.top = (y1 + 14 + ch < innerHeight - 12 ? y1 + 14 : Math.max(12, y0 - ch - 14)) + "px";
}
$("#coachSkip").onclick = () => endCoach(true);

function placeHits() {
  if (!ui.pub || !stage) return;
  for (const p of ui.pub.players) {
    const el = document.getElementById("hit" + p.id);
    const box = stage.screenBox(p.id);
    if (!el || !box) continue;
    /* whole pixels, and only when the target really moved */
    const key = [box.x, box.y, box.w, box.h].map(v => Math.round(v / 2) * 2).join(",");
    if (el.dataset.box === key) continue;
    el.dataset.box = key;
    const [x, y, w, h] = key.split(",");
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    const mid = +x + w / 2;
    el.classList.toggle("edge-r", mid > innerWidth - 100);
    el.classList.toggle("edge-l", mid < 100);
  }
  if (coachOn) placeCoach();
}
function renderTags() {
  if (!ui.pub) return;
  for (const p of ui.pub.players) {
    const el = document.getElementById("hit" + p.id);
    if (!el) continue;
    const tag = el.querySelector(".ttag");
    el.classList.toggle("is-you", isYou(p.id) && p.alive);
    const icons = [];
    if (!p.alive) icons.push(`<span class="out">Out</span>`);
    if (p.shield) icons.push(`<svg class="i state" aria-hidden="true"><use href="#i-shield"/></svg>`);
    if (p.cuffed) icons.push(`<svg class="i state" aria-hidden="true"><use href="#i-cuffs"/></svg>`);
    if (!isYou(p.id)) {
      /* a crowded phone rail gets one ticket with the count; the button's label lists them */
      if (innerWidth < 761 && ui.pub.players.length > 3) {
        if (p.items.length) icons.push(`<span class="tcount" aria-hidden="true"><svg class="i"><use href="#i-tape"/></svg>${p.items.length}</span>`);
      } else p.items.forEach(k => icons.push(`<svg class="i" aria-hidden="true"><use href="#${ICON[k]}"/></svg>`));
    }
    tag.innerHTML = icons.join("");
    const cap = ui.pub.rules?.lives ?? 3;
    const state = [p.alive ? `${p.lives} of ${cap} lives` : "out",
                   p.shield ? "shielded" : "", p.cuffed ? "cuffed" : "",
                   !isYou(p.id) && p.items.length ? "holding " + p.items.map(k => E.ITEMS[k].name).join(", ") : ""]
      .filter(Boolean).join(", ");
    el.setAttribute("aria-label", `${isYou(p.id) ? "You" : p.name}: ${state}`);
  }
}
function setTargets(on) {
  if (!ui.pub) return;
  for (const p of ui.pub.players) {
    const el = document.getElementById("hit" + p.id);
    if (!el) continue;
    const live = on && p.alive;
    el.classList.toggle("targetable", live);
    el.tabIndex = live ? 0 : -1;
    el.disabled = !live;
    el.querySelector(".aim-t").textContent = idleAimText(p.id);
    if (live) el.setAttribute("aria-label", isYou(p.id) ? "Aim at yourself" : `Aim at ${p.name}, ${p.lives} lives`);
  }
  if (!on) renderTags();
}

/* ---------------- render ---------------- */
function renderState() {
  const pub = ui.pub;
  if (!pub || !stage) return;
  stage.update(pub);
  stage.counts(pub.round, pub.live, pub.blank);
  syncCounts();
  renderTags();
  renderHand();
}
function syncCounts() {
  const pub = ui.pub;
  $("#counts").innerHTML = pub?.round ? `<span class="live">${pub.live} live</span> · ${pub.blank} blank left` : "";
}
function renderHand() {
  const wrap = $("#hand");
  wrap.innerHTML = "";
  const me = ui.spectating || ui.you == null ? null : ui.pub?.players.find(p => p.id === ui.you);
  if (!me) return;
  me.items.forEach((k, idx) => {
    const b = document.createElement("button");
    b.className = "item";
    b.dataset.tip = E.ITEMS[k].desc;
    b.setAttribute("aria-label", `${E.ITEMS[k].name}: ${E.ITEMS[k].desc}`);
    b.innerHTML = `<svg class="i" aria-hidden="true"><use href="#${ICON[k]}"/></svg>${E.ITEMS[k].name}`;
    b.disabled = !ui.canAct;
    b.classList.toggle("selected", ui.selItem === idx);
    b.setAttribute("aria-pressed", ui.selItem === idx);
    b.addEventListener("click", () => itemTap(idx));
    wrap.appendChild(b);
  });
}
const TURN_HINT = "A blank on yourself keeps the gun in your hand.";
function itemTap(idx) {
  if (!ui.canAct) return;
  if (ui.selItem === idx) { ui.selItem = null; humanItem(idx); return; }
  cancelAim();
  ui.selItem = idx;
  renderHand();
  const k = ui.pub.players.find(p => p.id === ui.you)?.items[idx];
  if (!k) return;
  $("#hint").textContent = `${E.ITEMS[k].name}: ${E.ITEMS[k].desc}. Tap it again to use it.`;
  announce(`${E.ITEMS[k].name}: ${E.ITEMS[k].desc}. Activate again to use it.`);
}
function setPrompt(html, hint = "") {
  $("#prompt").innerHTML = html || "&nbsp;";
  $("#hint").textContent = hint;
}
function stamp(kind) {
  const s = $("#stamp");
  s.className = "stamp";
  void s.offsetWidth;
  s.textContent = kind === "bang" ? "BANG" : "click";
  s.className = "stamp " + kind;
}
function flash() {
  if (reduced()) return;
  $("#flash").animate([{ opacity: .32 }, { opacity: 0 }], { duration: 110, easing: "ease-out" });
}

/* ---------------- the replay record ----------------
   Every pull is kept with the table as it stood, so the reel can run the
   gun's track back exactly. */
function snapPlayers(pub) {
  return pub.players.map(p => ({ id: p.id, name: p.name, look: p.look, lives: p.lives, alive: p.alive,
                                 shield: p.shield, cuffed: p.cuffed, items: [] }));
}
function newReel(pub) {
  ui.reel = { start: snapPlayers(pub), cap: pub.rules?.lives ?? 3, moments: [], stats: { live: 0, blank: 0, selfKeep: 0 }, holder: null };
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
      if (ui.st) ui.pub = E.pub(ui.st);
      log(`Round ${ev.round}. The barker racks <b>${ev.live} live</b> and <b>${ev.blank} blank</b>, then spins the cylinder.`, "sys");
      sSpin();
      stage.round(ev.round, ev.live, ev.blank);
      syncCounts(); renderTags(); renderHand();
      await (ui.fast ? delay(200) : stage.beat("rack", reduced() ? 400 : 1100));
      break;
    }
    case "turn": {
      pub.turn = ev.pid;
      const p = pub.players.find(q => q.id === ev.pid);
      stage.setActive(ev.pid);
      renderTags();
      if (ui.gunAt !== ev.pid) {
        if (ui.gunAt != null) sSlide();
        ui.gunAt = ev.pid;
        await stage.giveGun(ev.pid, lookOf(p), true);
      }
      /* a beat on whoever holds the gun, unless it's you and the controls are about to arrive */
      if (!isYou(ev.pid) && !ui.fast) await stage.beat(ev.pid, 650);
      if (ui.reel) ui.reel.holder = ev.pid;
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
    case "item": await animateItem(ev); break;
    case "shot": {
      const t = pub.players.find(q => q.id === ev.tid);
      if (!t) break;
      const before = snapPlayers(pub);
      const self = ev.pid === ev.tid;
      const aimLine = self
        ? `<b>${N(ev.pid)}</b> ${V(ev.pid, "pulls", "pull")} on ${V(ev.pid, "themself", "yourself")}.`
        : `<b>${N(ev.pid)}</b> ${V(ev.pid, "pulls", "pull")} on <b>${No(ev.tid)}</b>.`;
      setPrompt(aimLine, "");
      log(aimLine);
      sCock(); sHeart();
      /* you already aimed with the hold; everyone else gets the full swing */
      await stage.aim(ev.pid, ev.tid, ui.fast ? 250 : isYou(ev.pid) ? 600 : undefined);
      const firing = stage.fire(ev);
      if (ev.live) {
        pub.live = Math.max(0, pub.live - 1);
        sBang(); flash(); stamp("bang");
        if (!ev.shielded) setTimeout(sClang, 60);
        if (ev.shielded) {
          t.shield = false;
          log(`<b>Live.</b> ${Np(t.id)} shield takes the hit.`, "hit");
        } else {
          t.lives = Math.max(0, t.lives - ev.dmg);
          log(`<b>Live.</b> ${N(t.id)} ${V(t.id, "goes", "go")} down and ${V(t.id, "loses", "lose")} ${ev.dmg === 2 ? "two lives" : "a life"}.`, "hit");
          if (ev.killed) {
            t.alive = false;
            if (isYou(t.id) && ui.mode !== "hot" && !ui.spectating) ui.outPending = true;
            setTimeout(sThud, 380);
            log(`<b>${N(t.id)}</b> ${V(t.id, "stays", "stay")} down. Out for the night.`, "hit");
          }
        }
        if (ui.reel) ui.reel.stats.live++;
      } else {
        pub.blank = Math.max(0, pub.blank - 1);
        sClick(); sPuff(); stamp("click");
        log(`Click. Blank.`, "safe");
        if (ev.keep) log(`<b>${N(ev.pid)}</b> ${V(ev.pid, "keeps", "keep")} the gun.`, "sys");
        if (ui.reel) { ui.reel.stats.blank++; if (ev.keep) ui.reel.stats.selfKeep++; }
      }
      stage.update(pub);
      stage.counts(pub.round, pub.live, pub.blank);
      syncCounts();
      renderTags();
      if (ui.reel) ui.reel.moments.push({ ev, round: pub.round, before, after: snapPlayers(pub) });
      await firing;
      /* a knockout gets its own beat */
      if (ev.killed && !ui.fast) await stage.beat(ev.tid, 900);
      break;
    }
    case "end": await delay(300); break;
  }
}

async function animateItem(ev) {
  const p = ui.pub.players.find(q => q.id === ev.pid);
  if (p && ui.st) ui.pub = E.pub(ui.st);
  else if (p) {
    const i = p.items.indexOf(ev.item);
    if (i >= 0) p.items.splice(i, 1);
  }
  const n = `<b>${N(ev.pid)}</b>`;
  const v = (third, second) => V(ev.pid, third, second);
  switch (ev.item) {
    case "peek":
      log(`${n} ${v("steals", "steal")} a look at the next shell.`);
      if (isYou(ev.pid) && ui.pendingPeek != null) { await showPeek(ui.pendingPeek); ui.pendingPeek = null; }
      break;
    case "eject": {
      const k = ev.live ? "live" : "blank";
      ui.pub[k] = Math.max(0, ui.pub[k] - 1);
      sTink(); stage.eject(ev.live);
      log(`${n} ${v("ejects", "eject")} the next shell. It was ${ev.live ? "<b>live</b>" : "a blank"}.`, ev.live ? "hit" : "safe");
      break;
    }
    case "spin": sSpin(); stage.spin(); log(`${n} ${v("gives", "give")} the cylinder a spin.`); break;
    case "shield": if (p) p.shield = true; log(`${n} ${v("raises", "raise")} a tin shield.`); break;
    case "flask":
      if (p && ev.gained) p.lives = Math.min(ui.pub.rules?.lives ?? 3, p.lives + 1);
      log(ev.gained ? `${n} ${v("takes", "take")} a pull from the flask. One life back.` : `${n} ${v("drinks", "drink")}. Nothing to gain.`, ev.gained ? "safe" : "");
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
  await delay(650);
}

const SHELL_SVG = live => live
  ? `<svg viewBox="0 0 54 110" aria-hidden="true"><rect x="9" y="80" width="36" height="22" rx="3" fill="#b9893a" stroke="#14100d" stroke-width="2"/><path d="M11 80V26a16 16 0 0 1 32 0v54z" fill="#b8321f" stroke="#14100d" stroke-width="2"/><rect x="11" y="44" width="32" height="6" fill="#14100d"/><rect x="11" y="62" width="32" height="6" fill="#14100d"/></svg>`
  : `<svg viewBox="0 0 54 110" aria-hidden="true"><rect x="9" y="80" width="36" height="22" rx="3" fill="#b9893a" stroke="#14100d" stroke-width="2"/><path d="M11 80V18l8 6 8-6 8 6 8-6v62z" fill="#f2dfb4" stroke="#14100d" stroke-width="2"/><circle cx="27" cy="52" r="7" fill="none" stroke="#14100d" stroke-width="2"/></svg>`;
function showPeek(live) {
  return new Promise(res => {
    const box = $("#peekShell"), dlg = $("#peekDlg");
    const reveal = () => { box.className = "peek-shell " + (live ? "live" : "blank"); box.innerHTML = SHELL_SVG(live) + `<strong>${live ? "Live" : "Blank"}</strong>`; };
    const hide = () => { box.className = "peek-shell hidden-res"; box.innerHTML = `<strong>· · ·</strong>`; };
    const hold = $("#peekHold");
    if (store.streamer) {
      hide();
      hold.classList.remove("hidden");
      hold.onpointerdown = reveal;
      hold.onpointerup = hold.onpointerleave = hold.onpointercancel = hide;
      hold.onkeydown = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); reveal(); } };
      hold.onkeyup = hide;
    } else { hold.classList.add("hidden"); reveal(); }
    dlg.showModal();
    $("#peekOk").onclick = () => { dlg.close(); res(); };
    dlg.oncancel = e => { e.preventDefault(); };
  });
}

/* ---------------- flow control ---------------- */
function afterQueue() {
  if (ui.pendingState) { ui.pub = ui.pendingState; ui.pendingState = null; }
  else if (ui.st) ui.pub = E.pub(ui.st);
  const pub = ui.pub;
  if (!pub) return;
  renderState();

  if (pub.over) { ui.outPending = false; gameOver(); return; }
  if (ui.outPending) {
    ui.outPending = false;
    $("#outAgain").textContent = ui.mode === "online" ? "Leave the table" : "Deal again";
    $("#outDlg").showModal();
  }
  const cur = pub.players.find(p => p.id === pub.turn);
  if (!cur) return;

  if (ui.mode === "online") {
    if (!ui.spectating && ui.you != null && cur.id === ui.you) enableInput();
    else waitPrompt(cur);
    return;
  }
  if (cur.bot) {
    waitPrompt(cur);
    clearTimeout(ui.botTimer);
    ui.botTimer = setTimeout(botStep, ui.fast ? 200 : 1500 + rnd(900));
  } else if (ui.mode === "hot" && cur.id !== ui.you) {
    setPrompt("&nbsp;");
    setTargets(false);
    ui.canAct = false; renderHand();
    stage.setBulbs("steady");
    $("#passTitle").textContent = cur.name;
    const dlg = $("#passDlg");
    dlg.showModal();
    dlg.oncancel = e => e.preventDefault();
    $("#passOk").onclick = () => {
      dlg.close();
      ui.you = cur.id;
      renderState();
      enableInput();
    };
  } else enableInput();
}
function enableInput() {
  ui.canAct = true;
  ui.selItem = null; ui.a11yAim = null;
  const me = ui.pub.players.find(p => p.id === ui.you);
  setPrompt(`<b>Your turn${ui.mode === "hot" && me ? ", " + esc(me.name) : ""}.</b> Hold a target, let go to pull.`, TURN_HINT);
  $("#stub").classList.remove("yours"); void $("#stub").offsetWidth; $("#stub").classList.add("yours");
  stage.setBulbs("chase");
  stage.sweep(true);
  setTargets(true);
  renderHand();
  announce(`Your turn. Hold a target to aim, let go to pull. ${ui.pub.live} live and ${ui.pub.blank} blank left.`);
  maybeCoach();
  const first = $(".tbtn.targetable");
  if (first && document.activeElement === document.body) first.focus({ preventScroll: true });
}
function waitPrompt(cur) {
  ui.canAct = false;
  cancelAim();
  stage.sweep(false);
  stage.setBulbs("steady");
  setPrompt(cur.bot ? `<b>${esc(cur.name)}</b> is choosing a target.` : `Waiting on <b>${esc(cur.name)}</b>.`,
    ui.spectating ? "You're watching this table." : "");
  setTargets(false);
  renderHand();
}
function lockInput() {
  ui.canAct = false; ui.selItem = null; ui.a11yAim = null;
  cancelAim();
  stage.sweep(false);
  stage.setBulbs("steady");
  setTargets(false);
  renderHand();
}

function botStep() {
  const st = ui.st;
  if (!st || st.over) return;
  const cur = st.players[st.turn];
  if (!cur.bot) return;
  const mv = E.botMove(st);
  enqueue(mv.a === "item" ? E.useItem(st, cur.id, mv.idx).ev : E.shoot(st, cur.id, mv.tid));
}
function humanShoot(tid) {
  if (!ui.canAct) return;
  endCoach(true);
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

$("#outWatch").onclick = () => $("#outDlg").close();
$("#outFast").onclick = () => {
  ui.fast = true;
  $("#outDlg").close();
  clearTimeout(ui.botTimer);
  if (!ui.anim && ui.st && !ui.st.over && ui.st.players[ui.st.turn]?.bot) ui.botTimer = setTimeout(botStep, 200);
};
$("#outAgain").onclick = () => {
  $("#outDlg").close();
  if (ui.mode === "online") { leaveTable(); return; }
  const defs = ui.st.players.map(p => ({ name: p.name, bot: p.bot, look: p.look }));
  startLocal(defs, ui.humans, store.rules);
};

/* ---------------- starting a table ---------------- */
const WORD = ["", "One", "Two", "Three", "Four", "Five"];
const livesLine = (n, lives) => `${n} targets on the rail. ${WORD[lives] || lives} ${lives === 1 ? "life" : "lives"} each.`;

function enterTable(pub) {
  ui.pub = pub;
  ui.gunAt = null;
  ui.counted = false;
  ui.fast = false; ui.outPending = false;
  $("#ledger").innerHTML = "";
  $("#tape").classList.remove("open");
  closeAll();
  show("#game");
  stage.setMode("play");
  stage.setPlayers(pub.players, pub.rules?.lives ?? 3);
  stage.setActive(null);
  buildHits();
  renderState();
  newReel(pub);
  $("#hudCode").classList.toggle("hidden", ui.mode !== "online");
  $("#watchChip").classList.toggle("hidden", !ui.spectating);
  $("#chatForm").classList.toggle("hidden", ui.mode !== "online");
  syncDock();
}
function startLocal(defs, humans, rules) {
  clearTimeout(ui.botTimer);
  ui.queue.length = 0; ui.anim = false;
  ui.st = E.newGame(defs, rules);
  ui.humans = humans;
  ui.you = humans[0];
  ui.spectating = false;
  enterTable(E.pub(ui.st));
  log(livesLine(defs.length, ui.st.rules.lives), "sys");
  const ev = [];
  E.beginTurn(ui.st, ev);
  setTimeout(() => enqueue(ev), 0);
}

/* ---------------- small components ---------------- */
function stepper(el, { min, max, value, label, onChange }) {
  el.classList.add("stepper");
  el.innerHTML = `<button type="button" aria-label="Fewer ${label}">&minus;</button><input type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}" aria-label="${label}"><button type="button" aria-label="More ${label}">+</button>`;
  const [dn, inp, up] = el.children;
  const set = v => {
    v = Math.max(min, Math.min(max, Math.round(+v)));
    if (Number.isNaN(v)) v = min;
    inp.value = v; dn.disabled = v <= min; up.disabled = v >= max;
    onChange?.(v);
  };
  dn.onclick = () => set(+inp.value - 1);
  up.onclick = () => set(+inp.value + 1);
  inp.onchange = () => set(inp.value);
  set(value);
  return { get value() { return +inp.value; }, set, setMax(m) { max = m; inp.max = m; set(inp.value); } };
}
function tiles(el, name, options, value, onChange) {
  el.innerHTML = "";
  options.forEach(o => {
    const lab = document.createElement("label");
    lab.className = "tile";
    lab.innerHTML = `<input type="radio" name="${name}" value="${o.value}" ${o.value === value ? "checked" : ""} ${o.disabled ? "disabled" : ""}><span>${o.label}${o.sub ? `<small>${o.sub}</small>` : ""}</span>`;
    lab.querySelector("input").onchange = () => onChange(o.value);
    el.appendChild(lab);
  });
}
function rulesBlock(el) {
  const r = store.rules;
  el.innerHTML = `
    <div class="field-row"><span class="field-label" id="rLivesL">Lives each</span><div id="rLives" aria-labelledby="rLivesL"></div></div>
    <div class="field-row"><span class="field-label" id="rItemsL">Items each round</span><div id="rItems" aria-labelledby="rItemsL"></div></div>
    <fieldset class="choice"><legend>Chamber heat</legend><div class="tiles" id="rHeat"></div></fieldset>`;
  const save = () => { store.rules = r; };
  stepper(el.querySelector("#rLives"), { min: 2, max: 5, value: r.lives, label: "lives", onChange: v => { r.lives = v; save(); } });
  stepper(el.querySelector("#rItems"), { min: 0, max: 3, value: r.itemsPerDeal, label: "items", onChange: v => { r.itemsPerDeal = v; save(); } });
  tiles(el.querySelector("#rHeat"), "heat", [
    { value: 0, label: "Calm", sub: "fewer live" }, { value: 1, label: "Standard" }, { value: 2, label: "Reckless", sub: "more live" }
  ], r.heat, v => { r.heat = v; save(); });
}
function nameField(id, value, label = "Your name at the table") {
  return `<div class="field"><label for="${id}">${label}</label><div class="name-row">
    <input id="${id}" maxlength="16" spellcheck="false" autocomplete="nickname" value="${esc(value)}">
    <button type="button" class="icon-btn" data-dice="${id}" aria-label="Roll a new name" data-tip="Roll a new name"><svg class="i"><use href="#i-dice"/></svg></button></div></div>`;
}
document.addEventListener("click", e => {
  const d = e.target.closest("[data-dice]");
  if (!d) return;
  const inp = document.getElementById(d.dataset.dice);
  const taken = $$("[data-dice]").map(b => document.getElementById(b.dataset.dice)?.value);
  inp.value = W.carnivalName(taken);
  inp.dispatchEvent(new Event("input"));
});
const nameOrRoll = (v, taken = []) => (v || "").trim().slice(0, 16) || W.carnivalName(taken);

/* ---------------- setup sheets ---------------- */
function openSetup(kind) {
  const dlg = $("#setup"), f = $("#setupFields");
  $("#setupErr").textContent = "";
  const titles = { solo: "Solo", hot: "Hot seat", online: "Open a table" };
  $("#setupTitle").textContent = titles[kind];
  $("#setupGo").textContent = kind === "online" ? "Open the table" : "Deal";
  if (kind === "solo") {
    f.innerHTML = nameField("sName", store.name) +
      `<div class="field-row"><span class="field-label" id="sBotsL">House players</span><div id="sBots" aria-labelledby="sBotsL"></div></div><div class="rules" id="sRules"></div>`;
    const bots = stepper(f.querySelector("#sBots"), { min: 1, max: 5, value: ls.get("soloBots", 3), label: "house players", onChange: v => ls.set("soloBots", v) });
    rulesBlock(f.querySelector("#sRules"));
    dlg.onclose = () => {
      if (dlg.returnValue !== "go") return;
      audio();
      const name = nameOrRoll($("#sName").value);
      store.name = name;
      ui.mode = "solo";
      const house = [...E.BOT_NAMES].filter(n => n !== name).sort(() => Math.random() - .5).slice(0, bots.value);
      startLocal([{ name, look: store.look }, ...house.map(n => ({ name: n, bot: true }))], [0], store.rules);
    };
  } else if (kind === "hot") {
    f.innerHTML = `<div class="field-row"><span class="field-label" id="hCountL">Players at the device</span><div id="hCount" aria-labelledby="hCountL"></div></div>
      <div id="hNames"></div>
      <div class="field-row"><span class="field-label" id="hBotsL">House players</span><div id="hBots" aria-labelledby="hBotsL"></div></div><div class="rules" id="hRules"></div>`;
    let names = ls.get("hotNames", []);
    const drawNames = n => {
      const box = f.querySelector("#hNames");
      const cur = $$("#hNames input").map(i => i.value);
      if (cur.length) names = cur;
      box.innerHTML = Array.from({ length: n }, (_, i) =>
        nameField("hName" + i, names[i] || (i === 0 ? store.name : W.carnivalName([store.name, ...names])), `Player ${i + 1}`)).join("");
    };
    let botsSt;
    const count = stepper(f.querySelector("#hCount"), { min: 2, max: 6, value: ls.get("hotCount", 2), label: "players",
      onChange: v => { ls.set("hotCount", v); drawNames(v); botsSt?.setMax(6 - v); } });
    botsSt = stepper(f.querySelector("#hBots"), { min: 0, max: 6 - count.value, value: Math.min(ls.get("hotBots", 0), 6 - count.value), label: "house players", onChange: v => ls.set("hotBots", v) });
    rulesBlock(f.querySelector("#hRules"));
    dlg.onclose = () => {
      if (dlg.returnValue !== "go") return;
      audio();
      const taken = [];
      const ns = $$("#hNames input").map(i => { const n = nameOrRoll(i.value, taken); taken.push(n); return n; });
      ls.set("hotNames", ns);
      store.name = ns[0];
      ui.mode = "hot";
      const house = [...E.BOT_NAMES].filter(n => !ns.includes(n)).sort(() => Math.random() - .5).slice(0, botsSt.value);
      startLocal([...ns.map((n, i) => ({ name: n, look: i === 0 ? store.look : null })), ...house.map(n => ({ name: n, bot: true }))],
        ns.map((_, i) => i), store.rules);
    };
  } else {
    f.innerHTML = nameField("oName", store.name) + `<p class="sheet-lede">You get a four-letter code and an invite link. Friends tap the link and they're in.</p>`;
    dlg.onclose = () => {
      if (dlg.returnValue !== "go") return;
      audio();
      const name = nameOrRoll($("#oName").value);
      store.name = name;
      ui.mode = "online"; ui.host = true;
      connect(() => ui.ws.send(JSON.stringify({ t: "create", name, look: store.look })));
    };
  }
  dlg.returnValue = "";
  dlg.showModal();
  dlg.querySelector("input")?.focus();
}
function openRules(then) {
  const d = $("#rulesDlg");
  d.returnValue = "";
  d.onclose = () => { ls.set("rulesSeen", true); then?.(); };
  d.showModal();
}
const rulesFirst = fn => () => ls.get("rulesSeen", false) ? fn() : openRules(fn);
$("#mSolo").onclick = rulesFirst(() => openSetup("solo"));
$("#mHot").onclick = rulesFirst(() => openSetup("hot"));
$("#mOnline").onclick = rulesFirst(() => openSetup("online"));
$("#rulesBtn").onclick = () => openRules();

/* ---------------- joining: code on the board, or a link ---------------- */
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
function openJoin(code) {
  const dlg = $("#joinDlg");
  $("#joinCodeShow").textContent = code;
  $("#joinName").value = store.name;
  $("#joinErr").textContent = "";
  $("#joinSpec").checked = false;
  dlg.returnValue = "";
  dlg.dataset.code = code;
  dlg.showModal();
  $("#joinGo").focus();
}
$("#joinDice").onclick = () => { $("#joinName").value = W.carnivalName([$("#joinName").value]); };
$("#joinDlg").addEventListener("close", () => {
  const dlg = $("#joinDlg");
  if (dlg.returnValue !== "go") { if (location.pathname !== "/") history.replaceState(null, "", "/"); return; }
  audio();
  const name = nameOrRoll($("#joinName").value);
  store.name = name;
  ui.mode = "online"; ui.host = false;
  const code = dlg.dataset.code;
  connect(() => ui.ws.send(JSON.stringify({ t: "join", code, name, look: store.look, spectate: $("#joinSpec").checked })));
});
$("#quickCode").addEventListener("input", e => {
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  e.target.value = v;
  $("#quickErr").textContent = "";
});
$("#quickJoin").onsubmit = e => {
  e.preventDefault();
  const code = $("#quickCode").value.toUpperCase();
  if (!CODE_RE.test(code)) {
    $("#quickErr").textContent = code.length !== 4 ? "Codes are four characters, like KQ7R." : "That code has a letter tables never use (I, O, 0 or 1).";
    $("#quickCode").focus();
    return;
  }
  openJoin(code);
};

/* ---------------- online ---------------- */
let lobbyBots = null;
function inviteUrl(code) { return `${location.origin}/${code}`; }
function connect(onOpen) {
  if (ui.ws && ui.ws.readyState === WebSocket.OPEN) { onOpen(); return; }
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host);
  ui.ws = ws;
  ws.onopen = onOpen;
  ws.onerror = () => {
    const msg = "Couldn't reach the server. Check your connection and try again.";
    $("#quickErr").textContent = msg;
    $("#joinErr").textContent = msg;
  };
  ws.onclose = () => {
    if (ui.mode === "online") {
      ui.mode = null; ui.code = null;
      toMenu();
      $("#quickErr").textContent = "The connection to the table dropped.";
    }
  };
  ws.onmessage = raw => {
    let m; try { m = JSON.parse(raw.data); } catch { return; }
    switch (m.t) {
      case "roster": onRoster(m); break;
      case "begin": {
        clearTimeout(ui.botTimer);
        ui.st = null;
        ui.you = m.you;
        ui.spectating = m.you == null;
        ui.queue.length = 0; ui.anim = false;
        enterTable(m.state);
        log(livesLine(m.state.players.length, m.state.rules?.lives ?? 3), "sys");
        if (ui.spectating) log("You're watching this table.", "sys");
        if (m.state.turn != null) { stage.setActive(m.state.turn); ui.gunAt = m.state.turn;
          stage.giveGun(m.state.turn, lookOf(m.state.players.find(p => p.id === m.state.turn)), false); }
        if (m.state.round) stage.counts(m.state.round, m.state.live, m.state.blank);
        break;
      }
      case "ev": ui.pendingState = m.state; enqueue(m.events); break;
      case "peek": ui.pendingPeek = m.live; break;
      case "note": log(esc(m.text), "sys"); break;
      case "chat": log(`<b>${esc(m.name)}</b> ${esc(m.text)}`, "talk"); break;
      case "err":
        $("#joinErr").textContent = m.msg; $("#quickErr").textContent = m.msg;
        if (!$("#joinDlg").open && $("#joinDlg").dataset.code) openJoin($("#joinDlg").dataset.code);
        $("#joinErr").textContent = m.msg;
        break;
    }
  };
}
function onRoster(m) {
  ui.code = m.code;
  ui.roster = m.players;
  history.replaceState(null, "", "/" + m.code);
  $("#lobbyCode").textContent = m.code;
  $("#hudCodeVal").textContent = m.code;
  $("#lobbyRoster").innerHTML = m.players.map(p => `<li class="${p.host ? "host" : ""}">${esc(p.name)}</li>`).join("");
  $("#lobbySpec").textContent = m.spectators ? `${m.spectators} watching` : "";
  const meHost = m.players.some(p => p.host && p.you);
  ui.host = meHost || (ui.host && !m.players.some(p => p.host && !p.you));
  $("#lobbyHost").classList.toggle("hidden", !ui.host);
  $("#lobbyStart").classList.toggle("hidden", !ui.host);
  $("#lobbyWait").classList.toggle("hidden", ui.host);
  if (ui.host && !$("#lobbyRules").childElementCount) rulesBlock($("#lobbyRules"));
  if (ui.host && !lobbyBots) lobbyBots = stepper($("#lobbyBots"), { min: 0, max: 5, value: ls.get("lobbyBots", 2), label: "house players", onChange: v => ls.set("lobbyBots", v) });
  if (!m.started) {
    closeAll();
    show("#lobby");
    /* seated players stand on the rail while the lobby fills */
    stage.setMode("attract");
    stage.setActive(null);
    stage.setPlayers(m.players.map((p, i) => ({ id: i, name: p.name, look: p.look, lives: 3, alive: true })), 3);
    ui.pub = null;
    $("#hit").innerHTML = "";
  }
  syncDock();
}
$("#lobbyStart").onclick = () => ui.ws?.send(JSON.stringify({ t: "start", bots: lobbyBots?.value ?? 2, rules: store.rules }));
$("#lobbyLeave").onclick = () => leaveTable();
$("#copyLink").onclick = async () => {
  const url = inviteUrl(ui.code);
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: "Last Chamber", text: "Take a seat at my table", url });
    else { await navigator.clipboard.writeText(url); flashLabel($("#copyLink span"), "Link copied"); }
  } catch { flashLabel($("#copyLink span"), url); }
};
function flashLabel(el, text) { const old = el.textContent; el.textContent = text; setTimeout(() => { el.textContent = old; }, 2200); }
$("#chatForm").onsubmit = e => {
  e.preventDefault();
  const text = $("#chatIn").value.trim();
  if (text) ui.ws?.send(JSON.stringify({ t: "chat", text }));
  $("#chatIn").value = "";
};

/* big code card and the streamer dock */
function drawQr(canvas, text) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), c = canvas.getContext("2d"), pad = 2, sz = canvas.width / (n + pad * 2);
  c.fillStyle = "#f2dfb4"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#14100d";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (q.isDark(y, x)) c.fillRect(Math.floor((x + pad) * sz), Math.floor((y + pad) * sz), Math.ceil(sz), Math.ceil(sz));
}
function openCodeCard() {
  if (!ui.code) return;
  $("#codeBig").textContent = ui.code;
  $("#codeUrl").textContent = inviteUrl(ui.code).replace(/^https?:\/\//, "");
  drawQr($("#codeQr"), inviteUrl(ui.code));
  $("#codeDlg").showModal();
}
$("#bigCodeBtn").onclick = openCodeCard;
$("#hudCode").onclick = openCodeCard;
$("#codeClose").onclick = () => $("#codeDlg").close();
function syncDock() {
  const on = store.streamer && ui.mode === "online" && !!ui.code;
  $("#codeDock").classList.toggle("hidden", !on);
  if (on) { $("#codeDockVal").textContent = ui.code; $("#codeDockUrl").textContent = inviteUrl(ui.code).replace(/^https?:\/\//, ""); }
}

/* ---------------- end of the night ---------------- */
function gameOver() {
  if (!ui.counted) { ui.counted = true; store.games++; sWin(); }
  const pub = ui.pub;
  const w = pub.players.find(p => p.id === pub.winner);
  endCoach(false);
  stage.sweep(false);
  stage.cheer(w?.id);
  setTargets(false);
  setPrompt(!w ? "Nobody's left standing." : isYou(w.id) ? "<b>You take the prize.</b>" : `<b>${esc(w.name)}</b> takes the prize.`);
  $("#overTitle").textContent = !w ? "Nobody takes the prize" : isYou(w.id) ? "You take the prize" : `${w.name} takes the prize`;
  const s = ui.reel?.stats || { live: 0, blank: 0, selfKeep: 0 };
  $("#overFacts").innerHTML = [
    ["Rounds", pub.round], ["Live rounds fired", s.live], ["Blanks survived", s.blank], ["Kept the gun on a blank", s.selfKeep]
  ].map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join("");
  const canRec = stage.kind === "3d" && typeof MediaRecorder !== "undefined" && !!stage.canvas.captureStream;
  $("#reelSave").disabled = !canRec || !ui.reel?.moments.length;
  $("#reelPlay").disabled = !ui.reel?.moments.length;
  $("#reelNote").textContent = canRec ? "" : "Saving clips isn't available on this device. The replay still plays.";
  $("#againBtn").classList.toggle("hidden", ui.mode === "online" && !ui.host);
  setTimeout(() => { if (ui.pub?.over && !document.body.classList.contains("replaying")) $("#overDlg").showModal(); }, reduced() ? 300 : 1600);
}
$("#againBtn").onclick = () => {
  $("#overDlg").close();
  if (ui.mode === "online") { ui.ws?.send(JSON.stringify({ t: "again" })); return; }
  const defs = ui.st.players.map(p => ({ name: p.name, bot: p.bot, look: p.look }));
  startLocal(defs, ui.humans, store.rules);
};
$("#overMenu").onclick = () => { $("#overDlg").close(); leaveTable(); };
$("#overDlg").addEventListener("cancel", e => e.preventDefault());

/* ---------------- the reel ----------------
   Runs the night back along the gun's track: the best pulls, in order,
   with the table as it stood. Recording composites the booth with a
   caption strip into a WebM. */
function pickMoments(all) {
  if (all.length <= 8) return all;
  const keyIdx = new Set(all.map((m, i) => (m.ev.killed || m.ev.keep) ? i : -1).filter(i => i >= 0));
  for (let i = all.length - 1; keyIdx.size < 8 && i >= 0; i--) keyIdx.add(i);
  return all.filter((_, i) => keyIdx.has(i)).slice(-8);
}
let replaying = false;
async function playReel(record) {
  if (replaying || !ui.reel?.moments.length) return;
  replaying = true;
  audio();
  $("#overDlg").close();
  document.body.classList.add("replaying");
  const banner = document.createElement("div");
  banner.className = "replay-tape";
  banner.innerHTML = `<span class="rec" aria-hidden="true"></span><span class="cap">Replay</span>`;
  document.body.appendChild(banner);
  const cap = banner.querySelector(".cap");
  let rec = null;
  if (record) rec = startRecording(() => cap.textContent);
  const R = ui.reel, moments = pickMoments(R.moments);
  const nm = id => R.start.find(p => p.id === id)?.name || "?";
  stage.setPlayers(R.start, R.cap);
  stage.setActive(null);
  await delay(600);
  for (const m of moments) {
    stage.update({ players: m.before, rules: { lives: R.cap } });
    stage.setActive(m.ev.pid);
    await stage.giveGun(m.ev.pid, lookOf(R.start.find(p => p.id === m.ev.pid)), true);
    cap.textContent = `Round ${m.round}: ${nm(m.ev.pid)} ${m.ev.pid === m.ev.tid ? "pulls on themself" : "pulls on " + nm(m.ev.tid)}`;
    announce(cap.textContent);
    sCock(); sHeart();
    await stage.aim(m.ev.pid, m.ev.tid);
    const f = stage.fire(m.ev);
    if (m.ev.live) { sBang(); flash(); stamp("bang"); if (!m.ev.shielded) setTimeout(sClang, 60); if (m.ev.killed) setTimeout(sThud, 380); }
    else { sClick(); sPuff(); stamp("click"); }
    stage.update({ players: m.after, rules: { lives: R.cap } });
    await f;
  }
  const w = ui.pub.players.find(p => p.id === ui.pub.winner);
  cap.textContent = w ? `${w.name} takes the prize` : "Nobody takes the prize";
  stage.update(ui.pub);
  if (w) stage.cheer(w.id);
  await delay(1800);
  if (rec) await rec.stop();
  banner.remove();
  document.body.classList.remove("replaying");
  replaying = false;
  if (ui.pub?.over) $("#overDlg").showModal();
}
function startRecording(caption) {
  const W_ = 1280, H_ = 720;
  const cv = document.createElement("canvas"); cv.width = W_; cv.height = H_;
  const c = cv.getContext("2d");
  stage.setAfterRender(src => {
    const sw = src.width, sh = src.height, s = Math.max(W_ / sw, H_ / sh);
    c.drawImage(src, (W_ - sw * s) / 2, (H_ - sh * s) / 2, sw * s, sh * s);
    c.fillStyle = "#f2dfb4"; c.fillRect(0, H_ - 64, W_, 64);
    c.fillStyle = "#14100d"; c.font = '30px "Rye", Georgia, serif'; c.textBaseline = "middle";
    c.fillText(caption(), 28, H_ - 31);
    c.textAlign = "right"; c.font = '600 22px "Barlow Semi Condensed", sans-serif';
    c.fillText("LAST CHAMBER", W_ - 28, H_ - 30); c.textAlign = "left";
  });
  const stream = cv.captureStream(30);
  if (recDest) recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(t => MediaRecorder.isTypeSupported?.(t)) || "";
  const mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6e6 } : undefined);
  const chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.start(250);
  return {
    stop: () => new Promise(res => {
      mr.onstop = () => {
        stage.setAfterRender(null);
        const blob = new Blob(chunks, { type: "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `last-chamber-${new Date().toISOString().slice(0, 10)}.webm`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        $("#reelNote").textContent = "Clip saved to your downloads.";
        res();
      };
      mr.stop();
    })
  };
}
$("#reelPlay").onclick = () => playReel(false);
$("#reelSave").onclick = () => playReel(true);

/* ---------------- leaving, the menu, the table menu ---------------- */
function attract() {
  stage.setMode("attract");
  stage.setActive(null);
  stage.setBulbs("steady");
  stage.setPlayers(["Viper", "Duchess", "Lucky", "Preacher"].map((n, i) => ({ id: i, name: n, look: null, lives: 3, alive: true })), 3);
  stage.giveGun(null, W.seededLook("house"), false);
}
function toMenu() {
  clearTimeout(ui.botTimer);
  ui.queue.length = 0; ui.anim = false;
  ui.pub = null; ui.st = null;
  closeAll();
  $("#hit").innerHTML = "";
  show("#menu");
  history.replaceState(null, "", "/");
  attract();
  syncDock();
}
function leaveTable() {
  if (ui.mode === "online") { ui.ws?.send(JSON.stringify({ t: "leave" })); }
  ui.mode = null; ui.code = null; lobbyBots = null;
  $("#lobbyRules").innerHTML = "";
  toMenu();
}
$("#hudMenu").onclick = () => { const d = $("#tableMenu"); d.returnValue = ""; d.showModal(); };
$("#tableMenu").addEventListener("close", () => {
  const v = $("#tableMenu").returnValue;
  if (v === "leave") leaveTable();
  else if (v === "office") openOffice();
  else if (v === "rules") openRules();
});

/* ---------------- paint shop ---------------- */
function openPaint() {
  const dlg = $("#paintDlg");
  const look = store.look;
  const preview = () => stage.setPlayers([{ id: 0, name: store.name, look: store.look, lives: 3, alive: true }], 3);
  const fromMenu = !ui.pub;
  if (fromMenu) { stage.setMode("preview"); preview(); stage.giveGun(0, look, false); $("#menu").classList.add("hidden"); }
  $("#paintName").value = store.name;
  $("#paintName").oninput = e => { const v = e.target.value.trim(); if (v) { store.name = v; preview(); } };
  $("#paintDice").onclick = () => { $("#paintName").value = W.carnivalName([store.name]); store.name = $("#paintName").value; preview(); };
  const set = (k, v) => { const l = store.look; l[k] = v; store.look = l; preview(); stage.giveGun(0, store.look, false); };
  tiles($("#pFig"), "fig", W.FIGURES.map((f, i) => ({ value: i, label: f.name })), look.fig, v => set("fig", v));
  for (const [k, el] of [["body", "#pBody"], ["trim", "#pTrim"], ["plate", "#pPlate"]]) {
    const box = $(el); box.innerHTML = "";
    /* columns are the five inks, rows deep / base / light */
    for (let tint = 0; tint < 3; tint++) for (let ink = 0; ink < 5; ink++) {
      const i = ink * 3 + tint;
      const lab = document.createElement("label");
      lab.className = "pot";
      const hex = W.paint(i);
      lab.innerHTML = `<input type="radio" name="${k}" value="${i}" ${look[k] === i ? "checked" : ""} aria-label="${W.paintName(i)}"><span style="--c:${hex};--check:${W.isLight(hex) ? "#14100d" : "#f2dfb4"}"></span>`;
      lab.dataset.tip = W.paintName(i);
      lab.querySelector("input").onchange = () => set(k, i);
      box.appendChild(lab);
    }
  }
  tiles($("#pGun"), "gun", W.GUNS.map((g, i) => ({ value: i, label: g })), look.gun, v => set("gun", v));
  tiles($("#pFinish"), "finish", W.FINISHES.map((g, i) => ({ value: i, label: g })), look.finish, v => set("finish", v));
  dlg.onclose = () => { if (fromMenu) { attract(); $("#menu").classList.remove("hidden"); } syncInset(); };
  dlg.showModal();
  requestAnimationFrame(paintInset);
}
$("#paintBtn").onclick = openPaint;

/* ---------------- back office ---------------- */
function openOffice() {
  const g = store.games;
  tiles($("#oAwning"), "awning", W.AWNINGS.map(a => ({
    value: a.id, label: a.name, disabled: g < a.need,
    sub: g < a.need ? `after ${a.need} games` : ""
  })), store.awning, v => { store.awning = v; stage.setAwning(W.AWNINGS.find(a => a.id === v).ink); });
  $("#oStreamer").checked = store.streamer;
  $("#oStreamer").onchange = e => { store.streamer = e.target.checked; document.body.classList.toggle("stream", store.streamer); syncDock(); };
  tiles($("#oMotion"), "motion", [
    { value: "system", label: "Follow device" }, { value: "full", label: "Full" }, { value: "reduce", label: "Reduced" }
  ], store.motion, v => { store.motion = v; applyMotion(); });
  const vol = $("#oVolume");
  vol.value = store.volume; vol.style.setProperty("--v", vol.value + "%");
  vol.oninput = () => {
    store.volume = +vol.value; vol.style.setProperty("--v", vol.value + "%");
    if (master) master.gain.value = store.volume / 100;
  };
  vol.onchange = () => { audio(); sClick(); };
  $("#oPlayed").textContent = `Games finished on this device: ${g}. New booth canvas unlocks as you play.`;
  $("#officeDlg").showModal();
}
$("#officeBtn").onclick = openOffice;

/* ---------------- tooltips ---------------- */
{
  const tip = $("#tip");
  let cur = null;
  const showTip = el => {
    const text = el.dataset.tip; if (!text) return;
    cur = el;
    tip.textContent = text; tip.hidden = false;
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    x = Math.max(8, Math.min(innerWidth - t.width - 8, x));
    let y = r.top - t.height - 10, below = false;
    if (y < 8) { y = r.bottom + 10; below = true; }
    tip.classList.toggle("below", below);
    tip.style.left = x + "px"; tip.style.top = y + "px";
    tip.style.setProperty("--ax", (r.left + r.width / 2 - x) + "px");
  };
  const hideTip = () => { cur = null; tip.hidden = true; };
  document.addEventListener("pointerover", e => { const el = e.target.closest("[data-tip]"); if (el && el !== cur && e.pointerType === "mouse") showTip(el); else if (!el && cur) hideTip(); });
  document.addEventListener("focusin", e => { const el = e.target.closest("[data-tip]"); if (el && e.target.matches(":focus-visible")) showTip(el); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
  document.addEventListener("scroll", hideTip, true);
}

/* keyboard: 1-7 play items, arrow keys move between targets */
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && ui.a11yAim != null) { ui.a11yAim = null; stage.unpreview(); announce("Backed out."); }
  if (!ui.canAct || e.target.closest("input, dialog[open]")) return;
  if (/^[1-7]$/.test(e.key)) { const b = $$("#hand .item")[+e.key - 1]; if (b) { e.preventDefault(); b.click(); } }
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const list = $$(".tbtn.targetable"); if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const n = list[(i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
    e.preventDefault(); n.focus();
  }
});

/* ---------------- boot ---------------- */
await mountBooth();
attract();
syncInset();
const m = location.pathname.match(/^\/([A-Za-z0-9]{4})\/?$/);
if (m && CODE_RE.test(m[1].toUpperCase())) openJoin(m[1].toUpperCase());

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
