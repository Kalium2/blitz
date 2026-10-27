// Game data: factions, units, buildings. All balance numbers live here.
// Units of measure: speed/range/sight in tiles (per second), time in seconds,
// radius in pixels. Damage bonuses apply per hit against matching tags.
(function (SW) {
  'use strict';

  SW.TILE = 32;
  SW.START_KYBER = 50;
  SW.START_WORKERS = 8;
  SW.MAX_SUPPLY = 200;
  SW.KYBER_PER_TRIP = 5;
  SW.GAS_PER_TRIP = 4;
  SW.MINE_TIME = 1.9;
  SW.GAS_TIME = 1.4;
  SW.SHIELD_REGEN_DELAY = 6;
  SW.SHIELD_REGEN_RATE = 3;

  SW.FACTIONS = {
    empire: {
      name: 'Galactic Empire',
      short: 'Empire',
      blurb: 'Disciplined troops and towering walkers. Durable armor, slow but crushing heavy units.',
      color: '#d33a3a',
      trait: 'Heavy armor: walkers shrug off small arms fire.',
    },
    rebels: {
      name: 'Rebel Alliance',
      short: 'Rebels',
      blurb: 'Fewer, hardier fighters protected by regenerating deflector shields. Dominant starfighters.',
      color: '#e8a33a',
      trait: 'Deflector shields: units and structures regenerate shields out of combat.',
    },
    separatists: {
      name: 'Separatist Droid Army',
      short: 'Separatists',
      blurb: 'Cheap droids in overwhelming numbers. Battle droids are built two at a time.',
      color: '#3a8ee8',
      trait: 'Mass production: B1 droids come in pairs; most droids cost less.',
    },
  };

  // ---------------------------------------------------------------- units
  // weapon: { dmg, cd, range, hits:'g'|'a'|'ga', bonus:{tag:+dmg}, count, splash(tiles), bolt:color, kind }
  const U = {};

  // ---- Empire
  U.imp_worker = {
    faction: 'empire', name: 'Imperial Labor Droid', role: 'worker', art: 'mouse',
    cost: [50, 0], supply: 1, time: 12, hp: 45, armor: 0, tags: ['light', 'mech'],
    speed: 2.8, radius: 8, sight: 8, hotkey: 'E',
    weapons: [{ dmg: 5, cd: 1.5, range: 0.2, hits: 'g', kind: 'melee' }],
    desc: 'Harvests kyber and tibanna, constructs buildings.',
  };
  U.stormtrooper = {
    faction: 'empire', name: 'Stormtrooper', role: 'infantry', art: 'stormtrooper',
    cost: [50, 0], supply: 1, time: 18, hp: 45, armor: 0, tags: ['light', 'bio'],
    speed: 2.25, radius: 7, sight: 9, hotkey: 'T',
    weapons: [{ dmg: 6, cd: 0.63, range: 5, hits: 'ga', bolt: '#ff3b3b', kind: 'blaster' }],
    desc: 'Versatile blaster infantry. Hits ground and air.',
    strong: 'Air units, B1 droids, bombers', weak: 'AT-STs, Speeder bikes, Hailfires',
  };
  U.scout_trooper = {
    faction: 'empire', name: 'Scout Trooper', role: 'raider', art: 'speederbike',
    cost: [75, 0], supply: 2, time: 22, hp: 90, armor: 0, tags: ['light', 'mech'],
    speed: 4.1, radius: 9, sight: 10, hotkey: 'S',
    weapons: [{ dmg: 8, cd: 0.9, range: 4, hits: 'g', bonus: { light: 10 }, bolt: '#ff3b3b', kind: 'blaster' }],
    desc: 'Fast speeder bike raider. Shreds light infantry and workers.',
    strong: 'Light infantry, workers, AATs', weak: 'Armored walkers, Droidekas, air',
  };
  U.at_st = {
    faction: 'empire', name: 'AT-ST Walker', role: 'vehicle', art: 'atst',
    cost: [125, 25], supply: 3, time: 30, hp: 200, armor: 1, tags: ['armored', 'mech'],
    speed: 2.4, radius: 12, sight: 10, hotkey: 'T',
    weapons: [{ dmg: 16, cd: 1.1, range: 6, hits: 'g', bonus: { light: 8 }, splash: 0.6, bolt: '#ff5a3b', kind: 'cannon' }],
    desc: 'Scout walker with twin chin cannons. Splash damage vs groups.',
    strong: 'Light infantry swarms', weak: 'Wookiees, AATs, air',
  };
  U.at_at = {
    faction: 'empire', name: 'AT-AT Walker', role: 'heavy', art: 'atat', requires: 'tech',
    cost: [300, 200], supply: 6, time: 55, hp: 550, armor: 2, tags: ['armored', 'mech', 'massive'],
    speed: 1.4, radius: 22, sight: 11, hotkey: 'A',
    weapons: [{ dmg: 45, cd: 2.4, range: 9, hits: 'g', bonus: { armored: 20 }, splash: 1.0, bolt: '#ff2a2a', kind: 'heavy' }],
    desc: 'Massive assault walker. Long-range heavy cannons. Cannot hit air.',
    strong: 'Ground armies, Droidekas, structures', weak: 'Air units, AATs, Wookiees',
  };
  U.tie_fighter = {
    faction: 'empire', name: 'TIE Fighter', role: 'fighter', art: 'tie',
    cost: [125, 50], supply: 2, time: 30, hp: 100, armor: 0, tags: ['light', 'mech', 'air'],
    speed: 4.4, radius: 10, sight: 10, hotkey: 'F', air: true,
    weapons: [{ dmg: 6, count: 2, cd: 0.9, range: 5, hits: 'ga', bonus: { air: 4 }, bolt: '#5bff6a', kind: 'blaster' }],
    desc: 'Swift starfighter. Strong against other air units.',
    strong: 'Air, bombers', weak: 'Anti-air infantry, towers',
  };
  U.tie_bomber = {
    faction: 'empire', name: 'TIE Bomber', role: 'bomber', art: 'tiebomber', requires: 'tech',
    cost: [150, 100], supply: 3, time: 40, hp: 220, armor: 1, tags: ['armored', 'mech', 'air'],
    speed: 2.6, radius: 12, sight: 9, hotkey: 'B', air: true,
    weapons: [{ dmg: 35, cd: 2.0, range: 1.5, hits: 'g', splash: 1.5, bolt: '#5bff6a', kind: 'bomb' }],
    desc: 'Drops proton bombs on ground targets. Splash damage.',
    strong: 'Ground clumps, structures', weak: 'Fighters, anti-air',
  };

  // ---- Rebels
  U.reb_worker = {
    faction: 'rebels', name: 'Astromech Droid', role: 'worker', art: 'astromech',
    cost: [50, 0], supply: 1, time: 12, hp: 25, shields: 20, armor: 0, tags: ['light', 'mech'],
    speed: 2.8, radius: 8, sight: 8, hotkey: 'E',
    weapons: [{ dmg: 5, cd: 1.5, range: 0.2, hits: 'g', kind: 'melee' }],
    desc: 'Harvests kyber and tibanna, constructs buildings.',
  };
  U.rebel_trooper = {
    faction: 'rebels', name: 'Rebel Trooper', role: 'infantry', art: 'rebeltrooper',
    cost: [50, 0], supply: 1, time: 18, hp: 28, shields: 20, armor: 0, tags: ['light', 'bio'],
    speed: 2.4, radius: 7, sight: 9, hotkey: 'T',
    weapons: [{ dmg: 6, cd: 0.62, range: 5, hits: 'ga', bolt: '#ff6a2a', kind: 'blaster' }],
    desc: 'Shielded blaster infantry. Hits ground and air.',
    strong: 'Air units, B1 droids', weak: 'Speeder bikes, AT-STs, Hailfires',
  };
  U.wookiee = {
    faction: 'rebels', name: 'Wookiee Warrior', role: 'raider', art: 'wookiee',
    cost: [100, 0], supply: 2, time: 26, hp: 100, shields: 30, armor: 1, tags: ['bio'],
    speed: 2.6, radius: 9, sight: 9, hotkey: 'W',
    weapons: [{ dmg: 13, cd: 1.3, range: 3, hits: 'g', bonus: { armored: 11 }, bolt: '#ffd23a', kind: 'blaster' }],
    desc: 'Tough short-range bowcaster warrior. Not "light", so anti-light weapons do less.',
    strong: 'Walkers, tanks, Droidekas', weak: 'Massed infantry, air',
  };
  U.t47 = {
    faction: 'rebels', name: 'T-47 Airspeeder', role: 'vehicle', art: 't47',
    cost: [125, 75], supply: 2, time: 30, hp: 100, shields: 40, armor: 0, tags: ['light', 'mech', 'air'],
    speed: 4.4, radius: 10, sight: 10, hotkey: 'T', air: true,
    weapons: [{ dmg: 10, cd: 1.0, range: 4, hits: 'g', bonus: { armored: 10 }, bolt: '#ff6a2a', kind: 'blaster' }],
    desc: 'Low-flying airspeeder with harpoon lasers. Hunts armored walkers and tanks.',
    strong: 'Walkers, tanks', weak: 'Infantry, fighters',
  };
  U.ion_artillery = {
    faction: 'rebels', name: 'Ion Artillery', role: 'heavy', art: 'ion', requires: 'tech',
    cost: [275, 175], supply: 5, time: 50, hp: 220, shields: 180, armor: 1, tags: ['armored', 'mech', 'massive'],
    speed: 1.4, radius: 20, sight: 11, hotkey: 'I',
    weapons: [{ dmg: 40, cd: 2.6, range: 10, hits: 'g', bonus: { mech: 25 }, splash: 1.25, bolt: '#7ad9ff', kind: 'heavy' }],
    desc: 'Mobile ion cannon. Extreme range, devastating vs droids and vehicles.',
    strong: 'Droids, Speeder bikes, Hailfires', weak: 'Air, AATs, Wookiees',
  };
  U.xwing = {
    faction: 'rebels', name: 'X-Wing', role: 'fighter', art: 'xwing',
    cost: [150, 100], supply: 3, time: 34, hp: 140, shields: 80, armor: 0, tags: ['armored', 'mech', 'air'],
    speed: 4.0, radius: 12, sight: 10, hotkey: 'X', air: true,
    weapons: [{ dmg: 14, cd: 1.0, range: 6, hits: 'ga', bonus: { air: 8 }, bolt: '#ff4a2a', kind: 'blaster' }],
    desc: 'Elite multirole starfighter. Strong vs air, decent vs ground.',
    strong: 'Air units', weak: 'Anti-air infantry, Hailfires',
  };
  U.ywing = {
    faction: 'rebels', name: 'Y-Wing', role: 'bomber', art: 'ywing', requires: 'tech',
    cost: [175, 125], supply: 3, time: 42, hp: 180, shields: 120, armor: 1, tags: ['armored', 'mech', 'air'],
    speed: 2.6, radius: 13, sight: 9, hotkey: 'Y', air: true,
    weapons: [{ dmg: 30, cd: 2.0, range: 2, hits: 'g', bonus: { mech: 14 }, splash: 1.5, bolt: '#7ad9ff', kind: 'bomb' }],
    desc: 'Ion bomber. Splash damage, extra vs mechanical units.',
    strong: 'Droids, vehicles', weak: 'Fighters, anti-air',
  };

  // ---- Separatists
  U.sep_worker = {
    faction: 'separatists', name: 'Labor Droid', role: 'worker', art: 'labordroid',
    cost: [50, 0], supply: 1, time: 12, hp: 45, armor: 0, tags: ['light', 'mech'],
    speed: 2.8, radius: 8, sight: 8, hotkey: 'E',
    weapons: [{ dmg: 5, cd: 1.5, range: 0.2, hits: 'g', kind: 'melee' }],
    desc: 'Harvests kyber and tibanna, constructs buildings.',
  };
  U.b1 = {
    faction: 'separatists', name: 'B1 Battle Droids', role: 'infantry', art: 'b1',
    cost: [50, 0], supply: 1, time: 17, hp: 23, armor: 0, tags: ['light', 'mech'],
    speed: 2.25, radius: 6, sight: 8, hotkey: 'B', spawnCount: 2,
    weapons: [{ dmg: 5, cd: 1.05, range: 5, hits: 'ga', bolt: '#4ab0ff', kind: 'blaster' }],
    desc: 'Flimsy but cheap. Trained in pairs (cost and supply are for two).',
    strong: 'Air units, AATs', weak: 'AT-STs, Speeder bikes, Ion Artillery',
  };
  U.droideka = {
    faction: 'separatists', name: 'Droideka', role: 'raider', art: 'droideka',
    cost: [100, 25], supply: 2, time: 26, hp: 60, shields: 90, armor: 1, tags: ['armored', 'mech'],
    speed: 3.6, radius: 9, sight: 9, hotkey: 'D',
    weapons: [{ dmg: 7, count: 2, cd: 0.8, range: 4, hits: 'g', bolt: '#4ab0ff', kind: 'blaster' }],
    desc: 'Rolling destroyer droid with a personal deflector shield. Ground only.',
    strong: 'Hailfires, B1s, AT-STs', weak: 'Wookiees, AT-ATs, AATs',
  };
  U.aat = {
    faction: 'separatists', name: 'AAT Battle Tank', role: 'vehicle', art: 'aat',
    cost: [150, 50], supply: 3, time: 32, hp: 230, armor: 1, tags: ['armored', 'mech'],
    speed: 2.6, radius: 13, sight: 10, hotkey: 'A',
    weapons: [{ dmg: 21, cd: 1.3, range: 6, hits: 'g', bonus: { armored: 16 }, bolt: '#4ab0ff', kind: 'cannon' }],
    desc: 'Hover tank with a heavy laser cannon. Strong vs armored targets.',
    strong: 'Walkers, Ion Artillery, Droidekas', weak: 'Air, infantry, Wookiees',
  };
  U.hailfire = {
    faction: 'separatists', name: 'Hailfire Droid', role: 'heavy', art: 'hailfire', requires: 'tech',
    cost: [200, 100], supply: 4, time: 45, hp: 300, armor: 1, tags: ['armored', 'mech'],
    speed: 2.4, radius: 14, sight: 11, hotkey: 'H',
    weapons: [{ dmg: 12, count: 2, cd: 1.5, range: 8, hits: 'ga', bonus: { air: 4 }, splash: 0.75, bolt: '#ffb23a', kind: 'missile' }],
    desc: 'Wheeled missile platform. Long range, splash, and can hit air.',
    strong: 'Air, clumped infantry', weak: 'AATs, Wookiees, walkers',
  };
  U.vulture = {
    faction: 'separatists', name: 'Vulture Droid', role: 'fighter', art: 'vulture',
    cost: [100, 40], supply: 2, time: 24, hp: 80, armor: 0, tags: ['light', 'mech', 'air'],
    speed: 4.6, radius: 10, sight: 9, hotkey: 'V', air: true,
    weapons: [{ dmg: 4, count: 2, cd: 0.8, range: 5, hits: 'ga', bonus: { air: 4 }, bolt: '#4ab0ff', kind: 'blaster' }],
    desc: 'Cheap droid starfighter. Swarm enemy air.',
    strong: 'Air, bombers', weak: 'Anti-air, splash',
  };
  U.hyena = {
    faction: 'separatists', name: 'Hyena Bomber', role: 'bomber', art: 'hyena', requires: 'tech',
    cost: [150, 100], supply: 3, time: 40, hp: 210, armor: 1, tags: ['armored', 'mech', 'air'],
    speed: 2.7, radius: 12, sight: 9, hotkey: 'Y', air: true,
    weapons: [{ dmg: 34, cd: 2.0, range: 1.5, hits: 'g', splash: 1.5, bolt: '#4ab0ff', kind: 'bomb' }],
    desc: 'Droid bomber. Splash damage against ground targets.',
    strong: 'Ground clumps, structures', weak: 'Fighters, anti-air',
  };

  // --------------------------------------------------------------- buildings
  // Shared templates per role keep the economy symmetric; factions differ in units.
  const ROLES = {
    hq:        { cost: [400, 0],   time: 70, hp: 1500, armor: 1, size: [5, 5], supplyProvided: 15, sight: 11 },
    supply:    { cost: [100, 0],   time: 21, hp: 400,  armor: 1, size: [2, 2], supplyProvided: 10, sight: 7 },
    extractor: { cost: [75, 0],    time: 21, hp: 450,  armor: 1, size: [3, 3], sight: 7, onGeyser: true },
    barracks:  { cost: [150, 0],   time: 46, hp: 1000, armor: 1, size: [3, 3], sight: 8, requires: 'hq' },
    factory:   { cost: [150, 100], time: 43, hp: 1250, armor: 1, size: [4, 3], sight: 8, requires: 'barracks' },
    starport:  { cost: [150, 100], time: 36, hp: 1250, armor: 1, size: [4, 3], sight: 8, requires: 'factory' },
    tech:      { cost: [150, 150], time: 50, hp: 850,  armor: 1, size: [3, 3], sight: 8, requires: 'barracks' },
    tower:     { cost: [125, 0],   time: 25, hp: 350,  armor: 1, size: [2, 2], sight: 10, requires: 'barracks' },
  };
  const TOWER_WEAPON = { dmg: 15, cd: 1.0, range: 7, hits: 'ga', kind: 'cannon' };

  const B = {};
  function bld(key, faction, role, name, extra) {
    const t = ROLES[role];
    B[key] = Object.assign({
      faction, role, name, art: key,
      cost: t.cost, time: t.time, hp: t.hp, armor: t.armor, size: t.size, sight: t.sight,
      supplyProvided: t.supplyProvided || 0, onGeyser: !!t.onGeyser,
      requiresRole: t.requires || null, tags: ['armored', 'structure'],
      trains: [], building: true,
    }, extra || {});
  }

  bld('imp_hq', 'empire', 'hq', 'Imperial Command Center', { trains: ['imp_worker'], hotkey: 'C' });
  bld('imp_supply', 'empire', 'supply', 'Power Generator', { hotkey: 'P' });
  bld('imp_extractor', 'empire', 'extractor', 'Tibanna Refinery', { hotkey: 'R' });
  bld('imp_barracks', 'empire', 'barracks', 'Garrison', { trains: ['stormtrooper', 'scout_trooper'], hotkey: 'G' });
  bld('imp_factory', 'empire', 'factory', 'Walker Bay', { trains: ['at_st', 'at_at'], hotkey: 'W' });
  bld('imp_starport', 'empire', 'starport', 'TIE Hangar', { trains: ['tie_fighter', 'tie_bomber'], hotkey: 'H' });
  bld('imp_tech', 'empire', 'tech', 'Imperial Research Lab', { hotkey: 'L', desc: 'Unlocks AT-AT and TIE Bomber.' });
  bld('imp_tower', 'empire', 'tower', 'Turbolaser Tower', {
    hotkey: 'T', weapons: [Object.assign({ bolt: '#ff3b3b' }, TOWER_WEAPON)], hp: 400,
  });

  // Rebel structures trade some hull for regenerating shields.
  bld('reb_hq', 'rebels', 'hq', 'Rebel Command Temple', { trains: ['reb_worker'], hotkey: 'C', hp: 1000, shields: 500 });
  bld('reb_supply', 'rebels', 'supply', 'Moisture Vaporator', { hotkey: 'P', hp: 250, shields: 150 });
  bld('reb_extractor', 'rebels', 'extractor', 'Gas Siphon', { hotkey: 'R', hp: 300, shields: 150 });
  bld('reb_barracks', 'rebels', 'barracks', 'Training Grounds', { trains: ['rebel_trooper', 'wookiee'], hotkey: 'G', hp: 650, shields: 350 });
  bld('reb_factory', 'rebels', 'factory', 'Vehicle Workshop', { trains: ['t47', 'ion_artillery'], hotkey: 'W', hp: 800, shields: 450 });
  bld('reb_starport', 'rebels', 'starport', 'Starfighter Hangar', { trains: ['xwing', 'ywing'], hotkey: 'H', hp: 800, shields: 450 });
  bld('reb_tech', 'rebels', 'tech', 'Rebel War Room', { hotkey: 'L', hp: 550, shields: 300, desc: 'Unlocks Ion Artillery and Y-Wing.' });
  bld('reb_tower', 'rebels', 'tower', 'Defense Battery', {
    hotkey: 'T', weapons: [Object.assign({ bolt: '#ff6a2a' }, TOWER_WEAPON)], hp: 250, shields: 150,
  });

  // Separatist structures are slightly cheaper to put up but less durable.
  bld('sep_hq', 'separatists', 'hq', 'Droid Control Hub', { trains: ['sep_worker'], hotkey: 'C' });
  bld('sep_supply', 'separatists', 'supply', 'Droid Power Core', { hotkey: 'P', cost: [90, 0], hp: 350 });
  bld('sep_extractor', 'separatists', 'extractor', 'Tibanna Harvester', { hotkey: 'R' });
  bld('sep_barracks', 'separatists', 'barracks', 'Droid Foundry', { trains: ['b1', 'droideka'], hotkey: 'G', cost: [140, 0], hp: 900 });
  bld('sep_factory', 'separatists', 'factory', 'Heavy Foundry', { trains: ['aat', 'hailfire'], hotkey: 'W', hp: 1100 });
  bld('sep_starport', 'separatists', 'starport', 'Droid Hangar', { trains: ['vulture', 'hyena'], hotkey: 'H', hp: 1100 });
  bld('sep_tech', 'separatists', 'tech', 'Techno Union Lab', { hotkey: 'L', desc: 'Unlocks Hailfire Droid and Hyena Bomber.' });
  bld('sep_tower', 'separatists', 'tower', 'Defense Turret', {
    hotkey: 'T', weapons: [Object.assign({ bolt: '#4ab0ff' }, TOWER_WEAPON)], hp: 350,
  });

  // Finalize unit defs.
  for (const k in U) {
    const d = U[k];
    d.key = k;
    d.shields = d.shields || 0;
    d.air = !!d.air;
    d.spawnCount = d.spawnCount || 1;
    d.weapons = d.weapons || [];
  }
  for (const k in B) {
    const d = B[k];
    d.key = k;
    d.shields = d.shields || 0;
    d.weapons = d.weapons || [];
  }

  SW.UNITS = U;
  SW.BUILDINGS = B;
  SW.DEFS = Object.assign({}, U, B);
  SW.ROLES = ROLES;

  SW.factionBuilding = function (faction, role) {
    for (const k in B) if (B[k].faction === faction && B[k].role === role) return B[k];
    return null;
  };
  SW.factionUnits = function (faction) {
    return Object.values(U).filter(u => u.faction === faction);
  };
  SW.workerOf = function (faction) {
    return Object.values(U).find(u => u.faction === faction && u.role === 'worker');
  };
  // Value used to compare army costs (gas is scarcer than kyber).
  SW.costValue = function (def) {
    return def.cost[0] + def.cost[1] * 1.5;
  };

  if (typeof module !== 'undefined') module.exports = SW;
})(globalThis.SW = globalThis.SW || {});
