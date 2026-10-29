# Football Blitz '26

An arcade 7-on-7 football game for the browser, in the spirit of **NFL Blitz**: 7-on-7, 10 yards for a first down, no penalties, late hits, dive tackles, turbo, spin moves and "ON FIRE" streaks. It's presented like a modern sports game: real-time 3D (WebGL), lit and shadowed players in team uniforms with procedural animation, a two-deck stadium with an animated crowd, LED ribbon boards, light towers and jumbotrons, bloom and film tone mapping, a broadcast camera and TV-style score bug, plus slow motion, hit-stop, camera punch-ins and gamepad rumble on big plays.

- **Play online:** https://kalium2.github.io/starwars-browser-game/ (once GitHub Pages is enabled, see below)
- **Download:** the **DOWNLOAD GAME** button on the title screen gets `football-blitz.zip`. Unzip it and open `index.html`; no install or server is needed. The site is also an installable web app ("Install" / "Add to Home Screen") and works offline after the first visit.

## Features

- All **32 NFL teams with 2026 rosters**, using starters from late-October 2026 (Week 8) depth charts.
- Every player is built from one **character template**, and their ratings come from **fantasy stats** (see below).
- 1 player vs CPU (3 skill levels) or 2 players on one machine. Keyboard, gamepad and touch all work.
- 9 offensive plays plus punt, field goal, **fake punt**, **fake field goal** and **MY PLAY** (from the **Create a Play** editor); 9 defensive calls. Any offensive play can be **flipped** (TURBO on play select).
- Arcade moves: **bullet passes** (hold TURBO when throwing), **stiff-arms** (TURBO+ACTION), **laterals** (TURBO+SPECIAL), spins, hurdles, dive tackles and late hits. **Audibles** at the line (SPECIAL) for offense and defense. **Onside kicks** (SPECIAL when kicking off).
- **Tackling:** contact brings the carrier down; only a timed move beats it (spin vs. arm tackles, stiff-arm vs. tacklers in front, hurdle vs. dives). **Turbo refills at the start of every play.**
- **Passing:** throws go where you aim, led to the receiver; incompletions and picks come from defenders in the throwing lane (a lob can float over a short defender, a bullet can't). Any ball carrier still behind the line of scrimmage can throw.
- **Kicking:** real snap, holder and run-up, with a two-press power/aim meter for field goals, extra points and punts and a power meter for kickoffs. Kicks fly with gravity and **wind** (shown in the HUD); field goals are good only if the ball clears the bar between the uprights.
- **Power-ups:** a glowing token sometimes appears on the field. Touch it for SPEED, HANDS or TANK for a few plays.
- **Smarter teammates:** hot routes against blitzes, a scramble drill when the QB extends the play, and lead blocking for the ball carrier.
- **Instant replay** of big plays (touchdowns, interceptions, onside recoveries, 25+ yard gains) from a low sideline camera.
- **Extras:** big heads, infinite turbo, weather (rain, snow, fog, random; rain and snow affect footing, throwing and catching) and a secret, fully fictional team unlocked with a code on the title screen.
- Final screen shows passing, rushing, receiving and defensive leaders. Kickoffs, extra points, 2-point tries, safeties, touchbacks, interceptions, fumbles and sudden-death overtime.
- Arcade sound design: layered hit, whistle, turbo and fanfare effects, a two-layer crowd that reacts to big plays, an original menu music loop, and a hype announcer with varied calls (browser speech). All of it is original and synthesized in code. There are no art or audio asset files: every model, texture and sound is generated in code.
- Graphics quality is picked automatically (HIGH: bloom, MSAA, 2K shadows, full crowd; LOW: lighter settings for phones and older machines) and can be changed in **Options**. Browsers without WebGL fall back to a 2D renderer.

## Controls

| | 1 Player | P1 (2P) | P2 (2P) | Gamepad |
|---|---|---|---|---|
| Move | WASD / Arrows | WASD | Arrows | Stick / D-pad |
| Action (snap, pass, spin, dive, switch) | Space / J | Space | Num 0 or `/` | A |
| Turbo | Shift / K | Left Shift | Num `.` or `.` | X / RB / RT |
| Special (hurdle, jump for ball) | E / L | E | Num Enter or `,` | B / Y |
| Pause | Esc / P | Esc | Enter | Start |

To pass, point the stick at a receiver and press Action. With the stick centered, the ball goes to the most open receiver, marked by the pulsing ring.

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
js/vendor/three.bundle.js  three.js r160 (MIT license, see js/vendor/THREE-LICENSE.txt)
js/audio.js             WebAudio sound and speech announcer
js/input.js             keyboard, gamepad and touch input
js/ui.js, js/main.js    screens and app loop
```

## Disclaimer

This is an unofficial fan project. It is not affiliated with, endorsed by or licensed by the NFL, the NFLPA, any NFL team, or Midway / Warner Bros. (the owners of NFL Blitz). Team and player names are used only for identification, and no logos are used.
