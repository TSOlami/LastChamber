/* The booth, in real-time 3D.
   One stage object drives everything the table shows: a cast of jointed
   carnival automatons on the booth stage, a real-scale revolver that passes
   from hand to hand, the shell rack, the flip tally and the bulb marquee.
   Motion is physical: bodies and joints ride springs and IK, casings and
   sparks fly ballistic, state changes flip like tally cards. A director layer
   gives every figure a pose and a feeling for each beat of a pull. */

import * as THREE from "three";
import { GLTFLoader } from "/vendor/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "/vendor/addons/environments/RoomEnvironment.js";
import { INKS, seededLook, cleanLook, fontsReady } from "./world.mjs";
import { createAutomaton } from "./automaton.mjs";

const C = Object.fromEntries(INKS.map(i => [i.id, new THREE.Color(i.base)]));
const GUN_IDS = ["GUN_pocket", "GUN_service", "GUN_marshal"];
const FINISH = [
  { color: 0x2b3038, rough: .28, metal: 1 },
  { color: 0xb9893a, rough: .3, metal: 1 },
  { color: 0xc9c6bd, rough: .22, metal: 1 }
];

const RAIL_Z = -2.15, RAIL_Y = 1.0, COUNTER_Y = 0.93, TRACK_Z = 0.42;

/* critically damped-ish spring stepping */
function spring(s, target, k, d, dt) {
  const a = (target - s.x) * k - s.v * d;
  s.v += a * dt; s.x += s.v * dt;
}

