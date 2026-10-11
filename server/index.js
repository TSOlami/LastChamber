/* Last Chamber server.
   One process: static files over HTTP, game rooms over WebSocket.
   The engine in shared/engine.mjs is the single authority for online play;
   clients only ever see the public snapshot plus their own peek results. */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import * as E from "../shared/engine.mjs";
import { carnivalName, LOOK_RANGES } from "../public/js/world.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = process.env.PORT || 4173;
const BOT_DELAY = 1500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary"
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file;
  /* invite links: /KQ7R opens the game with the join sheet ready */
  if (url === "/" || url === "/index.html" || /^\/[A-Za-z0-9]{4}\/?$/.test(url)) file = path.join(PUBLIC, "index.html");
  else if (url.startsWith("/shared/")) file = path.join(ROOT, url);
  else file = path.join(PUBLIC, url);
  file = path.normalize(file);
  if (!file.startsWith(PUBLIC) && !file.startsWith(path.join(ROOT, "shared"))) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

/* ---------------- rooms ---------------- */

const rooms = new Map();          /* code -> room */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); }
  while (rooms.has(c));
  return c;
}

function makeRoom() {
  const room = {
    code: genCode(),
    clients: new Set(),           /* ws with .lc = {name, role, pid} */
    st: null,
    defs: null,
    botTimer: null
  };
  rooms.set(room.code, room);
  return room;
}

const send = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
const cast = (room, msg) => { for (const ws of room.clients) send(ws, msg); };

function roster(room) {
  const seats = [...room.clients].filter(w => w.lc.role === "seat");
  const specs = [...room.clients].filter(w => w.lc.role === "spec").length;
  /* each client hears which seat is theirs */
  for (const ws of room.clients) send(ws, {
    t: "roster",
    code: room.code,
    players: seats.map(w => ({ name: w.lc.name, look: w.lc.look, host: w.lc.host || false, you: w === ws })),
    spectators: specs,
    started: !!room.st
  });
}

function castEvents(room, events) {
  if (!events.length) return;
  cast(room, { t: "ev", events, state: E.pub(room.st) });
}

function botPump(room) {
  clearTimeout(room.botTimer);
  const st = room.st;
  if (!st || st.over) return;
  const cur = st.players[st.turn];
  if (!cur.bot) return;
  room.botTimer = setTimeout(() => {
    if (!room.st || room.st.over) return;
    const mv = E.botMove(st);
    const events = mv.a === "item"
      ? E.useItem(st, cur.id, mv.idx).ev
      : E.shoot(st, cur.id, mv.tid);
    castEvents(room, events);
    botPump(room);
  }, BOT_DELAY);
}

function startGame(room, botCount, rules) {
  if (rules) room.rules = rules;
  const seats = [...room.clients].filter(w => w.lc.role === "seat");
  const names = new Set(seats.map(w => w.lc.name));
  const botNames = E.BOT_NAMES.filter(n => !names.has(n)).sort(() => Math.random() - 0.5);
  const defs = [
    ...seats.map(w => ({ name: w.lc.name, look: w.lc.look })),
    ...botNames.slice(0, botCount).map(n => ({ name: n, bot: true }))
  ];
  seats.forEach((w, i) => { w.lc.pid = i; });
  room.defs = defs;
  room.st = E.newGame(defs, room.rules);
  const ev = [];
  E.beginTurn(room.st, ev);
  for (const ws of room.clients)
    send(ws, { t: "begin", you: ws.lc.pid ?? null, state: E.pub(room.st) });
  castEvents(room, ev);
  botPump(room);
}

