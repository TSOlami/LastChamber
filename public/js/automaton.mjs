/* The players: carnival automatons.
   Jointed fairground figures of painted tin, porcelain and brass, about 1.75 m
   tall. Rigid parts hang from joint groups; arms reach by two-bone IK toward
   spring-smoothed hand targets, so every pose is a physical motion, never a
   cut. Faces are live: lids, brows, pupils and a rebuilt mouth curve blend
   between emotions on springs, with blinking and glances on top.

   Knocked out is mechanical: the eyes go dark, the figure slumps and steams.
   Nobody dies. */

import * as THREE from "three";
import { mergeGeometries } from "/vendor/addons/utils/BufferGeometryUtils.js";
import { INKS, paint, cleanLook, seededLook, isLight, fontsReady } from "./world.mjs";

const V3 = THREE.Vector3;
const DOWN = new V3(0, -1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));

/* ---------------- shared materials ---------------- */
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    porcelain: new THREE.MeshStandardMaterial({ color: 0xf3e6cc, roughness: .32, metalness: 0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb98a3a, roughness: .3, metalness: 1 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xfbf4e4, roughness: .15 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: .08, metalness: .2 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: .5 }),
    mouthIn: new THREE.MeshBasicMaterial({ color: 0x2a0a06, side: THREE.DoubleSide }),
    cheek: new THREE.MeshStandardMaterial({ color: 0xd8634c, roughness: .6, transparent: true, opacity: .55 }),
    glove: new THREE.MeshStandardMaterial({ color: 0xf2dfb4, roughness: .55 })
  };
  return SHARED;
}
const enamel = hex => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: .42, metalness: .35, side: THREE.DoubleSide });

/* ---------------- geometry helpers ---------------- */
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const capsule = (r, len) => { const g = new THREE.CapsuleGeometry(r, Math.max(.001, len - 2 * r), 6, 14); g.translate(0, -len / 2, 0); return g; };
const ball = r => new THREE.SphereGeometry(r, 18, 12);
function mesh(geo, mat, parent, pos, rot) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, pos) { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; }

