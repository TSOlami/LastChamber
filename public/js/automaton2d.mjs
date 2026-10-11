/* The automatons, painted flat for the Lite booth.
   Same cast, same builds and enamels as the 3D figures, drawn front-on with
   shading so they read as round. The face takes a mood, so the Lite booth
   still shows who's scared, hurt, relieved or out. */

import { INKS, paint, cleanLook, seededLook, isLight, shadeHex } from "./world.mjs";

const W = 512, H = 768, S = W / 200;
const FIGS = ["strongman", "duchess", "ringmaster", "sailor"];
/* chest half-width, shoulder span, limb width, head radius, hip height (in a 200 x 300 box) */
const BUILD = {
  strongman: { chest: 58, sh: 74, limb: 19, head: 30, hip: 205 },
  duchess: { chest: 40, sh: 52, limb: 11, head: 33, hip: 210 },
  ringmaster: { chest: 44, sh: 58, limb: 13, head: 32, hip: 214 },
  sailor: { chest: 52, sh: 63, limb: 15, head: 35, hip: 200 }
};
const MOODS = {
  neutral: { lid: .2, brow: 0, tilt: 0, curve: 2, open: 0 },
  scared: { lid: 0, brow: 6, tilt: -1, curve: -1, open: 7 },
  focus: { lid: .45, brow: -3, tilt: .8, curve: 0, open: 0 },
  hurt: { lid: .85, brow: -2, tilt: -1, curve: -4, open: 5 },
  relief: { lid: .5, brow: 4, tilt: -.5, curve: 4, open: 3 },
  joy: { lid: .1, brow: 6, tilt: -.3, curve: 6, open: 8 },
  out: { lid: 1, brow: -3, tilt: -.3, curve: -3, open: 0 }
};

function grad(c, x0, x1, base) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shadeHex(base, .62)); g.addColorStop(.35, shadeHex(base, 1.08)); g.addColorStop(.6, base); g.addColorStop(1, shadeHex(base, .55));
  return g;
}
function pill(c, x, y, w, h, fill) {
  const r = Math.min(w, h) / 2;
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
  c.lineWidth = 1.6; c.strokeStyle = INKS[0].base; c.stroke();
}
function brassBall(c, x, y, r) {
  const g = c.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r);
  g.addColorStop(0, "#f6d68c"); g.addColorStop(.5, "#b98a3a"); g.addColorStop(1, "#5c3f12");
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill();
}

