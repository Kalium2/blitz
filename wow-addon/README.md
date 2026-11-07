# AutoFisher (World of Warcraft addon)

One-key fishing. Turn on fishing mode and the same key does everything:

1. Press **F** to cast.
2. When the bobber splashes, press **F** again to reel in. Loot is picked up automatically.
3. Repeat.

While fishing mode is on, the addon also makes the splash easy to hear (music, ambience and dialog muted, effects at full volume) and turns on auto loot. When you stop, it puts every setting back the way you had it. That also happens on logout, or on your next login if the game crashed.

## Install

1. Download `AutoFisher.zip` from this folder (or copy the `AutoFisher` folder).
2. Unzip it into `World of Warcraft/_retail_/Interface/AddOns/` (or `_classic_era_`, `_classic_`, `_anniversary_`), so you end up with `Interface/AddOns/AutoFisher/AutoFisher.lua`.
3. Restart the game. If the addon shows as "out of date" in the AddOns list, tick **Load out of date AddOns**.

## Use

| Command | What it does |
|---|---|
| `/af` | Turn fishing mode on or off |
| `/af key F` | Change the fishing key (`F`, `SHIFT-F`, `BUTTON4`, ...). The default is `F` |
| `/af sound on/off` | Loud splash while fishing (default on) |
| `/af loot on/off` | Auto loot while fishing (default on) |
| `/af stats` | What you've caught this session and in total |
| `/af reset` | Clear the stats |

The key only belongs to the addon while fishing mode is on. Turn fishing mode off and your normal binding comes back.

## Supported game versions

- **Retail, Classic Era, TBC Anniversary, Mists Classic:** everything works, including pressing the key on the splash to reel in. This uses the game's soft-target interact.
- **Older clients (for example 3.3.5 private servers):** the key casts. Reel in by right-clicking the bobber, because those clients can't target a bobber with a key.

## Why it isn't fully hands-off

Blizzard only lets an addon cast a spell or click the bobber when you press a key or click. An addon can't do either on its own, and outside programs that fish without you are bots, which get accounts banned. AutoFisher stays within the rules: every cast and every catch is one press of your key.
