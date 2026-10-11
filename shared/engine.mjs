/* Last Chamber rules engine.
   Pure logic, no DOM, no Node APIs. Runs in the browser for local play
   and on the server as the single authority for online rooms. */

export const ITEMS = {
  peek:   { name: "Peek",   desc: "See the next shell, privately" },
  eject:  { name: "Eject",  desc: "Discard the next shell, face up" },
  spin:   { name: "Spin",   desc: "Reshuffle the remaining shells" },
  shield: { name: "Shield", desc: "Block the next hit on you" },
  flask:  { name: "Flask",  desc: "Recover one life" },
  double: { name: "Double", desc: "Next live shot deals two damage" },
  cuffs:  { name: "Cuffs",  desc: "The next player skips a turn" }
};
const KEYS = Object.keys(ITEMS);

/* House rules. heat: 0 calm, 1 standard, 2 reckless (more live shells). */
export const DEFAULT_RULES = { lives: 3, itemsPerDeal: 2, maxItems: 4, heat: 1 };

const rnd = n => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const alivePlayers = st => st.players.filter(p => p.alive);

/* defs: [{ name, bot, nerve? }] in seat order */
export function newGame(defs, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  return {
    rules: r,
    players: defs.map((d, i) => ({
      id: i,
      name: d.name,
      bot: !!d.bot,
      look: d.look || null,
      nerve: d.nerve ?? (0.25 + Math.random() * 0.35),
      lives: r.lives,
      alive: true,
      items: [],
      shield: false,
      cuffed: false
    })),
    shells: [],          /* 1 = live, 0 = blank; index 0 is next */
    round: 0,
    turn: -1,            /* index into players */
    doubleDmg: false,
    known: {},           /* pid -> boolean, private peek knowledge */
    over: false,
    winner: null
  };
}

function reload(st, ev) {
  st.round++;
  const heat = st.rules.heat;
  const live = heat === 0 ? 1 + rnd(2)
    : heat === 2 ? 2 + rnd(3) + (st.round > 1 ? 1 : 0)
    : 1 + rnd(3) + (st.round > 2 ? 1 : 0);
  const blank = heat === 2 ? 2 + rnd(2) : 2 + rnd(3);
  st.shells = shuffle([...Array(live).fill(1), ...Array(blank).fill(0)]);
  st.known = {};
  for (const p of alivePlayers(st))
    for (let i = 0; i < st.rules.itemsPerDeal && p.items.length < st.rules.maxItems; i++)
      p.items.push(KEYS[rnd(KEYS.length)]);
  ev.push({ e: "round", round: st.round, live, blank });
}

function checkEnd(st, ev) {
  if (st.over) return true;
  const rest = alivePlayers(st);
  if (rest.length <= 1) {
    st.over = true;
    st.winner = rest.length ? rest[0].id : null;
    ev.push({ e: "end", winner: st.winner });
    return true;
  }
  return false;
}

function nextAliveIdx(st, i) {
  let j = i;
  do { j = (j + 1) % st.players.length; } while (!st.players[j].alive);
  return j;
}

/* Advance to the next turn (or keep it). Emits skip/round/turn events. */
export function beginTurn(st, ev, keep = false) {
  if (checkEnd(st, ev)) return;
  if (!st.shells.length) reload(st, ev);
  if (!keep) {
    st.turn = st.turn < 0
      ? st.players.findIndex(p => p.alive)
      : nextAliveIdx(st, st.turn);
    let guard = st.players.length;
    while (st.players[st.turn].cuffed && guard-- > 0) {
      const p = st.players[st.turn];
      p.cuffed = false;
      ev.push({ e: "skip", pid: p.id });
      st.turn = nextAliveIdx(st, st.turn);
    }
  }
  ev.push({ e: "turn", pid: st.players[st.turn].id });
}

/* Returns an event list; empty if the action was illegal. */
export function shoot(st, pid, tid) {
  const ev = [];
  if (st.over || st.players[st.turn].id !== pid) return ev;
  const shooter = st.players.find(p => p.id === pid);
  const target = st.players.find(p => p.id === tid);
  if (!shooter || !target || !target.alive || !st.shells.length) return ev;

  const live = st.shells.shift() === 1;
  st.known = {};
  let dmg = 0, shielded = false, killed = false;
  if (live) {
    dmg = st.doubleDmg ? 2 : 1;
    if (target.shield) {
      target.shield = false;
      shielded = true;
      dmg = 0;
    } else {
      target.lives -= dmg;
      if (target.lives <= 0) { target.lives = 0; target.alive = false; killed = true; }
    }
  }
  st.doubleDmg = false;
  const keep = pid === tid && !live;
  ev.push({ e: "shot", pid, tid, live, dmg, shielded, killed, keep });
  if (checkEnd(st, ev)) return ev;
  beginTurn(st, ev, keep);
  return ev;
}

