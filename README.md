# Football Blitz '26

An arcade 7-on-7 football game for the browser, in the spirit of **NFL Blitz**: 7-on-7, 10 yards for a first down, no penalties, late hits, dive tackles, turbo, spin moves and "ON FIRE" streaks. It's presented like a modern sports game: real-time 3D (WebGL), lit and shadowed players in team uniforms with procedural animation, a two-deck stadium with an animated crowd, LED ribbon boards, light towers and jumbotrons, bloom and film tone mapping, a broadcast camera and TV-style score bug, plus slow motion, hit-stop, camera punch-ins and gamepad rumble on big plays.

- **Play online:** https://kalium2.github.io/starwars-browser-game/ (once GitHub Pages is enabled, see below)
- **Download:** the **DOWNLOAD GAME** button on the title screen gets `football-blitz.zip`. Unzip it and open `index.html`; no install or server is needed. The site is also an installable web app ("Install" / "Add to Home Screen") and works offline after the first visit.

## Features

- All **32 NFL teams with 2026 rosters**, using starters from late-October 2026 (Week 8) depth charts.
- Every player is built from one **character template**, and their ratings come from **fantasy stats** (see below).
- 1 player vs CPU (3 skill levels) or 2 players on one machine. Keyboard, gamepad and touch all work.
- **Aim assist** (on by default, toggle in **Options**): the mouse locks onto receivers from farther away, the stick target holds steady instead of flickering between receivers, and a throw at a locked-on receiver is about 40% tighter. When two receivers are about equally close to where you aim, it takes the more open one. Gameplay runs at 88% of real time so plays are easier to read.
- 9 offensive plays plus punt, field goal, **fake punt**, **fake field goal** and **MY PLAY** (from the **Create a Play** editor); 9 defensive calls. Any offensive play can be **flipped** (TURBO on play select).
- Arcade moves: **bullet passes** (hold TURBO when throwing), **stiff-arms** (TURBO+ACTION), **laterals** (TURBO+SPECIAL), spins, hurdles, dive tackles and late hits. **Audibles** at the line (SPECIAL) for offense and defense. **Onside kicks** (SPECIAL when kicking off).
- **Tackling:** contact brings the carrier down; only a timed move beats it (spin vs. arm tackles, stiff-arm vs. tacklers in front, hurdle vs. dives). **Turbo refills at the start of every play**, and each player has his own meter: switching to a player you haven't used yet this play gives you full turbo, and switching back to one you already used gives him at least half.
- **Point-and-click passing:** aim with the mouse (or a finger) and click. A dotted arc previews the throw (red where a defender can reach it) and a reticle shows the landing spot rated OPEN, TIGHT or COVERED. Near a receiver the aim locks on and leads him, and where you point relative to him places the ball; anywhere else the ball goes to that spot. Hold the click to charge a power ring from lob to bullet; release on the gold band for a **PERFECT** throw with much tighter accuracy, hold too long and it wobbles. Incompletions and picks come from defenders in the throwing lane (a lob can float over a short defender, a bullet can't). Any ball carrier still behind the line of scrimmage can throw.
- **Kicking:** real snap, holder and run-up, with a two-press power/aim meter for field goals, extra points and punts and a power meter for kickoffs. Kicks fly with gravity and **wind** (shown in the HUD); field goals are good only if the ball clears the bar between the uprights.
- **Power-ups:** a glowing token sometimes appears on the field. Touch it for SPEED, HANDS or TANK for a few plays.
- **Smarter teammates:** hot routes against blitzes, a scramble drill when the QB extends the play, and lead blocking for the ball carrier.
- **Instant replay** of big plays (touchdowns, interceptions, onside recoveries, 25+ yard gains) from a low sideline camera.
- **Extras:** big heads, infinite turbo, weather (rain, snow, fog, random; rain and snow affect footing, throwing and catching) and a secret, fully fictional team unlocked with a code on the title screen.
- **Pass rush:** passes have a 0.2 s wind-up (the ball leaves at the release point of the throwing motion), so a rusher who gets home in time gets the sack, with a big strip-sack chance mid-throw. **Jump the snap**: if the defender you control is already driving into the backfield when the ball is snapped on HIKE!, he explodes off the line and blockers can't pick him up for a moment.
- **Football clock rules**, scaled to the quarter length: the clock keeps running after in-bounds plays (a play clock's worth in the huddle, then while the offense is at the line) and stops for incompletions, scores, turnovers, kicks, timeouts and change of possession, and for out of bounds late in a half. Two-minute warning in the 2nd and 4th quarters (half the quarter for quarters under 4 minutes). Three timeouts per team per half (two in overtime), shown under each team in the score bug; the CPU uses its timeouts late when it needs time.
- **Halftime show:** the home team's cheerleaders perform a ten-second routine (kick line, V formation, a basket toss and a pom finale) to an original drumline beat. Press Action to skip it.
- Final screen shows passing, rushing, receiving and defensive leaders. Kickoffs, extra points, 2-point tries, safeties, touchbacks, interceptions, fumbles and sudden-death overtime.
- Sound: field sounds (padded hits, catches, cleats, jersey rustles, referee whistles, a stadium bed and crowd swells) come from an original synthesized sample pack in `assets/audio`, layered with arcade stingers, an original menu music loop and a hype announcer with varied calls (browser speech). Every sound also has a synthesized fallback in code. The downloaded copy plays the samples too (through `<audio>`, since browsers block loading files into WebAudio from `file://`).
- Graphics quality is picked automatically (HIGH: bloom, MSAA, 2K shadows, full crowd; LOW: lighter settings for phones and older machines) and can be changed in **Options**. Browsers without WebGL fall back to a 2D renderer.

## Controls

| | 1 Player | P1 (2P) | P2 (2P) | Gamepad |
|---|---|---|---|---|
| Move | WASD / Arrows | WASD | Arrows | Stick / D-pad |
| Action (snap, pass, spin, dive, switch) | Space / J | Space | Num 0 or `/` | A |
| Turbo | Shift / K | Left Shift | Num `.` or `.` | X / RB / RT |
| Special (hurdle, jump for ball) | E / L | E | Num Enter or `,` | B / Y |
| Pause | Esc / P | Esc | Enter | Start |
| Timeout | T | T | Num `-` | Back / Select |
| Receiver icons / hot routes | 1-4 | 1-4 | Num 1-4 | (click or tap the icon) |

Before the snap on a pass play, press **1-4** (WR1, WR2, TE, RB) or click a receiver's numbered icon to cycle his **hot route** (GO, SLANT, OUT, CURL, IN, FLAT, then back to the called route); the play's routes are drawn on the field until the snap. After the snap, press a receiver's number (or click his icon) to throw to him; the icon's ring shows how open he is. Player 2 uses numpad 1-4. To pass with the mouse, point at a receiver (or any spot) and click; hold and release on the gold band of the power ring for a perfect throw, right-click to cancel. Elsewhere a left click works as Action (snap, switch, dive) and a right click as Special. With a keyboard or gamepad, point the stick at a receiver and press Action; with the stick centered, the ball goes to the most open receiver, marked by the pulsing ring.

## Player ratings: template and fantasy stats

`js/data/template.js` defines one template that every player uses: `spd, agi, str, cth, thp, tha, tak, cov, prs` plus `ovr`. A roster entry stores only a name, position, **fantasy points per game** and optional trait tags. The ratings are derived from those:

1. The fantasy points per game are normalized against that position's range (for example, QB 10 to 24 PPR points per game).
2. Position archetype values are scaled by that percentile.
3. Trait tags (`scrambler`, `cannon`, `burner`, `power`, `hands`, `ballhawk`, and so on) add small bonuses.

Offense uses **PPR** scoring and defense uses **IDP** scoring. The values are rounded approximations of each player's most recent full NFL season (2025). Rookies (marked **R**) use a 2026 projection. Hover over a player on the team-select screen to see their fantasy number.

Rosters live in `js/data/teams.js`. To update a player after a trade or injury, edit their line and every rating updates automatically. Jersey numbers are left off on purpose because mid-season number changes couldn't be verified.

## Enabling GitHub Pages (one-time)

1. Merge this branch into `main`.
2. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The `Deploy to GitHub Pages` workflow (`.github/workflows/pages.yml`) publishes the game and the downloadable zip on every push to `main`.

## Project layout

```
index.html              page shell and menus
css/style.css           UI styling
js/data/template.js     character template and fantasy-to-ratings formulas
js/data/teams.js        32 teams, colors, 2026 rosters
js/plays.js             playbook (formations, routes, defensive calls)
js/engine.js            simulation: physics, AI, rules, clock, stats
js/ai.js                CPU play calling
js/render3d.js          3D renderer: player models and animation, stadium, crowd, camera, effects
js/render.js            HUD overlay and banners; also the 2D fallback renderer
js/aim.js               point-and-click passing overlay (arc, reticle, power ring)
js/vendor/three.bundle.js  three.js r160 (MIT license, see js/vendor/THREE-LICENSE.txt)
js/audio.js             WebAudio sound, sample playback and speech announcer
assets/audio/           original sample pack (16 WAVs, 48 kHz)
js/input.js             keyboard, gamepad and touch input
js/ui.js, js/main.js    screens and app loop
```

## Disclaimer

This is an unofficial fan project. It is not affiliated with, endorsed by or licensed by the NFL, the NFLPA, any NFL team, or Midway / Warner Bros. (the owners of NFL Blitz). Team and player names are used only for identification, and no logos are used.