function leaveRoom(ws) {
  const room = ws.lcRoom;
  if (!room) return;
  room.clients.delete(ws);
  ws.lcRoom = null;
  if (!room.clients.size) {
    clearTimeout(room.botTimer);
    rooms.delete(room.code);
    return;
  }
  /* hand the empty seat to the house mid-game */
  if (room.st && !room.st.over && ws.lc.pid != null) {
    const p = room.st.players[ws.lc.pid];
    if (p && p.alive && !p.bot) {
      p.bot = true;
      cast(room, { t: "note", text: `${p.name} left the table. The house plays the hand.` });
      botPump(room);
    }
  }
  if (ws.lc.host) {
    const next = [...room.clients].find(w => w.lc.role === "seat") || [...room.clients][0];
    if (next) next.lc.host = true;
  }
  roster(room);
}

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  ws.lc = { name: "", role: "seat", pid: null, host: false };
  ws.lcRoom = null;

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.lcRoom;

    switch (m.t) {
      case "create": {
        if (room) leaveRoom(ws);
        const r = makeRoom();
        ws.lc = { name: seatName(m.name, []), look: cleanLook(m.look), role: "seat", pid: null, host: true };
        ws.lcRoom = r;
        r.clients.add(ws);
        roster(r);
        break;
      }
      case "join": {
        const r = rooms.get(String(m.code || "").toUpperCase().trim());
        if (!r) { send(ws, { t: "err", msg: "No table with that code." }); return; }
        const seated = [...r.clients].filter(w => w.lc.role === "seat").length;
        const wantSpec = m.spectate || r.st || seated >= 6;
        if (room) leaveRoom(ws);
        const taken = [...r.clients].map(w => w.lc.name);
        ws.lc = { name: seatName(m.name, taken), look: cleanLook(m.look), role: wantSpec ? "spec" : "seat", pid: null, host: false };
        ws.lcRoom = r;
        r.clients.add(ws);
        if (r.st) send(ws, { t: "begin", you: null, state: E.pub(r.st) });
        roster(r);
        break;
      }
      case "start": {
        if (!room || !ws.lc.host || room.st) return;
        const seats = [...room.clients].filter(w => w.lc.role === "seat").length;
        const bots = Math.max(seats < 2 ? 1 : 0, Math.min(6 - seats, m.bots | 0));
        startGame(room, bots, cleanRules(m.rules));
        break;
      }
      case "item": {
        if (!room || !room.st || ws.lc.pid == null) return;
        const { ev, priv } = E.useItem(room.st, ws.lc.pid, m.idx | 0);
        if (priv) send(ws, { t: "peek", live: priv.live });
        castEvents(room, ev);
        botPump(room);
        break;
      }
      case "shoot": {
        if (!room || !room.st || ws.lc.pid == null) return;
        castEvents(room, E.shoot(room.st, ws.lc.pid, m.tid | 0));
        botPump(room);
        break;
      }
      case "again": {
        if (!room || !ws.lc.host || !room.st || !room.st.over) return;
        room.st = null;
        for (const w of room.clients) w.lc.pid = null;
        const bots = room.defs.filter(d => d.bot).length;
        startGame(room, bots);
        break;
      }
      case "chat": {
        if (!room) return;
        const text = clean(m.text, 120, "");
        if (text) cast(room, { t: "chat", name: ws.lc.name, text });
        break;
      }
      case "leave": leaveRoom(ws); break;
    }
  });

  ws.on("close", () => leaveRoom(ws));
});

function clean(s, max = 16, empty = "") {
  return String(s || "").replace(/[<>&]/g, "").trim().slice(0, max) || empty;
}
/* Nobody sits down as "Guest": an empty or duplicate name gets a carnival one. */
function seatName(raw, taken) {
  const n = clean(raw);
  const lower = taken.map(t => String(t).toLowerCase());
  if (n && !lower.includes(n.toLowerCase())) return n;
  if (n) for (let i = 2; i < 9; i++) { const c = (n.slice(0, 13) + " " + i); if (!lower.includes(c.toLowerCase())) return c; }
  return carnivalName(taken);
}

/* House rules are host-chosen but server-clamped. */
function cleanRules(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = {};
  const lives = raw.lives | 0;
  if (lives >= 2 && lives <= 5) r.lives = lives;
  const deal = raw.itemsPerDeal | 0;
  if (deal >= 0 && deal <= 3) r.itemsPerDeal = deal;
  const heat = raw.heat | 0;
  if (heat >= 0 && heat <= 2) r.heat = heat;
  return r;
}

/* Appearance is client-chosen but server-clamped: integer indexes only. */
function cleanLook(raw) {
  if (!raw || typeof raw !== "object") return null;
  const look = {};
  for (const [k, n] of Object.entries(LOOK_RANGES)) {
    const v = raw[k] | 0;
    look[k] = v >= 0 && v < n ? v : 0;
  }
  return look;
}

server.listen(PORT, () => console.log(`last chamber listening on http://localhost:${PORT}`));
