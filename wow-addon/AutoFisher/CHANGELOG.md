# AutoFisher release notes

## 1.0.0 (2026-11-07)

First release.

### New
- **One-key fishing.** Type `/af` to turn on fishing mode. Your fishing key (F by default) casts Fishing. While your line is in the water, the same key reels in the bobber. That part needs a client with soft targeting: WoW: Forever, Retail, Classic Era, TBC Anniversary or Mists Classic.
- **Loud splash.** While you fish, music, ambience and dialog are muted and sound effects play at full volume, so the splash is easy to hear.
- **Auto loot.** Auto loot is turned on while you fish.
- **Catch log.** `/af stats` shows what you've caught this session and in total. `/af reset` clears it.
- **Your own key.** `/af key <KEY>` sets a different key, for example `/af key G`, `/af key SHIFT-F` or `/af key BUTTON4`.
- **Optional extras.** `/af sound off` and `/af loot off` turn off the loud splash and auto loot.
- **On-screen hint.** A line near the top of the screen tells you what your key does right now.

### Safety
- Every setting AutoFisher changes is put back when you turn fishing mode off or log out. If the game closes unexpectedly, it puts them back on your next login.
- Your key is only taken over while fishing mode is on. Turn it off and your normal binding comes back.
- If combat interrupts you, the key goes back to casting once the fight ends.
- AutoFisher never casts or loots on its own. Blizzard only allows that on a key press or click, so every cast and every catch is one press of your key.

### Known limitations
- Older clients (such as 3.3.5 servers) can't target the bobber with a key. There, the key casts and you right-click the bobber to reel in.
- The game may list AutoFisher as "out of date". Tick **Load out of date AddOns** in the AddOns list.
- If pressing your key on the splash doesn't reel in, right-clicking the bobber always works.
