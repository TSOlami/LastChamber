import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../shared/engine.mjs";

function game() {
  const st = E.newGame([
    { name: "A" }, { name: "B", bot: true }, { name: "C", bot: true }
  ]);
  const ev = [];
  E.beginTurn(st, ev);
  return { st, ev };
}

test("new game deals shells, items, and a first turn", () => {
  const { st, ev } = game();
  assert.equal(st.round, 1);
  assert.ok(st.shells.length >= 3);
  assert.ok(st.players.every(p => p.items.length === 2));
  assert.equal(ev.at(-1).e, "turn");
  assert.equal(st.turn, 0);
});

test("self shot with a blank keeps the turn", () => {
  const { st } = game();
  st.shells = [0, 1, 1];
  const ev = E.shoot(st, 0, 0);
  const shot = ev.find(e => e.e === "shot");
  assert.equal(shot.live, false);
  assert.equal(shot.keep, true);
  assert.equal(st.turn, 0);
});

test("live shot deals damage and passes the turn", () => {
  const { st } = game();
  st.shells = [1, 0, 0];
  const ev = E.shoot(st, 0, 1);
  const shot = ev.find(e => e.e === "shot");
  assert.equal(shot.live, true);
  assert.equal(st.players[1].lives, 2);
  assert.equal(st.turn, 1);
  assert.equal(ev.length, 2);
});

test("shield absorbs a hit", () => {
  const { st } = game();
  st.shells = [1, 0];
  st.players[1].shield = true;
  const ev = E.shoot(st, 0, 1);
  assert.equal(ev.find(e => e.e === "shot").shielded, true);
  assert.equal(st.players[1].lives, 3);
  assert.equal(st.players[1].shield, false);
});

test("double damage applies once", () => {
  const { st } = game();
  st.shells = [1, 1, 0];
  st.doubleDmg = true;
  E.shoot(st, 0, 1);
  assert.equal(st.players[1].lives, 1);
  assert.equal(st.doubleDmg, false);
});

test("elimination ends the game at one survivor", () => {
  const { st } = game();
  st.players[2].alive = false;
  st.players[1].lives = 1;
  st.shells = [1, 0];
  const ev = E.shoot(st, 0, 1);
  assert.equal(st.over, true);
  assert.equal(st.winner, 0);
  assert.ok(ev.some(e => e.e === "end"));
});

test("peek is private and cleared after a shot", () => {
  const { st } = game();
  st.shells = [1, 0];
  st.players[0].items = ["peek"];
  const { ev, priv } = E.useItem(st, 0, 0);
  assert.equal(priv.live, true);
  assert.equal(ev[0].item, "peek");
  assert.equal(E.pub(st).players[0].items.length, 0);
  E.shoot(st, 0, 1);
  assert.deepEqual(st.known, {});
});

test("cuffs skip the next player's turn", () => {
  const { st } = game();
  st.players[0].items = ["cuffs"];
  E.useItem(st, 0, 0);
  assert.equal(st.players[1].cuffed, true);
  st.shells = [1, 0, 0];
  const ev = E.shoot(st, 0, 2);
  assert.ok(ev.some(e => e.e === "skip" && e.pid === 1));
  assert.equal(st.turn, 2);
});

test("empty cylinder reloads before the next turn", () => {
  const { st } = game();
  st.shells = [1];
  const before = st.round;
  const ev = E.shoot(st, 0, 1);
  assert.equal(st.round, before + 1);
  assert.ok(ev.some(e => e.e === "round"));
  assert.ok(st.shells.length > 0);
});

test("acting out of turn is rejected", () => {
  const { st } = game();
  assert.equal(E.shoot(st, 1, 0).length, 0);
  assert.equal(E.useItem(st, 1, 0).ev.length, 0);
});

test("public snapshot hides the shell order", () => {
  const { st } = game();
  const p = E.pub(st);
  assert.equal(p.shells, undefined);
  assert.equal(p.known, undefined);
  assert.equal(p.live + p.blank, st.shells.length);
});

test("house rules set lives and item deal size", () => {
  const st = E.newGame([{ name: "A" }, { name: "B", bot: true }], { lives: 5, itemsPerDeal: 1 });
  const ev = [];
  E.beginTurn(st, ev);
  assert.ok(st.players.every(p => p.lives === 5));
  assert.ok(st.players.every(p => p.items.length === 1));
  assert.equal(E.pub(st).rules.lives, 5);
});

test("flask cannot heal past the table's life cap", () => {
  const st = E.newGame([{ name: "A" }, { name: "B", bot: true }], { lives: 2 });
  const ev = [];
  E.beginTurn(st, ev);
  st.players[0].items = ["flask"];
  const r = E.useItem(st, 0, 0);
  assert.equal(r.ev[0].gained, false);
  assert.equal(st.players[0].lives, 2);
});

test("calm heat still loads at least one live shell", () => {
  for (let i = 0; i < 20; i++) {
    const st = E.newGame([{ name: "A" }, { name: "B", bot: true }], { heat: 0 });
    const ev = [];
    E.beginTurn(st, ev);
    const round = ev.find(e => e.e === "round");
    assert.ok(round.live >= 1 && round.live <= 2);
  }
});