export function paintAutomaton(p, opts = {}) {
  const look = p.look ? cleanLook(p.look) : seededLook(p.name);
  const fig = FIGS[look.fig] || "strongman";
  const B = BUILD[fig];
  const mood = MOODS[opts.out ? "out" : opts.mood || "neutral"] || MOODS.neutral;
  const body = paint(look.body), trim = paint(look.trim), plateHex = paint(look.plate);
  const soot = INKS[0].base, cream = INKS[4].base;
  const cv = opts.canvas || document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.clearRect(0, 0, W, H);
  c.save(); c.scale(S, S);
  const cx = 100, hip = B.hip, chestTop = hip - 98, neckY = chestTop - 4, headY = neckY - B.head - 4;

  /* legs, skirt */
  for (const sx of [-1, 1]) pill(c, cx + sx * 16 - B.limb * .55, hip - 4, B.limb * 1.1, 300 - hip + 10, grad(c, cx + sx * 16 - 12, cx + sx * 16 + 12, body));
  if (fig === "duchess") {
    c.beginPath(); c.moveTo(cx - 30, hip - 18); c.quadraticCurveTo(cx - 60, hip + 40, cx - 74, 300);
    c.lineTo(cx + 74, 300); c.quadraticCurveTo(cx + 60, hip + 40, cx + 30, hip - 18); c.closePath();
    c.fillStyle = grad(c, cx - 74, cx + 74, trim); c.fill(); c.lineWidth = 1.8; c.strokeStyle = soot; c.stroke();
  }
  /* arms behind the chest edge */
  for (const sx of [-1, 1]) {
    const x = cx + sx * B.sh;
    pill(c, x - B.limb / 2, chestTop + 8, B.limb, 54, grad(c, x - B.limb / 2, x + B.limb / 2, body));
    pill(c, x - B.limb * .45, chestTop + 58, B.limb * .9, 48, grad(c, x - B.limb / 2, x + B.limb / 2, trim));
    brassBall(c, x, chestTop + 58, B.limb * .55);
    c.beginPath(); c.ellipse(x, chestTop + 112, B.limb * .75, B.limb * .9, 0, 0, 7); c.fillStyle = INKS[4].light; c.fill();
    c.lineWidth = 1.4; c.strokeStyle = soot; c.stroke();
    brassBall(c, x, chestTop + 6, B.limb * .7);
  }
  /* the barrel chest, banded for the strongman and sailor */
  const chest = new Path2D();
  chest.moveTo(cx - B.chest * .72, hip);
  chest.bezierCurveTo(cx - B.chest * 1.05, hip - 40, cx - B.chest * 1.08, chestTop + 20, cx - B.chest * .8, chestTop);
  chest.lineTo(cx + B.chest * .8, chestTop);
  chest.bezierCurveTo(cx + B.chest * 1.08, chestTop + 20, cx + B.chest * 1.05, hip - 40, cx + B.chest * .72, hip);
  chest.closePath();
  c.fillStyle = grad(c, cx - B.chest, cx + B.chest, body); c.fill(chest);
  if (fig === "strongman" || fig === "sailor") {
    c.save(); c.clip(chest);
    const band = fig === "sailor" ? 8 : 11, alt = fig === "sailor" ? INKS[4].light : trim;
    for (let y = chestTop; y < hip; y += band * 2) { c.fillStyle = grad(c, cx - B.chest, cx + B.chest, alt); c.fillRect(0, y + band, 200, band); }
    c.restore();
  }
  if (fig === "ringmaster") {
    c.fillStyle = trim;
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * 6, chestTop); c.lineTo(cx + sx * 26, chestTop + 46); c.lineTo(cx + sx * 16, chestTop + 46); c.lineTo(cx, chestTop + 14); c.closePath(); c.fill(); }
  }
  c.lineWidth = 2; c.strokeStyle = soot; c.stroke(chest);
  c.fillStyle = "#b98a3a"; c.fillRect(cx - B.chest * .95, chestTop + 16, B.chest * 1.9, 3);
  c.fillStyle = shadeHex(trim, .9); c.fillRect(cx - B.chest * .78, hip - 10, B.chest * 1.56, 6);

  /* nameplate with life stars, ink chosen against the plate */
  const py = chestTop + 46, pw = Math.min(84, B.chest * 1.5);
  c.beginPath(); c.roundRect(cx - pw / 2, py, pw, 26, 3); c.fillStyle = plateHex; c.fill(); c.lineWidth = 1.4; c.strokeStyle = soot; c.stroke();
  c.fillStyle = isLight(plateHex) ? soot : INKS[4].light; c.textAlign = "center"; c.textBaseline = "middle";
  let fs = 11; const label = (p.name || "").toUpperCase();
  const font = s => `700 ${s}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
  c.font = font(fs); while (c.measureText(label).width > pw - 8 && fs > 6) c.font = font(fs -= .5);
  c.fillText(label, cx, py + 9);
  const cap = opts.cap ?? 3, lives = opts.lives ?? cap;
  for (let i = 0; i < cap; i++) {
    const x = cx - (cap - 1) * 5 + i * 10, y = py + 20;
    c.beginPath();
    if (i < lives) { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 1.7 : 4; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fillStyle = INKS[3].base; c.fill(); c.lineWidth = .8; c.strokeStyle = soot; c.stroke(); }
    else { c.arc(x, y, 2.4, 0, 7); c.fillStyle = "#050403"; c.fill(); }
  }

  /* neck and porcelain head */
  pill(c, cx - 7, neckY - 6, 14, 12, "#b98a3a");
  const hg = c.createRadialGradient(cx - B.head * .35, headY - B.head * .4, 2, cx, headY, B.head * 1.1);
  hg.addColorStop(0, "#fffaf0"); hg.addColorStop(.7, "#f3e6cc"); hg.addColorStop(1, "#c9b384");
  c.beginPath(); c.ellipse(cx, headY, B.head * .88, B.head, 0, 0, 7); c.fillStyle = hg; c.fill(); c.lineWidth = 2; c.strokeStyle = soot; c.stroke();
  const R = B.head;
  c.fillStyle = "rgba(216,99,76,.5)";
  for (const sx of [-1, 1]) { c.beginPath(); c.arc(cx + sx * R * .5, headY + R * .22, R * .18, 0, 7); c.fill(); }
  /* eyes with lids, brows, mouth from the mood */
  for (const sx of [-1, 1]) {
    const ex = cx + sx * R * .36, ey = headY - R * .1, er = R * .22;
    c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fillStyle = "#fbf4e4"; c.fill(); c.lineWidth = 1.2; c.strokeStyle = soot; c.stroke();
    if (!opts.out) { c.beginPath(); c.arc(ex, ey + 1, er * (mood === MOODS.scared ? .38 : .5), 0, 7); c.fillStyle = soot; c.fill(); }
    if (mood.lid > 0) {
      c.save(); c.beginPath(); c.arc(ex, ey, er + .5, 0, 7); c.clip();
      c.fillStyle = "#efe0c2"; c.fillRect(ex - er - 1, ey - er - 1, er * 2 + 2, (er * 2 + 2) * mood.lid);
      c.restore();
      c.beginPath(); c.moveTo(ex - er, ey - er + er * 2 * mood.lid); c.lineTo(ex + er, ey - er + er * 2 * mood.lid); c.lineWidth = 1.4; c.strokeStyle = soot; c.stroke();
    }
    const by = ey - er - 4 - mood.brow;
    c.beginPath(); c.moveTo(ex - er, by + sx * mood.tilt * -3); c.lineTo(ex + er, by + sx * mood.tilt * 3); c.lineWidth = 2.6; c.strokeStyle = soot; c.lineCap = "round"; c.stroke();
  }
  const my = headY + R * .45, mw = R * .38;
  c.beginPath(); c.moveTo(cx - mw, my); c.quadraticCurveTo(cx, my + mood.curve * 1.6, cx + mw, my);
  if (mood.open > 0) { c.quadraticCurveTo(cx, my + mood.curve * 1.6 + mood.open * 2, cx - mw, my); c.fillStyle = "#2a0a06"; c.fill(); }
  c.lineWidth = 2; c.strokeStyle = soot; c.stroke();
  if (fig === "strongman") {
    c.lineWidth = 3.2; c.lineCap = "round";
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx, my - 5); c.quadraticCurveTo(cx + sx * 14, my - 9, cx + sx * 20, my - 15); c.stroke(); }
  }
  /* hats */
  c.lineWidth = 1.8;
  if (fig === "ringmaster") {
    c.fillStyle = soot; c.fillRect(cx - 40, headY - R - 3, 80, 6); c.fillRect(cx - 24, headY - R - 44, 48, 42);
    c.fillStyle = trim; c.fillRect(cx - 24, headY - R - 12, 48, 7);
  } else if (fig === "duchess") {
    c.beginPath(); c.ellipse(cx, headY - R + 2, 46, 9, -.08, 0, 7); c.fillStyle = trim; c.fill(); c.strokeStyle = soot; c.stroke();
    c.beginPath(); c.moveTo(cx + 18, headY - R - 2); c.quadraticCurveTo(cx + 46, headY - R - 34, cx + 58, headY - R - 22); c.lineWidth = 5; c.strokeStyle = INKS[2].base; c.stroke();
  } else if (fig === "sailor") {
    c.beginPath(); c.ellipse(cx, headY - R + 6, R * .95, 10, 0, Math.PI, 0); c.fillStyle = INKS[4].light; c.fill(); c.lineWidth = 1.6; c.strokeStyle = soot; c.stroke();
    c.fillStyle = trim; c.fillRect(cx - R * .9, headY - R + 4, R * 1.8, 4);
  }
  /* knocked out: eyes dark, a curl of steam */
  if (opts.out) {
    c.strokeStyle = "rgba(220,210,190,.75)"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx + 8, headY - R - 6); c.bezierCurveTo(cx + 22, headY - R - 18, cx - 4, headY - R - 28, cx + 12, headY - R - 42); c.stroke();
  }
  c.restore();
  return cv;
}
