/* Room flow against a live server: friends who join before the deal get
   seats, a mid-game arrival watches and is seated at the next deal, and a
   lone host isn't dealt in until they ask. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const PORT = 4300 + Math.floor(Math.random() * 500);
let srv;
before(async () => {
  srv = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${PORT}/`); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
});
after(() => srv?.kill());

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, name, msgs: [], you: undefined, pending: false, state: null };
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    c.msgs.push(m);
    if (m.t === "begin") { c.you = m.you; c.pending = !!m.pending; c.state = m.state; }
    if (m.t === "ev") c.state = m.state;
    c.onMsg?.(m);
  });
  c.open = new Promise(r => ws.on("open", r));
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = (pred, ms = 8000) => new Promise((res, rej) => {
    const hit = c.msgs.find(pred); if (hit) return res(hit);
    const t = setTimeout(() => rej(new Error(`${name}: timed out`)), ms);
    const prev = c.onMsg;
    c.onMsg = m => { prev?.(m); if (pred(m)) { clearTimeout(t); c.onMsg = prev; res(m); } };
  });
  return c;
}
/* whoever holds the gun shoots the next player until the game ends */
function autoplay(...cs) {
  for (const c of cs) {
    const prev = c.onMsg;
    c.onMsg = m => {
      prev?.(m);
      const st = c.state;
      if (!st || st.over || c.you == null || st.turn !== c.you) return;
      const other = st.players.find(p => p.alive && p.id !== c.you);
      setTimeout(() => c.send({ t: "shoot", tid: other.id }), 5);
    };
  }
}

test("friends seat before the deal; a late arrival plays the next game", async () => {
  const host = client("host"), g1 = client("g1"), g2 = client("g2");
  await host.open; host.send({ t: "create", name: "Host" });
  const ros = await host.wait(m => m.t === "roster");
  await g1.open; g1.send({ t: "join", code: ros.code, name: "Guest One" });
  await host.wait(m => m.t === "roster" && m.players.length === 2);
  assert.equal(host.msgs.some(m => m.t === "begin"), false, "nobody is dealt in until the host deals");

  host.send({ t: "start", bots: 0 });
  await g1.wait(m => m.t === "begin");
  assert.equal(g1.you, 1, "the friend who joined first has a seat");
  assert.equal(g1.state.players.filter(p => p.bot).length, 0, "no bots were added to a two-player table");

  await g2.open; g2.send({ t: "join", code: ros.code, name: "Late Lou" });
  await g2.wait(m => m.t === "begin");
  assert.equal(g2.you, null, "mid-game you watch...");
  assert.equal(g2.pending, true, "...and you're told you're in next game");

  if (host.state.turn === host.you) host.send({ t: "shoot", tid: 1 });
  autoplay(host, g1);
  await host.wait(m => m.t === "ev" && m.state.over, 30000);

  host.send({ t: "again" });
  const b2 = await g2.wait(m => m.t === "begin" && m.you != null);
  assert.ok(b2.state.players.some(p => p.name === "Late Lou" && !p.bot), "the late arrival is seated in the next game");
  for (const c of [host, g1, g2]) c.ws.close();
});

test("a lone host still gets a bot to play against", async () => {
  const host = client("solo");
  await host.open; host.send({ t: "create", name: "Alone" });
  await host.wait(m => m.t === "roster");
  host.send({ t: "start", bots: 0 });
  const b = await host.wait(m => m.t === "begin");
  assert.equal(b.state.players.length, 2);
  host.ws.close();
});
