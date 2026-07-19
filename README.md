# Last Chamber

A parlor game of nerve. A revolver holds a public count of live and blank
shells in a secret order. On your turn you point it at yourself or at anyone
else at the table. Survive your own pull on a blank and you keep the gun.
Last seat standing wins. Nobody dies; you lose lives and sit out the round.

## Play

```
npm install
npm start          # http://localhost:4173
npm test           # engine unit tests
```

Three modes from the menu:

- **Solo**: you against 2 to 5 house players with distinct risk tolerances.
- **Hot seat**: 2 to 4 people passing one device. A hand-over screen keeps
  private peeks private.
- **Online**: private rooms with a 4-character join code, up to 6 seats,
  unlimited spectators, and built-in table chat.

## Architecture

```
shared/engine.mjs    Rules engine. Pure functions, no DOM, no Node APIs.
server/index.js      Static hosting plus WebSocket rooms. Single process.
public/              Client. No framework, no build step.
test/                Engine tests (node:test).
```

The same engine runs in two places. Solo and hot seat run it in the browser.
Online rooms run it on the server, which is the single authority: clients
receive an event list plus a public snapshot that never contains the shell
order. Peek results travel in a private message to the peeking player only,
so shell order cannot be read from traffic or client memory.

Other server behavior:

- Rooms are created with collision-checked codes and deleted when empty.
- House players are driven server-side on a timer.
- If a seated player disconnects mid-game, the house takes over their hand
  and the game continues.
- Host migration: if the host leaves the lobby, the next player inherits it.

### Client

One renderer and one event animator serve all three modes; the only
difference is whether actions go to the local engine or over the socket.
All art is inline SVG generated at runtime. No emoji, no image files, no
fonts to load.

### Cutout animation

Every player is an original suit character: rigid SVG pieces (torso,
backpack, helmet, visor, eyes) jointed by CSS transforms, the way
paper-doll animation works. Idle suits sway, bob, and blink on
desynchronized loops. The current player leans in. A hit makes the target
flinch, shakes the table, and throws a burst with a splat that fades from
the felt. Losing the last life cracks the visor and slumps the suit. The
winner bounces.

Lives are diegetic: a row of lamps on each suit's chest panel goes dark
hit by hit, and the last lamp flickers. No floating counters.

The revolver is a physical object on the felt: it slides around the table
to whoever holds it, swings to aim, flashes at the muzzle, recoils, and
ejects a spinning casing on a live round. It is always drawn in the
current holder's chosen design.

### Sound

All audio is procedural WebAudio through one compressed bus, so there are
no files to load. The suspense layer: a hammer cock and a low heartbeat
under every aim, the crack of a live round over a deep thump, a soft
exhale after a blank, casing tinks, a felt slide when the gun changes
hands, a low drop when a player goes out, and a three-note resolve at the
end.

### Wardrobe

Suits and guns are assembled from a `look`: visor tint, suit trim, suit
color, helmet kit, revolver model, and finish (5 x 4 x 6 x 6 x 3 x 3
combinations). Pick yours in the Wardrobe on the menu; it persists locally,
follows you into online rooms, and is validated server-side. House players
get stable looks derived from their names, so Viper flies the same fin
every night.

### House rules

Lives (2 to 5), items dealt each round (0 to 3), and chamber heat (calm,
standard, reckless, controlling how hot the cylinder loads run) are set
per table: in the config for local games, by the host in online lobbies.
The server clamps whatever the host sends, and the flask never heals past
the table's life cap.

### Items

| Item | Effect |
|--------|--------|
| Peek | See the next shell, privately |
| Eject | Discard the next shell, face up |
| Spin | Reshuffle the remaining shells |
| Shield | Block the next hit on you |
| Flask | Recover one life |
| Double | Next live shot deals two damage |
| Cuffs | The next player skips a turn |

## Streamer and progression features

- **Streamer mode** (Table settings): peek results require press-and-hold to
  reveal, so a streamer can cover the moment on camera.
- **Spectators**: join any room code as a watcher.
- **Cosmetics**: the wardrobe is free; table felts unlock by games played,
  stored locally. Cosmetic only; odds are never for sale.

## Deploy

The server is one Node process with one dependency.

```
docker build -t last-chamber .
docker run -p 4173:4173 last-chamber
```

Works as-is on Fly.io, Railway, Render, or any host that runs a container
and passes `PORT`. WebSockets ride the same port as HTTP, so no extra
routing is needed. `render.yaml` is a ready Blueprint: push the repo to
GitHub, connect it in Render, done. The free tier costs nothing but spins
down when idle, which drops live rooms; the paid starter instance stays up.
For scale-out beyond one instance, pin rooms to instances by code (sticky
routing on the room code) or move room state to a shared store; the engine
is already stateless between actions.

### Phones

The game is an installable PWA: `manifest.webmanifest`, an SVG icon, and a
network-first service worker. Players open the URL, pick "Add to Home
Screen", and it launches fullscreen with its own icon. No app store, no
store fees. The cached shell keeps solo and hot seat playable offline;
online play needs the connection anyway. The layout stacks for phone
widths: table on top, ledger strip below.