/* Returns { ev, priv }. priv is peek info for the acting player only. */
export function useItem(st, pid, idx) {
  const ev = [];
  let priv = null;
  if (st.over || st.players[st.turn].id !== pid) return { ev, priv };
  const p = st.players[st.turn];
  const k = p.items[idx];
  if (!k) return { ev, priv };
  p.items.splice(idx, 1);

  switch (k) {
    case "peek": {
      const live = st.shells[0] === 1;
      st.known[pid] = live;
      priv = { live };
      ev.push({ e: "item", pid, item: "peek" });
      break;
    }
    case "eject": {
      const live = st.shells.shift() === 1;
      st.known = {};
      ev.push({ e: "item", pid, item: "eject", live });
      if (!st.shells.length && !checkEnd(st, ev)) reload(st, ev);
      break;
    }
    case "spin":
      shuffle(st.shells);
      st.known = {};
      ev.push({ e: "item", pid, item: "spin" });
      break;
    case "shield":
      p.shield = true;
      ev.push({ e: "item", pid, item: "shield" });
      break;
    case "flask": {
      const gained = p.lives < st.rules.lives;
      if (gained) p.lives++;
      ev.push({ e: "item", pid, item: "flask", gained });
      break;
    }
    case "double":
      st.doubleDmg = true;
      ev.push({ e: "item", pid, item: "double" });
      break;
    case "cuffs": {
      const n = st.players[nextAliveIdx(st, st.turn)];
      if (n.id !== pid) {
        n.cuffed = true;
        st.lastCuffed = n.id;
        ev.push({ e: "item", pid, item: "cuffs", tid: n.id });
      } else {
        ev.push({ e: "item", pid, item: "cuffs", tid: null });
      }
      break;
    }
  }
  return { ev, priv };
}

/* One decision for the current (bot) player. */
export function botMove(st) {
  const p = st.players[st.turn];
  const total = st.shells.length;
  const liveN = st.shells.filter(x => x).length;
  const pl = total ? liveN / total : 0;
  const has = k => p.items.indexOf(k);
  const known = st.known[p.id];

  if (p.lives === 1 && has("flask") >= 0)
    return { a: "item", idx: has("flask") };
  if (!p.shield && p.lives <= 2 && pl > 0.5 && has("shield") >= 0)
    return { a: "item", idx: has("shield") };
  if (known === undefined && pl > 0.3 && pl < 0.85 && has("peek") >= 0 && Math.random() < 0.6)
    return { a: "item", idx: has("peek") };
  if (known === true && p.lives === 1 && has("eject") >= 0 && Math.random() < 0.5)
    return { a: "item", idx: has("eject") };
  if (known === true && liveN >= 2 && has("double") >= 0 && Math.random() < 0.6)
    return { a: "item", idx: has("double") };
  /* the house never cuffs the same player twice running */
  const nextUp = st.players[nextAliveIdx(st, st.turn)];
  if (has("cuffs") >= 0 && nextUp.id !== st.lastCuffed && !nextUp.cuffed && Math.random() < 0.3)
    return { a: "item", idx: has("cuffs") };

  const self = known === true ? false
    : known === false ? true
    : pl <= p.nerve;
  if (self) return { a: "shoot", tid: p.id };

  const foes = alivePlayers(st).filter(q => q !== p)
    .sort((a, b) => (a.lives + (a.shield ? 2 : 0)) - (b.lives + (b.shield ? 2 : 0)));
  const t = Math.random() < 0.75 ? foes[0] : foes[rnd(foes.length)];
  return { a: "shoot", tid: t.id };
}

/* Public snapshot: everything except the shell order and peek knowledge. */
export function pub(st) {
  return {
    rules: { ...st.rules },
    round: st.round,
    turn: st.turn < 0 ? null : st.players[st.turn].id,
    over: st.over,
    winner: st.winner,
    live: st.shells.filter(x => x).length,
    blank: st.shells.filter(x => !x).length,
    doubleDmg: st.doubleDmg,
    players: st.players.map(p => ({
      id: p.id, name: p.name, bot: p.bot, look: p.look, lives: p.lives, alive: p.alive,
      shield: p.shield, cuffed: p.cuffed, items: [...p.items]
    }))
  };
}

export const BOT_NAMES = ["Viper", "Preacher", "Duchess", "Ivan", "Smiley", "The Kid", "Marrow", "Lucky"];