/* stripes painted along a lathe's height (v runs bottom to top) */
function stripeTex(a, b, bands, offset = 0) {
  const cv = document.createElement("canvas"); cv.width = 8; cv.height = 256;
  const c = cv.getContext("2d");
  for (let i = 0; i < bands; i++) { c.fillStyle = (i + offset) % 2 ? b : a; c.fillRect(0, i * 256 / bands, 8, 256 / bands + 1); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- emotions ----------------
   lid 0 open..1 shut, low = lower lid lift (smiling eyes), browY -1..1,
   tilt -1 worried (inner ends up) .. 1 cross (inner ends down),
   mouth width, curve (+ smile), open 0..1, pupil scale. */
export const EMOTIONS = {
  neutral: { lid: .18, low: .05, browY: 0, tilt: 0, w: .036, curve: .004, open: 0, pupil: 1 },
  nervous: { lid: 0, low: 0, browY: .55, tilt: -.75, w: .028, curve: -.006, open: .18, pupil: .75 },
  scared: { lid: 0, low: 0, browY: 1, tilt: -.95, w: .026, curve: -.004, open: .75, pupil: .62 },
  focus: { lid: .45, low: .22, browY: -.45, tilt: .65, w: .032, curve: -.002, open: 0, pupil: 1 },
  dread: { lid: 1, low: .55, browY: -.25, tilt: -.85, w: .038, curve: -.012, open: .12, pupil: 1 },
  smug: { lid: .42, low: .3, browY: -.15, tilt: .35, w: .044, curve: .016, open: 0, pupil: 1 },
  relief: { lid: .55, low: .12, browY: .5, tilt: -.45, w: .042, curve: .012, open: .35, pupil: 1 },
  hurt: { lid: .88, low: .55, browY: -.35, tilt: -.95, w: .046, curve: -.014, open: .55, pupil: 1 },
  joy: { lid: .08, low: .5, browY: .85, tilt: -.25, w: .05, curve: .022, open: .7, pupil: 1.05 },
  shock: { lid: 0, low: 0, browY: 1, tilt: -.3, w: .028, curve: 0, open: .6, pupil: .68 },
  out: { lid: 1, low: 0, browY: -.55, tilt: -.25, w: .036, curve: -.01, open: 0, pupil: 0 }
};

/* ---------------- the figure ---------------- */
const FIGS = ["strongman", "duchess", "ringmaster", "sailor"];
const UPPER = .27, FORE = .25;
/* each figure is its own build, not a repaint: chest width and depth, shoulder
   span, limb thickness, head size and standing height */
const BUILD = {
  strongman: { w: 1.3, d: 1.08, sh: .32, limb: 1.4, head: .9, hip: .93, torso: [[0, 0], [.13, 0], [.15, .08], [.18, .2], [.215, .36], [.22, .46], [.17, .53], [0, .54]] },
  duchess: { w: .9, d: .92, sh: .215, limb: .82, head: 1.02, hip: .95, torso: [[0, 0], [.13, 0], [.12, .1], [.115, .2], [.15, .32], [.19, .42], [.15, .51], [0, .52]] },
  ringmaster: { w: .95, d: .95, sh: .24, limb: .92, head: 1, hip: 1.0, torso: [[0, 0], [.15, 0], [.16, .1], [.175, .24], [.2, .38], [.205, .46], [.15, .53], [0, .54]] },
  sailor: { w: 1.12, d: 1.15, sh: .26, limb: 1.12, head: 1.08, hip: .88, torso: [[0, 0], [.16, 0], [.2, .1], [.225, .24], [.215, .36], [.19, .46], [.14, .52], [0, .53]] }
};

export function createAutomaton(p, opts = {}) {
  const S = shared();
  const look = p.look ? cleanLook(p.look) : seededLook(p.name);
  const fig = FIGS[look.fig] || "strongman";
  const bodyHex = paint(look.body), trimHex = paint(look.trim), plateHex = paint(look.plate);
  const body = enamel(bodyHex), trim = enamel(trimHex);
  const mats = [body, trim];
  const porcelainLit = S.porcelain.clone(); porcelainLit.emissive.set(0xffd27a); porcelainLit.emissiveIntensity = .18;
  const B = BUILD[fig];

  const root = new THREE.Group(); root.name = "automaton";
  /* the rig turns and steps as one body; root stays at the figure's mark */
  const rig = joint(root, [0, 0, 0]);
  const pelvis = joint(rig, [0, B.hip, 0]);
  const legLen = .42 * B.hip / .93;
  /* legs: mostly behind the counter, but they carry the slump */
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = joint(pelvis, [sx * .09, -.04, 0]);
    mesh(ball(.06), S.brass, hip);
    mesh(capsule(.062 * B.limb, legLen), body, hip);
    const knee = joint(hip, [0, -legLen, 0]);
    mesh(ball(.05 * B.limb), S.brass, knee);
    mesh(capsule(.052 * B.limb, legLen), body, knee);
    mesh(new THREE.BoxGeometry(.11, .07, .2), S.ink, knee, [0, -legLen - .03, .04]);
    legs.push({ hip, knee });
  }
  mesh(lathe([[0, -.02], [.15, -.02], [.17, .05], [.155, .12], [0, .12]]), trim, pelvis);

  const spine = joint(pelvis, [0, .1, 0]);
  /* the chest shell is scaled to the build; the nameplate rides on its front */
  const chest = joint(spine, [0, 0, 0]);
  chest.scale.set(B.w, 1, B.d);
  /* the barrel chest: tin, banded, with a painted nameplate */
  const torsoPts = B.torso;
  const striped = fig === "strongman" || fig === "sailor";
  const torsoMat = striped ? new THREE.MeshStandardMaterial({ map: stripeTex(bodyHex, fig === "sailor" ? INKS[4].light : trimHex, fig === "sailor" ? 14 : 10), roughness: .42, metalness: .3 }) : body;
  if (striped) mats.push(torsoMat);
  mesh(lathe(torsoPts, 32), torsoMat, chest);
  const rAt = y => { for (let i = 1; i < torsoPts.length; i++) if (torsoPts[i][1] >= y) { const [r0, y0] = torsoPts[i - 1], [r1, y1] = torsoPts[i]; return r0 + (r1 - r0) * (y - y0) / ((y1 - y0) || 1); } return .15; };
  mesh(new THREE.TorusGeometry(rAt(.06) + .004, .014, 8, 32), trim, chest, [0, .06, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.TorusGeometry(rAt(.42) + .003, .012, 8, 32), S.brass, chest, [0, .42, 0], [Math.PI / 2, 0, 0]);
  /* rivets down the front seam */
  for (let i = 0; i < 4; i++) { const y = .12 + i * .08; mesh(ball(.009), S.brass, chest, [0, y, rAt(y) - .004]); }

  /* nameplate with name and life stars */
  const plateCv = document.createElement("canvas"); plateCv.width = 320; plateCv.height = 128;
  const plateTex = new THREE.CanvasTexture(plateCv); plateTex.colorSpace = THREE.SRGBColorSpace; plateTex.anisotropy = 4;
  const plate = mesh(new THREE.BoxGeometry(.2, .08, .012), [enamel(plateHex), enamel(plateHex), enamel(plateHex), enamel(plateHex), new THREE.MeshStandardMaterial({ map: plateTex, roughness: .45, metalness: .2 }), enamel(plateHex)], spine, [0, .3, rAt(.3) * B.d + .006]);
  plate.rotation.x = -.08;
  let plateState = { lives: p.lives, cap: opts.cap ?? 3 };
  function paintPlate() {
    const c = plateCv.getContext("2d"), w = 320, h = 128;
    c.fillStyle = plateHex; c.fillRect(0, 0, w, h);
    c.strokeStyle = INKS[0].base; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
    const ink = isLight(plateHex) ? INKS[0].base : INKS[4].light;
    c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "middle";
    let size = 46; const label = (p.name || "").toUpperCase();
    const font = s => `700 ${s}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
    c.font = font(size);
    while (c.measureText(label).width > w - 30 && size > 18) c.font = font(--size);
    c.fillText(label, w / 2, 46);
    const { lives, cap } = plateState, gap = 34, x0 = w / 2 - (cap - 1) * gap / 2;
    for (let i = 0; i < cap; i++) {
      const x = x0 + i * gap, y = 96;
      c.beginPath();
      if (i < lives) {
        for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 6 : 14; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
        c.closePath(); c.fillStyle = INKS[3].base; c.fill(); c.lineWidth = 3; c.strokeStyle = INKS[0].base; c.stroke();
      } else { c.arc(x, y, 8, 0, 7); c.fillStyle = "#050403"; c.fill(); c.lineWidth = 3; c.strokeStyle = "#8f8a7c"; c.stroke(); }
    }
    plateTex.needsUpdate = true;
  }
  paintPlate();
  fontsReady().then(paintPlate);

  /* figure-specific body pieces */
  if (fig === "duchess") {
    const skirt = mesh(lathe([[.15, .12], [.2, .02], [.3, -.3], [.36, -.62], [0, -.62]], 32), trim, pelvis);
    skirt.castShadow = true;
    mesh(new THREE.TorusGeometry(.355, .018, 8, 32), S.brass, pelvis, [0, -.6, 0], [Math.PI / 2, 0, 0]);
  }
  if (fig === "ringmaster") {
    /* tailcoat tails and lapels */
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(.13, .42, .03), trim, pelvis, [sx * .08, -.18, -.15], [.12, 0, sx * .06]);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(.06, .22, .02), trim, chest, [sx * .07, .36, .2], [-.15, 0, sx * -.35]);
    mesh(new THREE.BoxGeometry(.09, .035, .03), S.ink, chest, [0, .48, .17]);
  }
  if (fig === "sailor") {
    mesh(new THREE.BoxGeometry(.32, .16, .02), trim, chest, [0, .44, -.17], [.25, 0, 0]);
    mesh(new THREE.ConeGeometry(.05, .1, 3), enamel(INKS[2].base), chest, [0, .43, .2], [Math.PI, 0, 0]);
  }
  if (fig === "strongman") mesh(new THREE.TorusGeometry(rAt(.03) + .006, .024, 8, 32), S.ink, chest, [0, .03, 0], [Math.PI / 2, 0, 0]);

  /* neck and head */
  const neck = joint(spine, [0, torsoPts[torsoPts.length - 1][1], 0]);
  mesh(new THREE.CylinderGeometry(.045, .055, .08, 16), S.brass, neck, [0, .04, 0]);
  const head = joint(neck, [0, .08, 0]);
  head.scale.setScalar(B.head);
  const headPts = [[0, 0], [.07, .01], [.112, .05], [.13, .12], [.126, .19], [.1, .25], [.06, .29], [0, .3]];
  mesh(lathe(headPts, 32), S.porcelain, head);
  mesh(ball(.022), S.porcelain, head, [0, .13, .128]);                     /* nose */
  for (const sx of [-1, 1]) {
    const ch = mesh(new THREE.CircleGeometry(.024, 18), S.cheek, head, [sx * .075, .105, .112]);
    ch.rotation.y = sx * .55; ch.castShadow = false;
    mesh(ball(.03), S.porcelain, head, [sx * .128, .15, 0]);                /* ears are bolts */
    mesh(ball(.014), S.brass, head, [sx * .148, .15, 0]);
  }

  /* eyes: whites, pupils, lids */
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = joint(head, [sx * .048, .168, .108]);
    mesh(ball(.03), S.eyeWhite, e);
    const pupil = mesh(ball(.013), S.pupil, e, [0, 0, .025]);
    const glint = mesh(ball(.004), S.eyeWhite, pupil, [.005, .006, .011]); glint.castShadow = false;
    const lidG = joint(e, [0, 0, 0]);
    mesh(new THREE.SphereGeometry(.0335, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), S.porcelain, lidG);
    const lowG = joint(e, [0, 0, 0]);
    mesh(new THREE.SphereGeometry(.0333, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), S.porcelain, lowG);
    const brow = mesh(new THREE.BoxGeometry(.056, .012, .014), S.ink, head, [sx * .048, .214, .118]);
    eyes.push({ e, pupil, lidG, lowG, brow, sx });
  }
  /* mouth: rebuilt from a curve when the expression moves */
  const mouthG = joint(head, [0, .085, .122]);
  let mouthKey = "";
  function buildMouth(w, curve, open) {
    const key = [w, curve, open].map(v => v.toFixed(3)).join();
    if (key === mouthKey) return;
    mouthKey = key;
    for (const c of [...mouthG.children]) { mouthG.remove(c); c.geometry.dispose(); }
    const up = new THREE.QuadraticBezierCurve3(new V3(-w, 0, 0), new V3(0, -curve * 2, .006), new V3(w, 0, 0));
    mesh(new THREE.TubeGeometry(up, 16, .0055, 6, false), S.ink, mouthG).castShadow = false;
    if (open > .04) {
      const lo = new THREE.QuadraticBezierCurve3(new V3(-w, 0, 0), new V3(0, -curve * 2 - open * .055, .006), new V3(w, 0, 0));
      mesh(new THREE.TubeGeometry(lo, 16, .0055, 6, false), S.ink, mouthG).castShadow = false;
      const shape = new THREE.Shape();
      const a = up.getPoints(14), b = lo.getPoints(14).reverse();
      shape.moveTo(a[0].x, a[0].y);
      for (const q of a.slice(1)) shape.lineTo(q.x, q.y);
      for (const q of b) shape.lineTo(q.x, q.y);
      const fill = mesh(new THREE.ShapeGeometry(shape), S.mouthIn, mouthG, [0, 0, .002]); fill.castShadow = false;
    }
  }
  if (fig === "strongman") {
    /* a waxed handlebar moustache */
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new V3(0, .108, .128), new V3(sx * .03, .1, .126), new V3(sx * .058, .103, .118), new V3(sx * .072, .122, .108), new V3(sx * .062, .132, .108)]);
      mesh(new THREE.TubeGeometry(c, 20, .009, 8, false), S.ink, head);
    }
  }

  /* hats */
  if (fig === "ringmaster") {
    mesh(new THREE.CylinderGeometry(.17, .17, .012, 32), S.ink, head, [0, .27, 0]);
    mesh(new THREE.CylinderGeometry(.1, .095, .2, 32), S.ink, head, [0, .37, 0]);
    mesh(new THREE.CylinderGeometry(.101, .1, .035, 32), trim, head, [0, .29, 0]);
  } else if (fig === "duchess") {
    mesh(new THREE.CylinderGeometry(.21, .2, .014, 32), trim, head, [0, .26, -.01], [-.12, 0, .06]);
    mesh(lathe([[0, .3], [.1, .26], [.11, .2], [0, .2]]), trim, head, [0, -.01, -.01]);
    const feather = new THREE.CatmullRomCurve3([new V3(.08, .29, -.04), new V3(.16, .38, -.06), new V3(.24, .43, -.02), new V3(.3, .41, .03)]);
    mesh(new THREE.TubeGeometry(feather, 20, .018, 6, false), enamel(INKS[2].base), head);
  } else if (fig === "sailor") {
    mesh(lathe([[0, .23], [.115, .23], [.13, .25], [.1, .33], [0, .34]]), enamel(INKS[4].light), head);
    mesh(new THREE.TorusGeometry(.12, .02, 8, 32), enamel(INKS[4].light), head, [0, .24, 0], [Math.PI / 2, 0, 0]);
  }

  /* arms: shoulder ball, upper arm, elbow, forearm, gloved hand with a grip socket */
  const arms = {};
  for (const [side, sx] of [["R", -1], ["L", 1]]) {   /* the figure's right is the viewer's left */
    const sh = joint(spine, [sx * B.sh, .45, 0]);
    mesh(ball(.058 * Math.sqrt(B.limb)), S.brass, sh);
    const ua = joint(sh, [0, 0, 0]);
    mesh(capsule(.05 * B.limb, UPPER), body, ua);
    const fa = joint(ua, [0, -UPPER, 0]);
    mesh(ball(.044 * Math.sqrt(B.limb)), S.brass, fa);
    mesh(capsule(.044 * B.limb, FORE), trim, fa);
    const hand = joint(fa, [0, -FORE, 0]);
    mesh(new THREE.SphereGeometry(.052, 16, 12), S.glove, hand, [0, -.035, 0]).scale.set(1, 1.2, .8);
    mesh(capsule(.016, .05), S.glove, hand, [sx * -.035, -.01, .02], [0, 0, sx * .7]);   /* thumb */
    const cuff = mesh(new THREE.TorusGeometry(.05, .012, 8, 20), S.brass, fa, [0, -FORE + .02, 0], [Math.PI / 2, 0, 0]);
    cuff.visible = false;
    arms[side] = { sh, ua, fa, hand, sx, cuff, a: UPPER, b: FORE, p: new V3(), v: new V3(), init: false };
  }
  /* a chain between the cuffs */
  const cuffChain = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1, 6), S.brass);
  cuffChain.visible = false; root.add(cuffChain);

  /* the shield rides the left hand */
  let shieldObj = null;
  if (opts.shieldGeo) {
    shieldObj = new THREE.Mesh(opts.shieldGeo, opts.shieldMat);
    shieldObj.scale.setScalar(.75); shieldObj.visible = false; shieldObj.castShadow = true;
    root.add(shieldObj);
  }

  /* one draw per joint and material: parts that move together are merged into
     a single mesh, so a full stage of six figures stays cheap on phones */
  const live = new Set([...eyes.flatMap(e => [e.pupil, e.brow]), plate, cuffChain, arms.R.cuff, arms.L.cuff]);
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || live.has(o) || Array.isArray(o.material) || o.parent === mouthG || o.parent?.isMesh || o.children.length) return;
    const key = o.parent.uuid + "|" + o.material.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.clone() : m.geometry.clone(); g.applyMatrix4(m.matrix); return g.index ? g.toNonIndexed() : g; });
    for (const g of geos) for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const parent = list[0].parent, mat = list[0].material;
    for (const m of list) { parent.remove(m); m.geometry.dispose(); }
    const one = new THREE.Mesh(merged, mat);
    one.castShadow = true; one.receiveShadow = true;
    parent.add(one);
  }
  /* only the big masses cast shadows (the shadow pass costs a draw per caster):
     legs sit behind the counter and face parts are too small to throw one */
  const casters = new Set([pelvis, spine, chest, head, ...Object.values(arms).flatMap(m => [m.ua, m.fa, m.hand])]);
  root.traverse(o => { if (o.isMesh) o.castShadow = casters.has(o.parent); });

  /* ---------------- state ---------------- */
  const st = {
    pose: p.alive === false ? "out" : "idle", emotion: p.alive === false ? "out" : "neutral",
    aimPoint: new V3(), lookPoint: null, alive: p.alive !== false,
    face: { ...EMOTIONS.neutral }, blink: 0, nextBlink: 1 + Math.random() * 3, dart: { x: 0, y: 0 }, nextDart: 2,
    spine: { pitch: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, roll: { x: 0, v: 0 } },
    head: { pitch: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, roll: { x: 0, v: 0 } },
    slump: { x: p.alive === false ? 1 : 0, v: 0 }, hop: { x: 0, v: 0 },
    turn: { x: 0, v: 0 }, step: { x: 0, v: 0 },
    shield: false, cuffed: false, phase: Math.random() * 10, emoTimer: 0, emoAfter: null, gunSide: "R"
  };
  const spr = (s, t, k, d, dt) => { const a = (t - s.x) * k - s.v * d; s.v += a * dt; s.x += s.v * dt; };
  const vspr = (arm, t, k, d, dt) => {
    const ax = (t.x - arm.p.x) * k - arm.v.x * d, ay = (t.y - arm.p.y) * k - arm.v.y * d, az = (t.z - arm.p.z) * k - arm.v.z * d;
    arm.v.x += ax * dt; arm.v.y += ay * dt; arm.v.z += az * dt;
    arm.p.x += arm.v.x * dt; arm.p.y += arm.v.y * dt; arm.p.z += arm.v.z * dt;
  };

  /* ---------------- IK ---------------- */
  const _S = new V3(), _d = new V3(), _pl = new V3(), _E = new V3(), _el = new V3(), _hd = new V3(), _f = new V3();
  const _sc = new V3();
  const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qr = new THREE.Quaternion();
  function solveArm(arm, handW, poleW) {
    arm.sh.getWorldPosition(_S);
    _d.subVectors(handW, _S);
    const sc = root.getWorldScale(_sc).x;
    const a = arm.a * sc, b = arm.b * sc;
    const dist = clamp(_d.length(), Math.abs(a - b) + .02, a + b - .002);
    _d.normalize();
    const ang = Math.acos(clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1));
    _pl.copy(poleW).addScaledVector(_d, -poleW.dot(_d));
    if (_pl.lengthSq() < 1e-6) _pl.set(0, 0, -1);
    _pl.normalize();
    _E.copy(_d).multiplyScalar(Math.cos(ang)).addScaledVector(_pl, Math.sin(ang)).normalize();
    _q.setFromUnitVectors(DOWN, _E);
    arm.sh.getWorldQuaternion(_qp);
    arm.ua.quaternion.copy(_qp.invert()).multiply(_q);
    _el.copy(_S).addScaledVector(_E, a);
    _hd.copy(_S).addScaledVector(_d, dist);
    _f.subVectors(_hd, _el).normalize();
    _qa.setFromUnitVectors(DOWN, _f);
    arm.fa.quaternion.copy(_qr.copy(_q).invert()).multiply(_qa);
  }

  /* hand targets per pose, in the figure's own space (it faces +z) */
  const L = (x, y, z) => new V3(x, y, z);
  const POSES = {
    idle: { R: L(-.28, .74, .06), L: L(.28, .74, .06) },
    hold: { R: L(-.17, 1.17, .33), L: L(.26, .8, .1) },
    scared: { R: L(-.2, 1.42, .24), L: L(.2, 1.42, .24) },
    nervous: { R: L(-.06, 1.02, .22), L: L(.06, 1.02, .22) },
    cheer: { R: L(-.34, 1.92, .06), L: L(.34, 1.92, .06) },
    relief: { R: L(-.07, 1.24, .2), L: L(.26, .82, .1) },
    out: { R: L(-.24, .78, .3), L: L(.24, .78, .3) },
    present: { R: L(-.26, 1.2, .26), L: L(.26, .8, .1) }
  };
  const tmpW = new V3(), tmpW2 = new V3(), localPt = new V3();

  /* where the gun sits, and where it points (world) */
  const gunGrip = new V3(), gunAim = new V3();
  let holding = false;

  const api = {
    group: root, fig, mats, name: p.name,
    get alive() { return st.alive; },
    setPose(pose, point) { st.pose = pose; if (point) st.aimPoint.copy(point); },
    get pose() { return st.pose; },
    setAimPoint(point) { st.aimPoint.copy(point); },
    setHolding(h) { holding = h; },
    /* an emotion, optionally for a while before settling into another */
    feel(name, ms = 0, after = null) {
      if (!st.alive && name !== "out") return;
      st.emotion = name; st.emoTimer = ms / 1000; st.emoAfter = after;
    },
    lookAt(point) { st.lookPoint = point ? point.clone() : null; },
    highlight(on) {
      for (const m of mats) { m.emissive.set(on ? 0xffd27a : 0x000000); m.emissiveIntensity = on ? .22 : 0; }
      S.porcelain.emissive && head.traverse(o => { if (o.isMesh && o.material === S.porcelain) o.material = on ? porcelainLit : S.porcelain; });
    },
    impulse(kind) {
      if (kind === "hit") { st.spine.pitch.v -= 9; st.head.pitch.v -= 14; st.spine.roll.v += (Math.random() - .5) * 10; }
      else if (kind === "headhit") { st.head.roll.v += 26; st.head.pitch.v -= 10; st.spine.roll.v += 6; }
      else if (kind === "shudder") { st.spine.roll.v += 6; st.head.roll.v -= 8; }
      else if (kind === "recoil") { arms.R.v.y += 2.2; arms.R.v.z -= 1.4; st.spine.pitch.v -= 2; }
      else if (kind === "flinch") { st.spine.pitch.v -= 4; st.head.pitch.v -= 6; }
      else if (kind === "hop") { st.hop.v = 3.2; }
    },
    setLives(lives, cap) { if (plateState.lives !== lives || plateState.cap !== cap) { plateState = { lives, cap }; paintPlate(); } },
    setAlive(on) {
      if (st.alive === on) return;
      st.alive = on;
      if (!on) { st.pose = "out"; st.emotion = "out"; }
      else { st.pose = "idle"; st.emotion = "neutral"; }
    },
    setShield(on) { st.shield = on; },
    setCuffed(on) { st.cuffed = on; },
    /* world points the stage needs */
    headPoint(out = new V3()) { return head.localToWorld(out.set(0, .16, .05)); },
    headTop(out = new V3()) { return head.localToWorld(out.set(0, fig === "ringmaster" ? .48 : fig === "duchess" ? .42 : .36, 0)); },
    chestPoint(out = new V3()) { return spine.localToWorld(out.set(0, .3, .2)); },
    /* where a shot lands: between the eyes */
    aimPoint(out = new V3()) { return head.localToWorld(out.set(0, .15, .1)); },
    templePoint(out = new V3()) { return head.localToWorld(out.set(-.19, .17, .02)); },
    gripPoint(out = new V3()) { return out.copy(gunGrip); },
    aimTarget(out = new V3()) { return out.copy(gunAim); },
    update(dt, t, rm) {
      /* emotion timers */
      if (st.emoTimer > 0) { st.emoTimer -= dt; if (st.emoTimer <= 0 && st.emoAfter) { st.emotion = st.emoAfter; st.emoAfter = null; } }
      const E = EMOTIONS[st.emotion] || EMOTIONS.neutral;
      const F = st.face, rate = rm ? 30 : 9;
      for (const k in E) F[k] = ease(F[k], E[k], rate, dt);

      /* blinking and glances, only while powered */
      st.nextBlink -= dt;
      if (st.nextBlink <= 0 && st.alive) { st.blink = 1; st.nextBlink = 2 + Math.random() * 3.5; }
      st.blink = Math.max(0, st.blink - dt * 7);
      st.nextDart -= dt;
      if (st.nextDart <= 0) { st.dart.x = (Math.random() - .5) * .012; st.dart.y = (Math.random() - .5) * .008; st.nextDart = 1.2 + Math.random() * 2.5; }

      const pose = st.pose, ph = t + st.phase;
      /* body springs */
      const out = pose === "out";
      spr(st.slump, out ? 1 : 0, 26, 9, dt);
      spr(st.hop, 0, 60, 6, dt);
      const breathe = rm ? 0 : Math.sin(ph * 1.6) * .012;
      let pitchT = st.slump.x * .55 + (pose === "scared" ? -.1 : 0) + (pose === "relief" ? -.06 : 0);
      let yawT = 0, rollT = rm ? 0 : Math.sin(ph * .7) * .02;
      /* to shoot, step out of the line and square up to the target, so the arm
         never passes through a neighbour */
      let turnT = 0, stepT = 0;
      if (pose === "aim") {
        root.worldToLocal(localPt.copy(st.aimPoint));
        turnT = clamp(Math.atan2(localPt.x, localPt.z), -1.35, 1.35);
        stepT = .34;
      } else if (pose === "aimSelf") stepT = .3;
      else if (pose === "hold") stepT = .1;
      spr(st.turn, turnT, 30, 9, dt); spr(st.step, stepT, 34, 10, dt);
      rig.rotation.y = st.turn.x;
      rig.position.z = st.step.x;
      if (pose === "aimSelf") { rollT = .1; pitchT += .04; }
      spr(st.spine.pitch, pitchT, 70, 11, dt); spr(st.spine.yaw, yawT, 50, 10, dt); spr(st.spine.roll, rollT, 70, 9, dt);
      spine.rotation.set(st.spine.pitch.x + breathe, st.spine.yaw.x, st.spine.roll.x);
      spine.scale.y = 1 + breathe * .6;
      pelvis.position.y = B.hip - st.slump.x * .3 + Math.max(0, st.hop.x) * .12;
      for (const lg of legs) { lg.hip.rotation.x = -st.slump.x * 1.15; lg.knee.rotation.x = st.slump.x * 1.9; }

      /* head: look toward a point, or droop when out */
      let hp = 0, hy = 0, hr = 0;
      root.updateMatrixWorld(true);
      if (st.lookPoint && st.alive) {
        neck.getWorldPosition(tmpW);
        rig.worldToLocal(localPt.copy(st.lookPoint));
        rig.worldToLocal(tmpW2.copy(tmpW));
        localPt.sub(tmpW2);
        hy = clamp(Math.atan2(localPt.x, localPt.z), -1, 1) - st.spine.yaw.x;
        hp = -clamp(Math.atan2(localPt.y, Math.hypot(localPt.x, localPt.z)), -.45, .45);
      }
      if (out) { hp = .55; hy = .1; hr = .25; }
      if (pose === "aimSelf") { hr = .22; hy = .25; }
      if (pose === "cheer") hp = -.25;
      spr(st.head.pitch, hp, 60, 10, dt); spr(st.head.yaw, hy, 50, 10, dt); spr(st.head.roll, hr, 60, 9, dt);
      head.rotation.set(st.head.pitch.x, st.head.yaw.x, st.head.roll.x);

      /* hands: spring toward the pose's targets, then IK */
      root.updateMatrixWorld(true);
      st.gunSide = "R";
      for (const side of ["R", "L"]) {
        const arm = arms[side];
        let target;
        const base = (POSES[pose] || POSES.idle)[side];
        if (side === st.gunSide && pose === "aim") {
          /* arm straight out along the line to the target */
          arm.sh.getWorldPosition(tmpW);
          tmpW2.subVectors(st.aimPoint, tmpW).normalize().multiplyScalar((UPPER + FORE - .03) * root.getWorldScale(_sc).x).add(tmpW);
          target = rig.worldToLocal(tmpW2.clone());
        } else if (side === "R" && pose === "aimSelf") {
          target = rig.worldToLocal(api.templePoint(tmpW2).clone());
        } else if (pose === "aim" && side !== st.gunSide) {
          target = side === "R" ? POSES.idle.R : POSES.idle.L;
        } else if (side === "L" && st.shield && st.alive) {
          target = L(.16, 1.2, .34);
        } else if (st.cuffed && st.alive && pose !== "aim" && pose !== "aimSelf" && pose !== "hold") {
          target = side === "R" ? L(-.05, .92, .2) : L(.05, .92, .2);
        } else target = base;
        if (pose === "cheer" && !rm) target = target.clone().add(L(0, Math.sin(ph * 8) * .05, 0));
        if (!arm.init) { arm.p.copy(target); arm.init = true; }
        vspr(arm, target, rm ? 400 : 120, rm ? 40 : 15, dt);
        const handW = rig.localToWorld(tmpW.copy(arm.p));
        const pole = tmpW2.set(arm.sx * .7, -.35, -.65).applyQuaternion(rig.getWorldQuaternion(_qp)).normalize();
        solveArm(arm, handW.clone(), pole.clone());
        arm.hand.updateMatrixWorld(true);
      }

      /* face */
      for (const ey of eyes) {
        const lidAmt = Math.min(1, Math.max(F.lid, st.blink));
        ey.lidG.rotation.x = -.55 + lidAmt * 2.05;
        ey.lowG.rotation.x = .55 - F.low * 1.1;
        const ps = Math.max(0, F.pupil);
        ey.pupil.scale.setScalar(ps < .02 ? .0001 : ps);
        ey.pupil.position.set(st.dart.x, st.dart.y, .025);
        ey.brow.position.y = .214 + F.browY * .018;
        ey.brow.rotation.z = ey.sx * F.tilt * -.32;
      }
      buildMouth(F.w, F.curve, F.open);

      /* the gun: in the right hand, pointing where the pose says */
      if (holding) {
        arms[st.gunSide].hand.localToWorld(gunGrip.set(0, -.04, .02));
        if (pose === "aim") gunAim.copy(st.aimPoint);
        else if (pose === "aimSelf") api.headPoint(gunAim);
        else if (pose === "present") rig.localToWorld(gunAim.set(-1.6, 1.32, .55));   /* side-on, so the paint shop shows its profile */
        else rig.localToWorld(gunAim.set(-.1, .6, 1.4));
      }

      /* props: shield on the left hand, cuffs and their chain */
      if (shieldObj) {
        shieldObj.visible = st.shield && st.alive;
        if (shieldObj.visible) {
          arms.L.hand.getWorldPosition(tmpW);
          root.worldToLocal(tmpW);
          shieldObj.position.copy(tmpW).add(L(0, .02, .07));
          shieldObj.rotation.set(0, 0, 0);
        }
      }
      for (const side of ["R", "L"]) arms[side].cuff.visible = st.cuffed;
      cuffChain.visible = st.cuffed;
      if (st.cuffed) {
        const a = arms.R.cuff.getWorldPosition(tmpW), b = arms.L.cuff.getWorldPosition(tmpW2);
        root.worldToLocal(a); root.worldToLocal(b);
        cuffChain.position.lerpVectors(a, b, .5);
        cuffChain.scale.y = a.distanceTo(b);
        cuffChain.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
      }
    },
    /* a hit volume for pointing: generous, so a thumb finds the figure */
    collider: (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(.72, 1.3, .6), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(0, 1.48, 0); root.add(m); return m; })(),
    dispose() {
      porcelainLit.dispose();
      root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of mats) m.dispose();
      plateTex.dispose();
    }
  };
  return api;
}
