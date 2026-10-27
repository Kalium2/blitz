# Galactic Conquest

A Star Wars fan real-time strategy game for the browser, built on StarCraft mechanics: workers, two resources, supply, tech trees, fog of war, control groups, and an AI opponent. It has three asymmetric factions, and their units are balanced and tested against each other.

No build step and no dependencies. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Factions

| Faction | Identity | Units |
|---|---|---|
| **Galactic Empire** | Heavy armor and long-range walkers | Stormtrooper, Scout Trooper (speeder bike), AT-ST, AT-AT, TIE Fighter, TIE Bomber |
| **Rebel Alliance** | Regenerating deflector shields, strong starfighters | Rebel Trooper, Wookiee Warrior, T-47 Airspeeder, Ion Artillery, X-Wing, Y-Wing |
| **Separatist Droid Army** | Cheap droids in large numbers (B1s are trained in pairs) | B1 Battle Droids, Droideka, AAT, Hailfire Droid, Vulture Droid, Hyena Bomber |

Each faction has the same structure roles: HQ, supply, gas refinery, barracks, factory, hangar, research lab (unlocks the heavy unit and bomber) and a defense tower. They differ in names, art and durability (Rebel buildings have shields).

## StarCraft mechanics

- Workers mine **kyber crystals** (minerals) and **tibanna gas** (vespene). Gas needs a refinery built on a vent.
- **Supply** cap comes from your HQ and supply structures, up to 200.
- Damage bonuses against `light`, `armored`, `mech` and `air` targets. Shields absorb damage before hull and armor.
- Air units ignore terrain and can only be hit by anti-air weapons.
- Splash damage, attack-move, hold position, shift-queued orders, rally points.
- Fog of war: unexplored areas are black, explored areas are dimmed, and you only see enemy buildings you have scouted.
- Procedural point-symmetric maps on Tatooine, Hoth or Endor, with 8 base locations.
- AI opponent with four difficulty levels. It builds an economy, expands, follows a tech order, adapts its army to yours, defends, and attacks in waves.

## Controls

| Input | Action |
|---|---|
| Left click / drag | Select (double-click or Ctrl+click: all of that type on screen) |
| Right click | Smart command: move, attack, harvest, return cargo, set rally |
| `A` + click | Attack-move |
| `M`, `S`, `H` | Move, Stop, Hold |
| `B` / `V` (worker) | Basic / advanced structures |
| `Shift` | Queue orders / add to selection |
| `Ctrl+1-9`, `1-9` | Set / recall control group (double-tap to jump) |
| `F1` / `F2` | Next idle worker / select all army |
| `Space` | Jump to selection or base |
| Arrows, screen edge, middle-drag, wheel | Scroll and zoom |
| `Tab` / hold `Alt` | Show all health bars |
| `Esc` | Cancel targeting / cancel last queued unit |
| `P` / `F10` | Pause |

## Balance

The simulation in `js/sim.js` has no DOM code, so the balance tools run the real engine headless in Node:

```sh
node tools/balance.js        # unit-vs-unit matrix + faction matchups (equal-cost armies)
node tools/tournament.js 10  # full AI-vs-AI games across maps and start positions
node tools/aitest.js empire rebels hard 42   # one AI-vs-AI game with a per-minute log
```

Current results:

- **Faction matchups** (600 random mixed armies of equal cost per pairing): Empire–Rebels 53.3/46.7, Empire–Separatists 48.0/52.0, Rebels–Separatists 53.7/46.3. No pairing is more than 3.7 points from 50%. The order is a cycle, so no faction is strictly strongest.
- **Full-game tournament** (same AI playing every faction, alternating start positions): each faction won 50% of its games.
- **Units**: every unit has counters it beats and units it loses to, cost for cost. The strong/weak lists in the in-game tooltips and the Unit Database come from these results.

All stats live in `js/data.js`. If you change them, rerun `tools/balance.js`.

## Project layout

```
index.html        menu, HUD markup
css/style.css     UI styling
js/data.js        factions, units, buildings and all balance numbers
js/map.js         seeded symmetric map generator
js/sim.js         game simulation (pathfinding, combat, economy, fog), headless-capable
js/ai.js          computer opponent
js/art.js         procedural vector art for every unit and building
js/render.js      canvas renderer, effects, fog overlay, minimap
js/audio.js       WebAudio synth sound effects
js/ui.js          input, selection, command card, info panel
js/main.js        menus, opening crawl, game loop
tools/            balance matrix, AI tournament, AI smoke test
```

## Legal

This is a fan-made, non-commercial project. All art is drawn procedurally in code; it uses no copyrighted images or audio. Star Wars is a trademark of Lucasfilm Ltd. and StarCraft is a trademark of Blizzard Entertainment. This project is not affiliated with or endorsed by either.