export async function createBooth(host, opts = {}) {
  const reduced = () => document.documentElement.dataset.motion === "reduce";
  await fontsReady();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lite ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !opts.lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "booth-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0806);
  scene.fog = new THREE.Fog(0x0a0806, 7, 14);
  const camera = new THREE.PerspectiveCamera(38, 1, .05, 40);
  /* a dim room reflection so brass, tin and blued steel read as metal */
  {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
    scene.environmentIntensity = .22;
    pm.dispose();
  }

  /* ---------------- materials ---------------- */
  const tex = (draw, w = 512, h = 512, rep) => {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); }
    return t;
  };
  const grain = (c, w, h, a = .06) => {
    for (let i = 0; i < w * h / 40; i++) {
      c.fillStyle = Math.random() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,240,210,${a * .5})`;
      c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };
  /* striped canvas for walls and the awning */
  let stripeInk = opts.awning ?? 1;
  const stripeTex = (ink, dark = true) => tex((c, w, h) => {
    const a = INKS[ink].base, b = INKS[4].deep;
    for (let x = 0; x < w; x += 64) {
      c.fillStyle = (x / 64) % 2 ? b : a; c.fillRect(x, 0, 64, h);
    }
    if (dark) { c.fillStyle = "rgba(10,8,6,.72)"; c.fillRect(0, 0, w, h); }
    grain(c, w, h, .08);
    /* water stains and sun fade toward the top */
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(242,223,180,.06)"); g.addColorStop(1, "rgba(10,8,6,.35)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 512, 512, [4, 1]);
  const woodTex = tex((c, w, h) => {
    c.fillStyle = "#3b2414"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      c.fillStyle = `rgba(${20 + Math.random() * 30},${10 + Math.random() * 14},4,${.15 + Math.random() * .2})`;
      c.fillRect(0, y + Math.sin(y * .05) * 2, w, 1 + Math.random() * 2);
    }
    /* worn patch where elbows rest */
    const g = c.createRadialGradient(w * .5, h * .4, 10, w * .5, h * .4, w * .45);
    g.addColorStop(0, "rgba(120,80,45,.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    grain(c, w, h, .07);
  }, 512, 512, [3, 1]);

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: stripeTex(stripeInk), roughness: .95 }),
    floor: new THREE.MeshStandardMaterial({ map: woodTex, color: 0x4a3a30, roughness: .9 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: .62, metalness: 0 }),
    tin: new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: .42, metalness: .85 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb98a3a, roughness: .32, metalness: 1 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false }),
    teal: new THREE.MeshStandardMaterial({ map: tex((c, w, h) => {
      c.fillStyle = INKS[1].deep; c.fillRect(0, 0, w, h);
      /* chipped enamel over plywood, scuffed low where boots hit it */
      for (let i = 0; i < 260; i++) {
        const y = h * (.35 + .65 * Math.sqrt(Math.random()));
        c.fillStyle = Math.random() < .5 ? "#5a3a22" : "#2a1a0e";
        c.beginPath(); c.ellipse(Math.random() * w, y, 1 + Math.random() * 5, 1 + Math.random() * 3, 0, 0, 7); c.fill();
      }
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(10,8,6,.6)");
      c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, .08);
    }, 512, 256, [4, 1]), roughness: .55 }),
    cream: new THREE.MeshStandardMaterial({ color: C.cream, roughness: .45 })
  };

  /* ---------------- models ---------------- */
  const gltf = await new GLTFLoader().loadAsync("/models/booth.glb");
  const parts = {};
  gltf.scene.traverse(o => { if (o.isMesh || o.isGroup) parts[o.name] = o; });
  const part = name => {
    const o = parts[name];
    if (!o) throw new Error("missing model part " + name);
    return o;
  };
  /* swap Blender's stand-in materials for the booth's own */
  const restyle = (root) => root.traverse(o => {
    if (!o.isMesh) return;
    const swap = m => {
      const n = m.name;
      if (n.startsWith("wood")) return M.wood;
      if (n.startsWith("brass")) return M.brass;
      if (n.startsWith("tin")) return M.tin;
      if (n.startsWith("enamel_teal")) return M.teal;
      if (n.startsWith("enamel_cream")) return M.cream;
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.castShadow = true; o.receiveShadow = true;
  });
  const place = (obj, { x = 0, y = 0, z = 0, cx = true, cz = true, ry = 0, s = 1 } = {}) => {
    obj.scale.setScalar(s);
    obj.rotation.y = ry;
    obj.position.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    obj.position.set(x - (cx ? (b.min.x + b.max.x) / 2 : 0), y - b.min.y, z - (cz ? (b.min.z + b.max.z) / 2 : 0));
    return obj;
  };

  /* ---------------- the room ---------------- */
  const room = new THREE.Group(); scene.add(room);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), M.wall);
  wall.position.set(0, 2.75, -3.2); wall.receiveShadow = true; room.add(wall);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.5), M.wall);
    side.position.set(sx * 3.3, 2.75, -.2); side.rotation.y = -sx * Math.PI / 2; room.add(side);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 8), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.z = -1; floor.receiveShadow = true; room.add(floor);

  const rail = part("RAIL").clone(); restyle(rail);
  place(rail, { y: 0, z: RAIL_Z, s: 1 }); room.add(rail);
  const counter = part("COUNTER").clone(); restyle(counter);
  place(counter, { y: 0, z: .35 }); room.add(counter);
  const posts = part("POSTS").clone(); restyle(posts);
  place(posts, { y: 0, z: -.45 }); posts.scale.x = .55; room.add(posts);

  /* brass track the gun carriage rides: custody is one continuous line */
  const track = new THREE.Mesh(new THREE.BoxGeometry(4.7, .012, .035), M.brass);
  track.position.set(0, COUNTER_Y + .006, TRACK_Z); track.receiveShadow = true; room.add(track);

  /* awning valance: scalloped striped canvas */
  const awn = new THREE.Group(); room.add(awn);
  const valMat = new THREE.MeshStandardMaterial({ map: stripeTex(stripeInk, false), roughness: .9, side: THREE.DoubleSide });
  valMat.map.repeat.set(9, 1);
  {
    const shape = new THREE.Shape();
    const W = 6.8, H = .42, n = 17;
    shape.moveTo(-W / 2, H);
    shape.lineTo(W / 2, H);
    shape.lineTo(W / 2, 0);
    for (let i = n; i > 0; i--) {
      const x0 = -W / 2 + i * W / n, x1 = x0 - W / n;
      shape.quadraticCurveTo((x0 + x1) / 2, -.22, x1, 0);
    }
    shape.lineTo(-W / 2, H);
    const g = new THREE.ShapeGeometry(shape, 8);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + .22) / (H + .22));
    const val = new THREE.Mesh(g, valMat);
    val.position.set(0, 2.9, -.42); val.scale.x = .53; awn.add(val);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.2), valMat);
    roof.rotation.x = Math.PI / 2 + .3; roof.position.set(0, 3.55, -1.9); awn.add(roof);
  }

  /* ---------------- marquee ---------------- */
  const marquee = part("MARQUEE").clone(); restyle(marquee);
  const signCanvas = document.createElement("canvas");
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 8; signTex.flipY = false;
  function paintSign(text = "LAST CHAMBER") {
    const w = 2048, h = 640; signCanvas.width = w; signCanvas.height = h;
    const c = signCanvas.getContext("2d");
    c.fillStyle = INKS[1].deep; c.fillRect(0, 0, w, h);
    grain(c, w, h, .05);
    c.strokeStyle = INKS[2].base; c.lineWidth = 34; c.strokeRect(40, 30, w - 80, h - 60);
    c.strokeStyle = INKS[4].base; c.lineWidth = 6; c.strokeRect(70, 58, w - 140, h - 116);
    c.textAlign = "center"; c.textBaseline = "middle";
    let size = 250;
    c.font = `${size}px "Rye", Georgia, serif`;
    while (c.measureText(text).width > w - 320) { size -= 6; c.font = `${size}px "Rye", Georgia, serif`; }
    const ty = h * .58;
    c.lineJoin = "round";
    c.lineWidth = 26; c.strokeStyle = INKS[0].base; c.strokeText(text, w / 2 + 10, ty + 12);
    c.lineWidth = 18; c.strokeStyle = INKS[2].base; c.strokeText(text, w / 2, ty);
    c.fillStyle = INKS[4].base; c.fillText(text, w / 2, ty);
    /* chipped enamel */
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(10,8,6,.5)";
    for (let i = 0; i < 160; i++) { c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 0, 7); c.fill(); }
    c.globalCompositeOperation = "source-over";
    signTex.needsUpdate = true;
  }
  paintSign();
  marquee.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map(m => m.name.startsWith("marquee_face")
      ? new THREE.MeshStandardMaterial({ map: signTex, roughness: .55, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: .12 })
      : M.teal);
    if (o.material.length === 1) o.material = o.material[0];
  });
  place(marquee, { y: 2.05, z: -2.75, s: .78 }); room.add(marquee);

  /* bulbs: unlit cores plus additive halos; the chase means "your turn" and nothing else */
  const bulbPts = [];
  {
    const b = new THREE.Box3().setFromObject(marquee);
    const n = 30, W = b.max.x - b.min.x;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = b.min.x + .1 + t * (W - .2);
      bulbPts.push(new THREE.Vector3(x, b.min.y + (b.max.y - b.min.y) * (.83 + .17 * Math.sin(Math.PI * t)) - .02, b.max.z + .05));
    }
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      bulbPts.push(new THREE.Vector3(-1.7 + t * 3.4, 3.25, -.36));
    }
    /* a full ring: bulbs down both sides and along the foot of the sign */
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      bulbPts.push(new THREE.Vector3(b.min.x + .06, b.max.y - (b.max.y - b.min.y) * t * .9, b.max.z + .05));
      bulbPts.push(new THREE.Vector3(b.max.x - .06, b.max.y - (b.max.y - b.min.y) * t * .9, b.max.z + .05));
    }
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      bulbPts.push(new THREE.Vector3(b.min.x + .1 + t * (W - .2), b.min.y + .04, b.max.z + .05));
    }
  }
  const bulbGeo = new THREE.SphereGeometry(.035, 10, 8);
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPts.length);
  const haloGeo = new THREE.BufferGeometry().setFromPoints(bulbPts);
  const haloCol = new Float32Array(bulbPts.length * 3);
  haloGeo.setAttribute("color", new THREE.BufferAttribute(haloCol, 3));
  const haloTex = tex((c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,236,190,1)"); g.addColorStop(.25, "rgba(240,180,70,.5)"); g.addColorStop(1, "rgba(240,160,40,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 64, 64);
  const halos = new THREE.Points(haloGeo, new THREE.PointsMaterial({
    size: .42, map: haloTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  const dummy = new THREE.Object3D();
  bulbPts.forEach((p, i) => { dummy.position.copy(p); dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix); });
  bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bulbPts.length * 3), 3);
  room.add(bulbs, halos);
  const bulbWarm = new THREE.Color(0xffd27a);
  let bulbMode = "steady", bulbLevel = { x: 1, v: 0 };

  /* ---------------- lights ---------------- */
  scene.add(new THREE.HemisphereLight(0x5a4632, 0x050403, .32));
  const marqueeLight = new THREE.PointLight(0xffc56a, 7, 5, 1.8);
  marqueeLight.position.set(0, 2.6, -1.9); scene.add(marqueeLight);
  /* the valance bulbs throw pools on the counter; everything else falls off to soot */
  const valLights = [-1.7, 0, 1.7].map(x => { const l = new THREE.PointLight(0xffb85a, 3.2, 3.2, 2); l.position.set(x, 2.75, -.2); scene.add(l); return l; });
  const counterLamp = new THREE.PointLight(0xffb45a, 3.5, 3, 2);
  counterLamp.position.set(0, 1.9, .9); scene.add(counterLamp);
  /* a low footlight picks out the chipped enamel on the counter front */
  const foot = new THREE.PointLight(0xffa850, 2.2, 2.6, 2); foot.position.set(0, .35, 1.9); scene.add(foot);
  const key = new THREE.SpotLight(0xfff0d0, 90, 9, .3, .5, 1.4);
  key.position.set(0, 2.55, 1.3); key.castShadow = !opts.lite;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0004;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6fb5a8, .35); rim.position.set(-2, 3, -4); scene.add(rim);
  const flashLight = new THREE.PointLight(0xffe2a0, 0, 3, 2); scene.add(flashLight);
  const gunLight = new THREE.SpotLight(0xffe8c8, 26, 2.6, .55, .7, 1.6);
  scene.add(gunLight, gunLight.target);

  /* ---------------- shell rack ---------------- */
  const rack = part("RACK").clone(); restyle(rack);
  place(rack, { x: -.98, y: COUNTER_Y, z: .66 }); room.add(rack);
  const rackBox = new THREE.Box3().setFromObject(rack);
  const holeX = i => rackBox.min.x + (rackBox.max.x - rackBox.min.x) * (.05 + i * .1);
  const shellMats = {};
  const shellProto = {};
  for (const kind of ["live", "blank"]) {
    const s = part("SHELL_" + kind).clone();
    s.traverse(o => { if (o.isMesh) { o.castShadow = true;
      const swap = m => m.name.startsWith("brass") ? M.brass : m;
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); } });
    s.scale.setScalar(1.6);
    shellProto[kind] = s;
  }
  let rackShells = [];
  function setRack(live, blank, animate) {
    const want = [...Array(live).fill("live"), ...Array(blank).fill("blank")].slice(0, 10);
    /* keep matching shells, lift out the extras, drop in the new */
    const keep = [];
    rackShells.forEach((s, i) => {
      if (want[i] === s.kind) keep.push(s);
      else { s.state = "out"; s.life = 0; }
    });
    const kept = new Set(keep);
    const leaving = rackShells.filter(s => !kept.has(s));
    rackShells = [];
    want.forEach((kind, i) => {
      let s = keep.find(k => k.idx === i && k.kind === kind);
      if (!s) {
        const m = shellProto[kind].clone();
        s = { kind, mesh: m, idx: i, y: { x: animate ? 1.2 + i * .12 : 0, v: 0 }, state: "in" };
        room.add(m);
      }
      s.idx = i;
      rackShells.push(s);
    });
    leaving.forEach(s => flying.push(s));
  }
  const flying = [];

  /* ---------------- flip tally ---------------- */
  const tally = part("TALLY").clone(); restyle(tally);
  place(tally, { x: .98, y: COUNTER_Y, z: .64 }); room.add(tally);
  const tBox = new THREE.Box3().setFromObject(tally);
  /* the rack and tally sit inside the frame on narrow screens */
  function placeProps() {
    const px = camera.aspect < 1.1 ? .62 : 1.2;
    const dr = -(camera.aspect < 1.1 ? .62 : .98) - (rackBox.min.x + rackBox.max.x) / 2;
    rack.position.x += dr; rackBox.translate(new THREE.Vector3(dr, 0, 0));
    const dt_ = px - (tBox.min.x + tBox.max.x) / 2;
    tally.position.x += dt_; tBox.translate(new THREE.Vector3(dt_, 0, 0));
    for (const cd of cards) cd.pivot.position.x += dt_;
  }
  const cards = [];
  const cardFace = (label, value) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 320;
    const c = cv.getContext("2d");
    c.fillStyle = INKS[4].base; c.fillRect(0, 0, 256, 320);
    grain(c, 256, 320, .05);
    c.fillStyle = INKS[0].base; c.textAlign = "center";
    c.font = '600 44px "Barlow Semi Condensed", sans-serif'; c.fillText(label, 128, 58);
    c.font = '210px "Rye", Georgia, serif'; c.textBaseline = "alphabetic";
    c.fillStyle = label === "LIVE" ? INKS[2].base : INKS[0].base;
    c.fillText(String(value), 128, 282);
    c.fillStyle = "rgba(20,16,13,.6)"; c.fillRect(0, 158, 256, 4);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  ["ROUND", "LIVE", "BLANK"].forEach((label, i) => {
    const w = (tBox.max.x - tBox.min.x) * .245, h = w * 1.25;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: cardFace(label, 0), roughness: .7 }));
    const pivot = new THREE.Group();
    pivot.position.set(tBox.min.x + (tBox.max.x - tBox.min.x) * (.2 + i * .3) - .015, tBox.min.y + (tBox.max.y - tBox.min.y) * .55, tBox.max.z - .02);
    pivot.add(m); room.add(pivot);
    cards.push({ label, pivot, mesh: m, value: 0, queue: null, rot: { x: 0, v: 0 }, phase: 0 });
  });
  placeProps();
  function setTally(round, live, blank, cascade = true) {
    const vals = [round, live, blank];
    cards.forEach((cd, i) => {
      if (cd.value === vals[i] && !cd.phase) return;
      if (cd.phase && cd.next === vals[i]) return;
      cd.next = vals[i];
      cd.delay = cascade && !reduced() ? i * .09 : 0;
      cd.phase = 1;
    });
  }

  /* ---------------- the revolver: real scale, in somebody's hand ---------------- */
  const GUN_SCALE = 1.15;
  const gunHolder = new THREE.Group(); scene.add(gunHolder);
  const gunInner = new THREE.Group(); gunInner.rotation.y = Math.PI; gunHolder.add(gunInner);
  let gunMesh = null, gunMat = null, gunLook = null;
  const muzzle = new THREE.Object3D(); gunHolder.add(muzzle);
  /* the hammer is its own part so the cock reads before the pull */
  const hammer = new THREE.Group(); gunHolder.add(hammer);
  const hammerMesh = new THREE.Mesh(new THREE.BoxGeometry(.008, .026, .012), M.brass);
  hammerMesh.position.set(0, .013, 0); hammer.add(hammerMesh);
  hammer.position.set(0, .085, -.06);
  const cock = { x: 0, v: 0 }; let cockTarget = 0;
  const spinRoll = { x: 0, v: 0 };
  function setGun(look) {
    const key = `${look.gun}:${look.finish}`;
    if (gunLook === key) return;
    gunLook = key;
    if (gunMesh) gunInner.remove(gunMesh);
    gunMesh = part(GUN_IDS[look.gun]).clone();
    gunMat = new THREE.MeshStandardMaterial({ color: FINISH[look.finish].color, roughness: FINISH[look.finish].rough, metalness: 1, envMapIntensity: 2.4 });
    gunMesh.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const swap = m => m.name.startsWith("gunmetal") ? gunMat : m.name.startsWith("brass") ? M.brass : m;
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    gunMesh.scale.setScalar(GUN_SCALE);
    /* the grip sits in the palm: offset so the holder's origin is the grip */
    gunMesh.position.set(0, .05 * GUN_SCALE, -.07 * GUN_SCALE);
    gunInner.add(gunMesh);
    gunHolder.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(gunMesh);
    const tip = gunHolder.worldToLocal(new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z));
    const far = gunHolder.worldToLocal(new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.min.z));
    muzzle.position.set(0, .07, Math.max(tip.z, far.z));
  }
  const gunRest = new THREE.Vector3(0, COUNTER_Y + .035, .5);
  const gun = { mode: "rest", holder: null, t: 0, dur: .65, from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };
  const kick = { x: 0, v: 0 };

  /* ---------------- the cast: automatons on the booth stage ---------------- */
  const STAGE_Z = -.95;
  const shieldShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-.18, .17); s.lineTo(.18, .17); s.lineTo(.18, .02);
    s.quadraticCurveTo(.17, -.12, 0, -.2); s.quadraticCurveTo(-.17, -.12, -.18, .02); s.closePath();
    return s;
  })();
  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: .012, bevelEnabled: true, bevelThickness: .006, bevelSize: .01, bevelSegments: 2, curveSegments: 16 });
  const shieldMat = [new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: .38, metalness: .9 }), new THREE.MeshStandardMaterial({ color: 0xb98a3a, roughness: .3, metalness: 1 })];
  let cast = [];        /* { pid, name, look, a (automaton), x, z } */
  const who = pid => cast.find(c => c.pid === pid);
  function makeActor(p, cap) {
    const look = p.look ? cleanLook(p.look) : seededLook(p.name);
    const a = createAutomaton({ ...p, look }, { cap, shieldGeo, shieldMat });
    a.setLives(p.lives, cap);
    a.group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    room.add(a.group);
    return { pid: p.id, name: p.name, look, a, x: 0, z: STAGE_Z };
  }
  function layoutCast() {
    const n = cast.length;
    const portrait = camera.aspect < 1.1 && mode !== "preview";
    const span = Math.min(portrait ? 2.3 : 3.9, Math.max(.9, (n - 1) * .95));
    const gap = n > 1 ? span / (n - 1) : 1;
    /* a crowded stage gets slightly smaller figures rather than overlapping ones */
    const sc = Math.min(1, gap / .62);
    cast.forEach((c, i) => {
      const u = n === 1 ? 0 : i / (n - 1) * 2 - 1;
      c.x = u * span / 2; c.z = STAGE_Z - (1 - u * u) * .32;
      c.a.group.position.set(c.x, 0, c.z);
      c.a.group.scale.setScalar(sc);
      c.a.group.rotation.y = -u * .22;
      c.sc = sc;
    });
  }
  function disposeCast() { for (const c of cast) { room.remove(c.a.group); c.a.dispose(); } cast = []; }

  /* ---------------- effects ---------------- */
  const smokeTex = tex((c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(220,210,190,.55)"); g.addColorStop(1, "rgba(220,210,190,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 64, 64);
  const flashTex = tex((c, w, h) => {
    c.translate(w / 2, h / 2);
    for (let i = 0; i < 9; i++) {
      c.rotate(Math.PI * 2 / 9);
      const g = c.createLinearGradient(0, 0, w / 2, 0);
      g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(.4, "rgba(255,190,80,.8)"); g.addColorStop(1, "rgba(255,120,30,0)");
      c.fillStyle = g; c.beginPath(); c.moveTo(0, -6); c.lineTo(w / 2 * (.6 + Math.random() * .4), 0); c.lineTo(0, 6); c.fill();
    }
  }, 128, 128);
  const sprites = [];
  function puff(pos, { tex: t = smokeTex, size = .3, grow = 1.8, life = 1.1, rise = .35, add = false } = {}) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    sp.position.copy(pos); sp.scale.setScalar(size); scene.add(sp);
    sprites.push({ sp, age: 0, life, size, grow, rise });
  }
  const sparkTex = tex((c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,248,220,1)"); g.addColorStop(.35, "rgba(255,190,80,.9)"); g.addColorStop(1, "rgba(255,120,30,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 32, 32);
  const sparkList = [];
  function sparks(at, n) {
    if (reduced()) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.copy(at); sp.scale.setScalar(.035 + Math.random() * .03); scene.add(sp);
      const a = Math.random() * Math.PI * 2, up = Math.random();
      sparkList.push({ sp, v: new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 1 + up * 2.6, Math.sin(a) * 1.2 + 1.4), life: .5 + Math.random() * .5, age: 0 });
    }
  }
  const casingGeo = new THREE.CylinderGeometry(.009, .009, .035, 10);
  function casing(from, dir) {
    const m = new THREE.Mesh(casingGeo, M.brass); m.castShadow = true;
    m.position.copy(from); scene.add(m);
    flying.push({ casing: true, mesh: m, vel: new THREE.Vector3(dir.x * .8 + (Math.random() - .5) * .4, 1.6 + Math.random() * .5, .6 + Math.random() * .3),
      spin: new THREE.Vector3(8 + Math.random() * 8, Math.random() * 6, 6), age: 0, bounces: 0 });
  }

  const _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _gp = new THREE.Vector3(), _ga = new THREE.Vector3(), _m4 = new THREE.Matrix4();
  function gunTargetFor(c, pos, quat) {
    c.a.gripPoint(pos); c.a.aimTarget(_ga);
    /* lookAt(eye = aim point, target = grip) leaves +Z pointing from the grip toward the aim */
    _m4.lookAt(_ga, pos, gunHolder.up);
    quat.setFromRotationMatrix(_m4);
  }
  function updateGun(dt) {
    const h = who(gun.holder);
    if (gun.mode === "toss" && h) {
      gun.t += dt / gun.dur;
      const u = Math.min(1, gun.t), e = u * u * (3 - 2 * u);
      gunTargetFor(h, _gp, _gq);
      gunHolder.position.lerpVectors(gun.from, _gp, e);
      gunHolder.position.y += Math.sin(Math.PI * u) * .45;
      gunHolder.quaternion.slerpQuaternions(gun.fromQ, _gq, e);
      gunHolder.rotateX(Math.sin(Math.PI * u) * Math.PI * 2 * (1 - e));
      if (u >= 1) gun.mode = "held";
    } else if (gun.mode === "held" && h) {
      gunTargetFor(h, _gp, _gq);
      gunHolder.position.copy(_gp);
      gunHolder.quaternion.copy(_gq);
    } else {
      gunHolder.position.lerp(gunRest, 1 - Math.pow(.001, dt));
      _gq.setFromEuler(new THREE.Euler(0, 1.2, Math.PI / 2));
      gunHolder.quaternion.slerp(_gq, 1 - Math.pow(.001, dt));
    }
    gunInner.rotation.x = -kick.x * .35;
    gunInner.rotation.z = spinRoll.x;
    gunHolder.updateMatrixWorld(true);
  }

  /* ---------------- camera rig ---------------- */
  const camBase = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camFocus = null, camK = { pos: .55, look: .7 }, camPush = { x: 0, v: 0 }, shake = 0, mode = opts.mode || "attract";
  let insetR = 0, insetB = 0, previewFocus = "target";
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  function frameCamera() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const a = (w - insetR) / h;
    /* the projection spans the virtual frame (canvas plus insets) so nothing stretches */
    camera.aspect = (w + insetR) / h;
    if (mode === "preview") {
      camera.fov = 30;
      const T = Math.tan(THREE.MathUtils.degToRad(15));
      const gun = previewFocus === "gun";
      /* the whole figure, hat to knees; for the gun, the hand and revolver with some arm */
      const centre = gun ? gunHolder.position.clone() : vec(0, 1.32, STAGE_Z);
      const W = gun ? .8 : 1.0, H = gun ? .5 : 1.95;
      /* distance that fits the object in the uncovered width and height */
      const d = Math.max(W * h / (2 * T * Math.max(1, w - insetR)), H * h / (2 * T * Math.max(1, h - insetB)));
      const half = d * T, lift = gun ? .18 : .08;
      camBase.pos.set(centre.x, centre.y + lift, centre.z + d);
      /* centre it in the region above a bottom sheet */
      camBase.look.set(centre.x, centre.y - (insetB / h) * half, centre.z);
    } else if (a < 1.1) {
      /* portrait: back off until the whole rail fits the width; the rail is the hero */
      camera.fov = 46;
      const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(23)) * a);
      const dist = 1.62 / Math.tan(hf);
      /* the row of figures sets the distance; tilt so the counter meets the controls and the awning takes the slack */
      camBase.pos.set(0, 2.7, STAGE_Z + dist);
      camBase.look.set(0, 2.08, STAGE_Z);
    } else if (mode === "attract") {
      camera.fov = 40;
      camBase.pos.set(0, 1.62, 3.9);
      camBase.look.set(0, 1.5, -1.4);
    } else {
      camera.fov = a > 1.9 ? 34 : 38;
      camBase.pos.set(0, 1.8, 3.55);
      camBase.look.set(0, 1.72, -1.4);
    }
    if (insetB > 0 && mode !== "preview") {
      const k = Math.min(.7, insetB / h);
      const off = new THREE.Vector3().subVectors(camBase.pos, camBase.look);
      const back = Math.sqrt(1 / (1 - k));
      camBase.pos.copy(camBase.look).addScaledVector(off, back);
      camBase.look.y -= k * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * off.length() * back;
    }
    /* the ledger strip covers the right edge: centre the booth in what's left */
    if (insetR > 0) camera.setViewOffset(w + insetR, h, insetR, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (typeof layoutCast === "function" && cast) layoutCast();
    if (typeof placeProps === "function") placeProps();
  }
  const ro = new ResizeObserver(frameCamera); ro.observe(host);
  frameCamera();
  camPos.copy(camBase.pos); camLook.copy(camBase.look);

  /* ---------------- frame loop ---------------- */
  const clock = new THREE.Clock();
  let raf = 0, t0 = 0, listeners = [], afterRender = null, running = true;
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const gravity = -9.8;

  /* physics runs at a fixed 60 Hz whatever the frame rate, so a slow phone
     sees the same motion at fewer frames, never slow motion */
  const H = 1 / 60;
  let acc = 0;
  /* adaptive quality: if frames run long, step render resolution down, then
     drop shadows; physics is fixed-step so gameplay timing never changes */
  const perf = { frames: 0, time: 0, level: 0, ratio: renderer.getPixelRatio() };
  function adapt(dt) {
    if (perf.level >= 3 || document.hidden) return;
    perf.frames++; perf.time += dt;
    /* judge over about 3 seconds, and never on fewer than 3 frames */
    if (perf.time < 3 || perf.frames < 3) return;
    const avg = perf.time / perf.frames;
    perf.frames = 0; perf.time = 0;
    if (avg < 1 / 40) return;
    perf.level++;
    if (perf.level < 3) {
      perf.ratio = Math.max(.75, perf.ratio * .75);
      renderer.setPixelRatio(perf.ratio);
      frameCamera();
    } else {
      renderer.shadowMap.enabled = false;
      scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    }
  }
  function step() {
    raf = requestAnimationFrame(step);
    if (!running) return;
    const raw = clock.getDelta();
    adapt(Math.min(raw, .5));
    acc += Math.min(raw, .25);
    let n = 0;
    while (acc >= H && n < 16) { tick(H); acc -= H; n++; }
    if (n === 16) acc = 0;
    renderer.render(scene, camera);
    if (afterRender) afterRender(renderer.domElement);
    for (const fn of listeners) fn();
  }
  function tick(dt) {
    t0 += dt;
    const rm = reduced();

    /* the cast: springs, IK, faces */
    let activeC = null;
    for (const c of cast) { c.a.update(dt, t0, rm); if (c.pid === activePid) activeC = c; }
    /* key light follows whoever holds the turn */
    if (activeC) {
      activeC.a.chestPoint(tmpV);
      key.target.position.lerp(tmpV, 1 - Math.pow(.001, dt));
      key.position.lerp(tmpV2.set(activeC.x * .6, 2.55, 1.3), 1 - Math.pow(.01, dt));
      key.intensity += ((pulling ? 95 : 70) - key.intensity) * Math.min(1, dt * 4);
    } else {
      key.target.position.lerp(tmpV.set(0, 1.4, STAGE_Z), 1 - Math.pow(.01, dt));
      key.intensity += (35 - key.intensity) * Math.min(1, dt * 3);
    }
    /* your turn: your figure's eyes and torso hunt across the others until you take hold of one */
    if (sweeping && !previewT && !pulling) {
      const h = who(gun.holder), live = cast.filter(c => c.a.alive && c.pid !== gun.holder);
      if (h && live.length) {
        const xs = live.map(c => c.x), lo = Math.min(...xs), hi = Math.max(...xs);
        const k = rm ? .5 : (Math.sin(t0 * .9) + 1) / 2;
        tmpV.set(lo + (hi - lo) * k, 1.45, STAGE_Z);
        h.a.setAimPoint(tmpV); h.a.lookAt(tmpV);
      }
    }
    spring(kick, 0, 160, 14, dt);
    spring(cock, cockTarget, 220, 16, dt);
    spring(spinRoll, 0, 8, 2.2, dt);
    hammer.rotation.x = cock.x;
    updateGun(dt);
    gunLight.position.set(gunHolder.position.x + .35, gunHolder.position.y + .9, gunHolder.position.z + .8);
    gunLight.target.position.copy(gunHolder.position);

    /* rack shells drop into their holes */
    for (const s of rackShells) {
      spring(s.y, 0, 120, 13, dt);
      if (s.y.x < 0) { s.y.x = 0; s.y.v *= -.3; }
      s.mesh.position.set(holeX(s.idx), COUNTER_Y + .02 + s.y.x, (rackBox.min.z + rackBox.max.z) / 2);
    }
    /* anything airborne: lifted shells, casings */
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      if (f.casing) {
        f.age += dt;
        f.vel.y += gravity * dt;
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.z += f.spin.z * dt;
        if (f.mesh.position.y < COUNTER_Y + .02 && f.vel.y < 0 && f.mesh.position.z > -.05) {
          f.mesh.position.y = COUNTER_Y + .02; f.vel.y *= -.42; f.vel.x *= .7; f.vel.z *= .7; f.spin.multiplyScalar(.6);
          if (f.bounces++ < 3) emit("tink");
        }
        if (f.age > 3.2) { scene.remove(f.mesh); flying.splice(i, 1); }
      } else {
        /* a spent rack shell lifts out and is palmed away by the barker */
        f.life += dt;
        f.mesh.position.y += dt * .25;
        f.mesh.scale.setScalar(1.6 * Math.max(0, 1 - f.life / .45));
        if (f.life > .45) { room.remove(f.mesh); flying.splice(i, 1); }
      }
    }
    /* tally cards: half-flip, swap face, half-flip back */
    for (const cd of cards) {
      if (!cd.phase) continue;
      if (cd.delay > 0) { cd.delay -= dt; continue; }
      const speed = rm ? 100 : 14;
      if (cd.phase === 1) {
        cd.pivot.rotation.x -= dt * speed;
        if (cd.pivot.rotation.x <= -Math.PI / 2) {
          cd.mesh.material.map.dispose();
          cd.mesh.material.map = cardFace(cd.label, cd.next); cd.mesh.material.needsUpdate = true;
          cd.value = cd.next; cd.phase = 2; cd.pivot.rotation.x = Math.PI / 2;
          emit("flip");
        }
      } else {
        cd.pivot.rotation.x -= dt * speed;
        if (cd.pivot.rotation.x <= 0) { cd.pivot.rotation.x = 0; cd.phase = 0; }
      }
    }
    /* sprites */
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i]; s.age += dt;
      const k = s.age / s.life;
      s.sp.scale.setScalar(s.size * (1 + (s.grow - 1) * k));
      s.sp.position.y += s.rise * dt;
      s.sp.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { scene.remove(s.sp); s.sp.material.dispose(); sprites.splice(i, 1); }
    }
    flashLight.intensity *= Math.pow(.0005, dt);
    for (let i = sparkList.length - 1; i >= 0; i--) {
      const k = sparkList[i]; k.age += dt;
      k.v.y += gravity * dt; k.sp.position.addScaledVector(k.v, dt);
      k.sp.material.opacity = Math.max(0, 1 - k.age / k.life);
      if (k.age >= k.life) { scene.remove(k.sp); k.sp.material.dispose(); sparkList.splice(i, 1); }
    }

    /* bulbs */
    spring(bulbLevel, bulbMode === "dim" ? .18 : 1, 30, 9, dt);
    const n = bulbPts.length;
    for (let i = 0; i < n; i++) {
      let v;
      if (bulbMode === "chase" && !rm) v = ((i + Math.floor(t0 * 9)) % 4 === 0) ? 1.25 : .28;
      else if (bulbMode === "chase") v = .9 + .25 * Math.sin(t0 * 4);
      else if (bulbMode === "full") v = 1.25;
      else v = .82 + .04 * Math.sin(t0 * 2.3 + i * 1.7);
      v *= bulbLevel.x;
      bulbs.instanceColor.setXYZ(i, bulbWarm.r * v, bulbWarm.g * v, bulbWarm.b * v);
      haloCol[i * 3] = v * .9; haloCol[i * 3 + 1] = v * .75; haloCol[i * 3 + 2] = v * .45;
    }
    bulbs.instanceColor.needsUpdate = true;
    haloGeo.attributes.color.needsUpdate = true;
    marqueeLight.intensity = 7 * bulbLevel.x;
    for (const l of valLights) l.intensity = 3.2 * bulbLevel.x;

    /* camera: base pose, push toward the pull, a little handheld life, shake */
    spring(camPush, camFocus ? 1 : 0, 9, 5.5, dt);
    const push = rm ? 0 : camPush.x;
    tmpV.copy(camBase.pos);
    tmpV2.copy(camBase.look);
    if (camFocus && push > 0) {
      /* director beats: travel toward the focus, keeping the same height relation to it */
      tmpV.lerp(new THREE.Vector3(camFocus.x * .45, camFocus.y + .3, camFocus.z + 3.75), push * camK.pos);
      tmpV2.lerp(camFocus, push * camK.look);
    }
    if (!rm) { tmpV.x += Math.sin(t0 * .4) * .02; tmpV.y += Math.sin(t0 * .53) * .012; }
    const glide = 1 - Math.pow(rm ? 1e-9 : .004, dt);
    camPos.lerp(tmpV, glide); camLook.lerp(tmpV2, glide);
    camera.position.copy(camPos);
    if (shake > 0 && !rm) {
      camera.position.x += (Math.random() - .5) * shake * .06; camera.position.y += (Math.random() - .5) * shake * .05;
      shake *= Math.pow(.004, dt);
    }
    camera.lookAt(camLook);
  }
  raf = requestAnimationFrame(step);

  const emitters = {};
  function emit(e, d) { emitters[e]?.(d); }

  let activePid = null, pulling = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let sweeping = false, previewT = null;
  const beatK = () => camera.aspect < 1.1 ? { pos: .4, look: .55 } : { pos: .32, look: .48 };
  const headOf = c => c.a.headPoint(new THREE.Vector3());
  function everyoneLook(at, except) { for (const c of cast) if (c !== except && c.a.alive) c.a.lookAt(at); }
  function settle() {
    const h = who(gun.holder);
    for (const c of cast) {
      if (!c.a.alive) continue;
      if (c === h) { c.a.setPose(mode === "preview" ? "present" : "hold"); c.a.feel(mode === "preview" ? "smug" : "focus"); }
      else { c.a.setPose("idle"); c.a.feel("neutral"); }
    }
    if (h && mode !== "preview") everyoneLook(headOf(h), h);
  }

  /* ---------------- public stage API ---------------- */
  const stage = {
    kind: "3d",
    canvas: renderer.domElement,
    on(e, fn) { emitters[e] = fn; },
    onFrame(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; },
    setAfterRender(fn) { afterRender = fn; },
    setMode(m) { mode = m; frameCamera(); settle(); },
    setInset(r = 0, b = 0) { insetR = Math.max(0, r | 0); insetB = Math.max(0, b | 0); frameCamera(); },
    /* paint shop: "target" or "gun" */
    setPreviewFocus(f) { if (previewFocus !== f) { previewFocus = f; frameCamera(); } },
    setAwning(ink) {
      stripeInk = ink;
      M.wall.map = stripeTex(ink); M.wall.needsUpdate = true;
      const v = stripeTex(ink, false); v.repeat.set(9, 1); valMat.map = v; valMat.needsUpdate = true;
    },
    setSign(text) { paintSign(text); },
    /* players: [{id,name,look,lives,alive}] */
    setPlayers(players, cap = 3) {
      const keep = gun.holder;
      disposeCast();
      cast = players.map(p => makeActor(p, cap));
      for (const c of cast) c.a.setAlive(players.find(q => q.id === c.pid).alive !== false);
      layoutCast();
      gun.holder = who(keep) ? keep : null;
      if (!gun.holder) gun.mode = "rest";
      else { who(gun.holder).a.setHolding(true); gun.mode = "held"; }
      settle();
    },
    update(pub) {
      for (const p of pub.players) {
        const c = who(p.id); if (!c) continue;
        c.a.setLives(p.lives, pub.rules?.lives ?? 3);
        c.a.setAlive(p.alive);
        c.a.setShield(!!p.shield);
        c.a.setCuffed(!!p.cuffed);
      }
    },
    setActive(pid) { activePid = pid; },
    setLook(pid, look) {
      const c = who(pid); if (!c) return;
      const p = { id: pid, name: c.name, look, lives: 3, alive: c.a.alive };
      room.remove(c.a.group); c.a.dispose();
      Object.assign(c, makeActor(p, 3));
      layoutCast(); settle();
    },
    /* custody: the gun goes to the holder's hand, tossed across the stage when it changes hands */
    async giveGun(pid, look, animate = true) {
      const c = who(pid);
      setGun(look || c?.look || seededLook("house"));
      const prev = who(gun.holder);
      if (prev && prev !== c) { prev.a.setHolding(false); if (prev.a.alive) { prev.a.setPose("idle"); prev.a.feel("neutral"); } }
      gun.holder = c ? pid : null;
      if (!c) { gun.mode = "rest"; return; }
      c.a.setHolding(true);
      if (animate && prev && prev !== c && !reduced()) {
        gun.mode = "toss"; gun.t = 0; gun.from.copy(gunHolder.position); gun.fromQ.copy(gunHolder.quaternion);
      } else gun.mode = "held";
      settle();
      if (animate) await sleep(reduced() ? 120 : 620);
    },
    setBulbs(m) { bulbMode = m; },
    /* your turn: you hold the gun and look the room over */
    sweep(on) { sweeping = !!on; if (!on && !previewT && !pulling) settle(); },
    preview(tid) {
      const h = who(gun.holder), t = who(tid);
      if (!h || !t) return;
      previewT = t;
      if (t === h) { h.a.setPose("aimSelf"); h.a.feel("dread"); everyoneLook(headOf(h), h); }
      else {
        h.a.setPose("aim", t.a.chestPoint(new THREE.Vector3())); h.a.feel("focus"); h.a.lookAt(headOf(t));
        t.a.setPose("scared"); t.a.feel("scared"); t.a.lookAt(headOf(h));
        for (const c of cast) if (c !== h && c !== t && c.a.alive) { c.a.feel("nervous"); c.a.lookAt(headOf(t)); }
      }
      cockTarget = -.85; bulbMode = "dim";
    },
    unpreview() {
      previewT = null; cockTarget = 0;
      if (!pulling) { bulbMode = sweeping ? "chase" : "steady"; settle(); }
    },
    /* a director beat: the camera leans in on a figure (or the shell rack) for a moment */
    async beat(on, ms = 700) {
      if (reduced()) return sleep(Math.min(ms, 250));
      if (on === "rack") camFocus = rackBox.getCenter(new THREE.Vector3()).add(vec(0, .25, -.4));
      else { const c = who(on); if (!c) return; camFocus = headOf(c).add(vec(0, -.15, 0)); }
      camK = beatK();
      await sleep(ms);
      if (!pulling) camFocus = null;
    },
    round(round, live, blank) {
      setRack(live, blank, true);
      setTally(round, live, blank);
    },
    counts(round, live, blank) { setRack(live, blank, false); setTally(round, live, blank); },
    async aim(pid, tid, ms) {
      const sh = who(pid), t = who(tid);
      if (!sh || !t) return;
      pulling = true;
      previewT = null;
      cockTarget = -.85;
      if (sh === t) {
        sh.a.setPose("aimSelf"); sh.a.feel("dread");
        for (const c of cast) if (c !== sh && c.a.alive) { c.a.feel("nervous"); c.a.setPose("nervous"); c.a.lookAt(headOf(sh)); }
        camFocus = headOf(sh);
      } else {
        sh.a.setPose("aim", t.a.chestPoint(new THREE.Vector3())); sh.a.feel("focus"); sh.a.lookAt(headOf(t));
        t.a.setPose("scared"); t.a.feel("scared"); t.a.lookAt(headOf(sh));
        for (const c of cast) if (c !== sh && c !== t && c.a.alive) { c.a.feel("nervous"); c.a.lookAt(headOf(t)); }
        /* frame the shooter and the target together */
        camFocus = headOf(sh).lerp(headOf(t), .55);
      }
      camK = beatK();
      bulbMode = "dim";
      await sleep(ms ?? (reduced() ? 300 : 1250));
    },
    async fire(ev) {
      const { tid, live, shielded, killed } = ev;
      const sh = who(ev.pid ?? gun.holder), t = who(tid), self = sh && sh === t;
      const mp = muzzle.getWorldPosition(new THREE.Vector3());
      cockTarget = 0; cock.v = 40;
      if (live) {
        flashLight.position.copy(mp); flashLight.intensity = reduced() ? 4 : 14;
        if (!reduced()) puff(mp, { tex: flashTex, size: .3, grow: 1.4, life: .12, rise: 0, add: true });
        puff(mp, { size: .16, grow: 3, life: 1.2 });
        kick.v = reduced() ? 2 : 9;
        shake = reduced() ? 0 : 1;
        sh?.a.impulse("recoil");
        casing(gunHolder.position.clone(), vec(1, 0, 0));
        if (t) {
          const hitAt = self ? headOf(t) : t.a.chestPoint(new THREE.Vector3());
          if (shielded) {
            sparks(hitAt.add(vec(0, 0, .2)), 18);
            t.a.impulse("shudder"); t.a.feel("shock", 700, "relief");
          } else {
            sparks(hitAt, killed ? 40 : 26);
            t.a.impulse(self ? "headhit" : "hit");
            t.a.feel("hurt", 1100, killed ? "out" : "nervous");
            if (killed) setTimeout(() => {
              t.a.setAlive(false);
              puff(headOf(t).add(vec(0, .2, 0)), { size: .22, grow: 3.4, life: 2.2, rise: .5 });
            }, reduced() ? 150 : 650);
            if (!self && sh) sh.a.feel("smug", 1300, "focus");
          }
          for (const c of cast) if (c !== t && c !== sh && c.a.alive) c.a.feel("shock", 900, "nervous");
        }
      } else {
        puff(mp, { size: .08, grow: 2.2, life: 1 });
        kick.v = 1.5;
        if (t) {
          t.a.impulse("shudder");
          if (self) t.a.feel("relief", 1200, "smug");
          else { t.a.feel("relief", 1300, "neutral"); sh?.a.feel("focus"); }
        }
      }
      await sleep(reduced() ? 500 : 1100);
      pulling = false;
      camFocus = null;
      bulbMode = "steady";
      settle();
    },
    eject(live) {
      casing(gunHolder.position.clone(), vec(1, 0, 0));
      return live;
    },
    spin() { spinRoll.v += 40; },
    cheer(pid) {
      const c = who(pid); if (!c) return;
      c.a.setPose("cheer"); c.a.feel("joy");
      let n = 0;
      const hop = () => { if (n++ > 4) return; c.a.impulse("hop"); setTimeout(hop, 520); };
      if (!reduced()) hop();
      for (const o of cast) if (o !== c && o.a.alive) { o.a.feel("hurt"); o.a.lookAt(headOf(c)); }
      activePid = pid; bulbMode = "full";
    },
    /* where a target sits on screen, for the accessible hit buttons and tags */    /* where a target sits on screen, for the accessible hit buttons and tags */
    screenBox(pid) {
      const c = who(pid); if (!c) return null;
      const w = host.clientWidth, h = host.clientHeight;
      const top = c.a.headTop(new THREE.Vector3()).project(camera);
      const bot = vec(c.x, COUNTER_Y + .05, c.z).project(camera);
      const side = vec(c.x + .3 * (c.sc || 1), 1.3, c.z).project(camera);
      const cx = (top.x + 1) / 2 * w, y0 = (1 - top.y) / 2 * h - 6, y1 = (1 - bot.y) / 2 * h;
      const hw = Math.abs((side.x + 1) / 2 * w - (bot.x + 1) / 2 * w);
      return { x: cx - hw, y: y0, w: hw * 2, h: Math.max(40, y1 - y0), down: !c.a.alive };
    },
    pause(on) { running = !on; if (!on) clock.getDelta(); },
    /* draw cost of the last frame, for performance checks */
    stats() {
      const r = renderer.info.render; let meshes = 0, castMeshes = 0, figMeshes = 0;
      scene.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isSprite) { meshes++; if (o.castShadow) castMeshes++; } });
      for (const c of cast) c.a.group.traverseVisible(o => { if (o.isMesh) figMeshes++; });
      return { calls: r.calls, triangles: r.triangles, meshes, castMeshes, figMeshes, figures: cast.length, quality: perf.level, pixelRatio: renderer.getPixelRatio() };
    },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.dispose(); renderer.domElement.remove();
    }
  };
  setGun({ gun: 1, finish: 1 });
  return stage;
}
