/* The booth, lite: layered 2.5D for phones that can't run the 3D booth.
   Same stage API as booth3d.mjs. Painted tin targets swing on CSS 3D hinges,
   the gun rides the counter track, the tally flips, the bulbs chase. */

import { INKS, paintTarget, seededLook, cleanLook, fontsReady } from "./world.mjs";

function spring(s, target, k, d, dt) { const a = (target - s.x) * k - s.v * d; s.v += a * dt; s.x += s.v * dt; }
const FINISH = ["#2b3038", "#b9893a", "#c9c6bd"];

export async function createBooth2D(host, opts = {}) {
  await fontsReady();
  const reduced = () => document.documentElement.dataset.motion === "reduce";
  const root = document.createElement("div");
  root.className = "b2d";
  root.setAttribute("aria-hidden", "true");
  host.prepend(root);
  const css = document.createElement("style");
  css.textContent = `
  .b2d{position:absolute;inset:0;overflow:hidden;background:var(--soot-deep)}
  .b2d .wall{position:absolute;inset:0;background:repeating-linear-gradient(90deg,var(--stripe) 0 6vw,var(--cream-deep) 6vw 12vw);filter:brightness(.38) saturate(.9)}
  .b2d .valance{position:absolute;left:-2%;right:-2%;top:0;height:9vh;background:repeating-linear-gradient(90deg,var(--stripe) 0 6vw,var(--cream) 6vw 12vw);
    -webkit-mask:radial-gradient(3vw 2.2vh at 3vw 0,#000 98%,transparent) 0 100%/6vw 100% repeat-x,linear-gradient(#000,#000) 0 0/100% 70% no-repeat;
            mask:radial-gradient(3vw 2.2vh at 3vw 0,#000 98%,transparent) 0 100%/6vw 100% repeat-x,linear-gradient(#000,#000) 0 0/100% 70% no-repeat;filter:brightness(.85)}
  .b2d .sign{position:absolute;left:50%;top:10vh;width:min(70vw,620px);transform:translateX(-50%);border-radius:40% 40% 8px 8px/30% 30% 8px 8px;box-shadow:0 0 0 6px var(--teal-deep),0 20px 40px rgba(0,0,0,.6)}
  .b2d .bulbs{position:absolute;inset:0;pointer-events:none}
  .b2d .bulb{position:absolute;width:9px;height:9px;margin:-4px;border-radius:50%;background:#ffe2a0;box-shadow:0 0 10px 3px rgba(255,190,90,.55)}
  .b2d .bulb.off{background:#6b5530;box-shadow:none}
  .b2d .rail{position:absolute;left:4%;right:4%;height:1.2vh;border-radius:1vh;background:linear-gradient(#e9c27a,#8a6224);box-shadow:0 .8vh 0 #3b2414,0 1.6vh 14px rgba(0,0,0,.5)}
  .b2d .tg{position:absolute;transform-origin:50% 100%;transform-style:preserve-3d}
  .b2d .tg canvas{display:block;width:100%;height:auto;filter:drop-shadow(0 8px 6px rgba(0,0,0,.5))}
  .b2d .key{position:absolute;width:30vw;height:60vh;transform:translate(-50%,-30%);background:radial-gradient(closest-side,rgba(255,236,190,.26),transparent);pointer-events:none;transition:left .5s cubic-bezier(.16,1,.3,1)}
  .b2d .counter{position:absolute;left:-2%;right:-2%;bottom:0;height:26vh;background:linear-gradient(#5a3a22,#3b2414 12%,#2a190d 14%,var(--teal-deep) 14%,var(--teal) 70%,var(--teal-deep));box-shadow:0 -10px 30px rgba(0,0,0,.5)}
  .b2d .track{position:absolute;left:8%;right:8%;bottom:23.4vh;height:4px;background:#c99b45;border-radius:2px}
  .b2d .gun{position:absolute;bottom:23vh;width:min(22vw,150px);transform-origin:20% 70%}
  .b2d .rack{position:absolute;left:6%;bottom:23vh;display:flex;gap:4px;padding:4px 8px;background:#4a2c18;border-radius:3px}
  .b2d .sh{width:10px;height:30px;border-radius:5px 5px 2px 2px;border:2px solid #14100d;transition:transform .5s cubic-bezier(.16,1,.3,1)}
  .b2d .sh.live{background:linear-gradient(#b8321f 0 30%,#14100d 30% 38%,#b8321f 38% 58%,#14100d 58% 66%,#b8321f 66% 80%,#b9893a 80%)}
  .b2d .sh.blank{background:linear-gradient(#f2dfb4 0 80%,#b9893a 80%);border-top-style:dashed}
  .b2d .tally{position:absolute;right:6%;bottom:23vh;display:flex;gap:4px;padding:6px;background:#2b3038;border-radius:6px}
  .b2d .card{width:44px;padding:3px 0 1px;text-align:center;background:var(--cream);color:var(--soot);border-radius:3px;font:600 9px var(--ui);letter-spacing:.08em;transition:transform .12s}
  .b2d .card b{display:block;font:400 26px/1 var(--display)}
  .b2d .card.flip{transform:rotateX(90deg)}
  .b2d .smoke{position:absolute;width:40px;height:40px;margin:-20px;border-radius:50%;background:radial-gradient(rgba(220,210,190,.6),transparent 70%);animation:b2dsmoke 1s ease-out forwards;pointer-events:none}
  @keyframes b2dsmoke{to{transform:translateY(-40px) scale(2.4);opacity:0}}
  @media (max-aspect-ratio:4/5){.b2d .sign{top:8vh;width:88vw}.b2d .counter{height:30vh}.b2d .track,.b2d .gun,.b2d .rack,.b2d .tally{bottom:27vh}}
  `;
  root.appendChild(css);
  const el = (cls, parent = root, tag = "div") => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  let stripe = INKS[opts.awning ?? 1].base;
  root.style.setProperty("--stripe", stripe);
  el("wall");
  const key = el("key");
  el("valance");
  const sign = el("sign", root, "canvas");
  sign.width = 1200; sign.height = 360;
  const paintSign = (text = "LAST CHAMBER") => {
    const c = sign.getContext("2d"), w = 1200, h = 360;
    c.fillStyle = INKS[1].deep; c.fillRect(0, 0, w, h);
    c.strokeStyle = INKS[2].base; c.lineWidth = 20; c.strokeRect(24, 18, w - 48, h - 36);
    c.textAlign = "center"; c.textBaseline = "middle";
    let size = 150;
    c.font = `${size}px "Rye", Georgia, serif`;
    while (c.measureText(text).width > w - 160 && size > 40) { size -= 4; c.font = `${size}px "Rye", Georgia, serif`; }
    c.lineWidth = 14; c.strokeStyle = INKS[2].base; c.strokeText(text, w / 2, h * .56);
    c.fillStyle = INKS[4].base; c.fillText(text, w / 2, h * .56);
  };
  paintSign();
  const bulbWrap = el("bulbs");
  const bulbs = [];
  const placeBulbs = () => {
    bulbWrap.innerHTML = ""; bulbs.length = 0;
    const r = sign.getBoundingClientRect(), hr = root.getBoundingClientRect();
    for (let i = 0; i < 22; i++) {
      const t = i / 21, b = el("bulb", bulbWrap);
      b.style.left = (r.left - hr.left + t * r.width) + "px";
      b.style.top = (r.top - hr.top - 6 + (1 - Math.sin(Math.PI * t)) * r.height * .22) + "px";
      bulbs.push(b);
    }
  };
  const rail = el("rail");
  const tgWrap = el("tgs");
  el("counter"); el("track");
  const rack = el("rack");
  const tally = el("tally");
  const cards = ["ROUND", "LIVE", "BLANK"].map(l => { const c = el("card", tally); c.innerHTML = `${l}<b>0</b>`; return { el: c, v: 0 }; });
  const gun = el("gun", root, "div");

  let targets = [], mode = opts.mode || "attract", bulbMode = "steady", activePid = null, afterRender = null, listeners = [];
  const carX = { x: .5, v: 0 }, aimR = { x: 0, v: 0 }, kick = { x: 0, v: 0 };
  let carTarget = .5, aimTarget = 0;
  const railY = () => (window.innerWidth / window.innerHeight < .8 ? .6 : .62) * root.clientHeight;
  function layout() {
    const W = root.clientWidth, n = targets.length;
    const tw = Math.min(W * (mode === "preview" ? .36 : .16), mode === "preview" ? 260 : 150, (W * .86) / Math.max(1, n));
    const span = Math.min(W * .78, (n - 1) * tw * 1.25);
    rail.style.top = railY() + "px";
    targets.forEach((t, i) => {
      t.xf = n === 1 ? .5 : (W / 2 - span / 2 + span * i / (n - 1)) / W;
      t.el.style.width = tw + "px";
      t.el.style.left = (t.xf * W - tw / 2) + "px";
      t.el.style.top = (railY() - tw * 1.5) + "px";
    });
    placeBulbs();
  }
  const ro = new ResizeObserver(layout); ro.observe(root);

  function makeTarget(p, cap) {
    const look = p.look ? cleanLook(p.look) : seededLook(p.name);
    const t = { pid: p.id, name: p.name, look, cap, lives: p.lives, alive: p.alive, dents: [],
      ang: { x: p.alive ? 0 : 88, v: 0 }, rest: p.alive ? 0 : 88, wob: 0 };
    t.el = el("tg", tgWrap);
    t.canvas = paintTarget(p, { cap, lives: p.lives, dents: t.dents });
    t.el.appendChild(t.canvas);
    return t;
  }
  const tgt = pid => targets.find(t => t.pid === pid);
  const repaint = t => paintTarget({ name: t.name, look: t.look }, { canvas: t.canvas, cap: t.cap, lives: t.lives, dents: t.dents });
  function setGun(look) {
    const L = [26, 40, 56][look.gun ?? 1], col = FINISH[look.finish ?? 0];
    gun.innerHTML = `<svg viewBox="0 0 ${60 + L} 60" width="100%"><g fill="${col}" stroke="#0a0806" stroke-width="2">
      <path d="M54 20h${L}v8H54z"/><path d="M30 14h26v20H30z"/><circle cx="43" cy="24" r="10"/></g>
      <path d="M30 32q-2 14-12 22q-6 4-9-1l9-21z" fill="#5d3d27" stroke="#0a0806" stroke-width="2"/>
      <path d="M36 34a6 6 0 1 0 9 3" fill="none" stroke="#b9893a" stroke-width="2"/></svg>`;
  }
  setGun({ gun: 1, finish: 1 });

  let raf = 0, last = performance.now(), t0 = 0;
  function step(now) {
    raf = requestAnimationFrame(step);
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now; t0 += dt;
    const rm = reduced();
    for (const t of targets) {
      spring(t.ang, t.rest, 70, rm ? 16 : 7, dt);
      if (t.ang.x > 89) { t.ang.x = 89; t.ang.v *= -.25; }
      t.wob *= Math.pow(.02, dt);
      t.el.style.transform = `perspective(600px) rotateX(${t.ang.x}deg) rotateZ(${t.wob * Math.sin(t0 * 21) * 30}deg)`;
      t.el.style.filter = t.alive ? "" : "brightness(.55)";
    }
    const at = tgt(activePid);
    key.style.opacity = at ? 1 : 0;
    if (at) { key.style.left = at.xf * 100 + "%"; key.style.top = railY() * .55 + "px"; }
    spring(carX, carTarget, 26, 9, dt); spring(aimR, aimTarget, 40, 11, dt); spring(kick, 0, 160, 14, dt);
    gun.style.left = `calc(${carX.x * 100}% - 40px)`;
    gun.style.transform = `rotate(${-90 + aimR.x - kick.x * 20}deg)`;
    bulbs.forEach((b, i) => b.classList.toggle("off",
      bulbMode === "dim" ? true : bulbMode === "chase" && !rm ? (i + Math.floor(t0 * 9)) % 4 !== 0 : false));
    if (afterRender) afterRender(null);
    for (const fn of listeners) fn();
  }
  raf = requestAnimationFrame(step);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const emitters = {};
  function smoke(xf, yPx) { const s = el("smoke"); s.style.left = xf * 100 + "%"; s.style.top = yPx + "px"; setTimeout(() => s.remove(), 1000); }
  function flipTo(i, v) {
    const c = cards[i]; if (c.v === v) return;
    c.v = v; c.el.classList.add("flip");
    setTimeout(() => { c.el.querySelector("b").textContent = v; c.el.classList.remove("flip"); emitters.flip?.(); }, reduced() ? 0 : 120 + i * 90);
  }
  function setRack(live, blank) {
    rack.innerHTML = "";
    for (let i = 0; i < live; i++) el("sh live", rack);
    for (let i = 0; i < blank; i++) el("sh blank", rack);
  }

  return {
    kind: "2d", canvas: null,
    on(e, fn) { emitters[e] = fn; },
    onFrame(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; },
    setAfterRender(fn) { afterRender = fn; },
    setMode(m) { mode = m; layout(); },
    setInset() {},
    setAwning(ink) { root.style.setProperty("--stripe", INKS[ink].base); },
    setSign: paintSign,
    setPlayers(players, cap = 3) { tgWrap.innerHTML = ""; targets = players.map(p => makeTarget(p, cap)); layout(); },
    update(pub) {
      for (const p of pub.players) {
        const t = tgt(p.id); if (!t) continue;
        const cap = pub.rules?.lives ?? t.cap;
        if (t.lives !== p.lives || t.cap !== cap) { t.lives = p.lives; t.cap = cap; repaint(t); }
        if (t.alive !== p.alive) { t.alive = p.alive; t.rest = p.alive ? 0 : 88; }
      }
    },
    setActive(pid) { activePid = pid; },
    async giveGun(pid, look, animate = true) {
      const t = tgt(pid);
      setGun(look || t?.look || seededLook("house"));
      carTarget = t ? t.xf : .5; aimTarget = 0;
      if (!animate) carX.x = carTarget;
      if (animate) await sleep(reduced() ? 120 : 520);
    },
    setBulbs(m) { bulbMode = m; },
    round(r, live, blank) { setRack(live, blank); [r, live, blank].forEach((v, i) => flipTo(i, v)); },
    counts(r, live, blank) { if (rack.childElementCount !== live + blank) setRack(live, blank); [r, live, blank].forEach((v, i) => flipTo(i, v)); },
    async aim(pid, tid) {
      const t = tgt(tid); if (!t) return;
      aimTarget = (t.xf - carX.x) * 120;
      bulbMode = "dim";
      await sleep(reduced() ? 300 : 1250);
    },
    async fire({ tid, live, shielded, killed }) {
      const t = tgt(tid);
      if (live) {
        kick.v = reduced() ? 2 : 9;
        if (t && !shielded) {
          t.ang.v = reduced() ? 300 : 900; t.wob = .1;
          if (!killed) { t.dents.push([Math.random(), Math.random()]); t.rest = 88; setTimeout(() => { if (t.alive) { t.rest = 0; repaint(t); } }, reduced() ? 300 : 900); }
          else t.rest = 88;
        } else if (t) t.wob = .25;
      } else if (t) { t.wob = .35; kick.v = 1.5; }
      smoke(carX.x, root.clientHeight * .74);
      await sleep(reduced() ? 500 : 1100);
      bulbMode = "steady"; aimTarget = 0;
    },
    eject() { smoke(carX.x, root.clientHeight * .74); },
    spin() { aimR.v += 400; },
    cheer(pid) {
      const t = tgt(pid); if (!t) return;
      let n = 0; const hop = () => { if (n++ > 5) return; t.ang.v = -300; setTimeout(hop, 380); }; hop();
      activePid = pid; bulbMode = "full";
    },
    screenBox(pid) {
      const t = tgt(pid); if (!t) return null;
      const r = t.el.getBoundingClientRect(), hr = host.getBoundingClientRect();
      const w = r.width, h = t.canvas.offsetHeight || w * 1.5;
      return { x: r.left - hr.left, y: railY() - h, w, h, down: t.ang.x > 50 };
    },
    pause() {},
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); root.remove(); }
  };
}
