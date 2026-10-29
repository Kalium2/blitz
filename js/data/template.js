/*
 * Football Blitz '26 — player character template.
 *
 * Every player in the game (all 32 teams, both sides of the ball) is built
 * from ONE template. Roster entries only store a name, a position, a fantasy
 * seed (fantasy points per game) and optional trait tags; every gameplay value
 * is derived from those through the same deterministic formulas below, so two
 * players with the same position and fantasy production get identical
 * ratings.
 *
 * Template fields (all ratings are 40-99):
 *   spd  speed            -> top running speed
 *   agi  agility          -> acceleration / cutting / juking
 *   str  strength         -> blocking, shedding blocks, breaking tackles
 *   cth  catching (hands) -> catch / interception chance
 *   thp  throw power      -> ball velocity and max range (QB)
 *   tha  throw accuracy   -> pass placement error (QB)
 *   tak  tackling         -> tackle success
 *   cov  coverage         -> reaction speed in pass coverage
 *   prs  pass rush        -> how fast a rusher beats a block
 *   ovr  overall          -> headline number shown on player cards
 *
 * Fantasy seed:
 *   Offense (QB/RB/WR/TE): PPR fantasy points per game.
 *   Defense (EDGE/DT/LB/CB/S): IDP fantasy points per game
 *   (tackle 1, assist 0.5, sack 4, INT 4, FF 3, PD 1, TD 6 style scoring).
 *   Rookies (flag "rk") use a 2026 rookie projection instead of past stats.
 */
(function () {
  var FB = (window.FB = window.FB || {});

  // Per-position fantasy range used to normalise a fantasy seed to 0..1.
  // lo = replacement level starter, hi = elite (league-best type) season.
  var RANGE = {
    QB: [10, 24], RB: [6, 24], WR: [5, 21], TE: [3, 18],
    EDGE: [4, 14], DT: [4, 12], LB: [7, 17], CB: [4, 11], S: [5, 14]
  };

  // Position archetypes: [base, gain] for each rating. rating = base + gain * p
  var ARCH = {
    QB:   { spd: [58, 12], agi: [62, 14], str: [60, 10], cth: [45, 5], thp: [74, 22], tha: [68, 30], tak: [40, 0], cov: [40, 0], prs: [40, 0] },
    RB:   { spd: [82, 14], agi: [80, 17], str: [70, 20], cth: [60, 26], thp: [45, 0], tha: [45, 0], tak: [45, 0], cov: [40, 0], prs: [40, 0] },
    WR:   { spd: [84, 14], agi: [80, 16], str: [56, 16], cth: [76, 22], thp: [45, 0], tha: [45, 0], tak: [45, 0], cov: [45, 0], prs: [40, 0] },
    TE:   { spd: [74, 14], agi: [70, 14], str: [76, 16], cth: [72, 22], thp: [45, 0], tha: [45, 0], tak: [50, 0], cov: [40, 0], prs: [40, 0] },
    EDGE: { spd: [76, 14], agi: [72, 16], str: [76, 18], cth: [45, 8], thp: [40, 0], tha: [40, 0], tak: [72, 20], cov: [50, 12], prs: [75, 23] },
    DT:   { spd: [66, 12], agi: [64, 14], str: [85, 13], cth: [40, 6], thp: [40, 0], tha: [40, 0], tak: [72, 18], cov: [40, 6], prs: [70, 24] },
    LB:   { spd: [77, 15], agi: [74, 15], str: [72, 16], cth: [55, 18], thp: [40, 0], tha: [40, 0], tak: [80, 17], cov: [64, 22], prs: [60, 18] },
    CB:   { spd: [86, 12], agi: [84, 13], str: [56, 12], cth: [58, 26], thp: [40, 0], tha: [40, 0], tak: [62, 16], cov: [78, 20], prs: [45, 8] },
    S:    { spd: [83, 12], agi: [80, 13], str: [64, 14], cth: [60, 24], thp: [40, 0], tha: [40, 0], tak: [74, 18], cov: [72, 20], prs: [52, 14] }
  };

  // Trait tags add flat bonuses on top of the archetype.
  var TRAITS = {
    scrambler: { spd: 20, agi: 12 },   // running quarterback
    mobile:    { spd: 9, agi: 6 },     // can move, not a true runner
    cannon:    { thp: 7 },             // elite arm strength
    burner:    { spd: 5 },             // top-end deep speed
    power:     { str: 9 },             // power back / big body
    elusive:   { agi: 7 },             // shifty
    hands:     { cth: 5 },             // sure hands
    ballhawk:  { cth: 8, cov: 3 },     // takeaway defender
    rusher:    { prs: 5, spd: 3 },     // pass rush specialist
    tackler:   { tak: 5 }              // sure tackler
  };

  // Generic (unnamed) players: offensive linemen and depth defenders.
  var GENERIC = {
    OL: { spd: 58, agi: 60, str: 86, cth: 40, thp: 40, tha: 40, tak: 55, cov: 40, prs: 40 },
    DL: { spd: 64, agi: 62, str: 82, cth: 40, thp: 40, tha: 40, tak: 72, cov: 45, prs: 70 },
    DB: { spd: 84, agi: 80, str: 58, cth: 58, thp: 40, tha: 40, tak: 66, cov: 74, prs: 45 }
  };

  var KEYS = ['spd', 'agi', 'str', 'cth', 'thp', 'tha', 'tak', 'cov', 'prs'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Which template archetype a roster label maps to.
  function archetypeOf(pos) {
    if (pos === 'OLB' || pos === 'DE' || pos === 'EDGE') return 'EDGE';
    if (pos === 'DT' || pos === 'NT' || pos === 'DL') return 'DT';
    if (pos === 'ILB' || pos === 'MLB' || pos === 'LB') return 'LB';
    if (pos === 'CB' || pos === 'NB') return 'CB';
    if (pos === 'S' || pos === 'FS' || pos === 'SS' || pos === 'DB') return 'S';
    return pos;
  }

  function fantasyPct(arch, fp) {
    var r = RANGE[arch];
    return clamp((fp - r[0]) / (r[1] - r[0]), 0, 1);
  }

  // Build a full player object from a compact roster entry.
  function buildPlayer(entry, teamAbbr, slot) {
    var arch = archetypeOf(entry.pos);
    var p = fantasyPct(arch, entry.fp);
    var a = ARCH[arch];
    var r = {};
    KEYS.forEach(function (k) { r[k] = a[k][0] + a[k][1] * p; });
    (entry.tags || []).forEach(function (t) {
      var b = TRAITS[t];
      if (!b) return;
      Object.keys(b).forEach(function (k) { r[k] += b[k]; });
    });
    KEYS.forEach(function (k) { r[k] = Math.round(clamp(r[k], 40, 99)); });
    r.ovr = Math.round(clamp(66 + 31 * p + (entry.tags && entry.tags.length ? 1 : 0), 60, 99));
    return {
      id: teamAbbr + '-' + slot,
      name: entry.name,
      pos: entry.pos,
      arch: arch,
      fp: entry.fp,
      rookie: !!entry.rk,
      tags: entry.tags || [],
      r: r
    };
  }

  function genericPlayer(kind, teamAbbr, slot) {
    var base = GENERIC[kind];
    var r = {};
    KEYS.forEach(function (k) { r[k] = base[k]; });
    r.ovr = 72;
    return { id: teamAbbr + '-' + slot, name: '', pos: kind, arch: kind, fp: null, rookie: false, tags: [], r: r, generic: true };
  }

  // Headline numbers shown on a player card for the given archetype.
  function cardStats(pl) {
    var r = pl.r;
    switch (pl.arch) {
      case 'QB': return [['ARM', r.thp], ['ACC', r.tha], ['SPD', r.spd]];
      case 'RB': return [['SPD', r.spd], ['AGI', r.agi], ['STR', r.str]];
      case 'WR': return [['SPD', r.spd], ['HND', r.cth], ['AGI', r.agi]];
      case 'TE': return [['HND', r.cth], ['STR', r.str], ['SPD', r.spd]];
      case 'EDGE':
      case 'DT': return [['RSH', r.prs], ['STR', r.str], ['TKL', r.tak]];
      case 'LB': return [['TKL', r.tak], ['SPD', r.spd], ['COV', r.cov]];
      default: return [['COV', r.cov], ['SPD', r.spd], ['HND', r.cth]];
    }
  }

  FB.Template = {
    KEYS: KEYS,
    RANGE: RANGE,
    ARCH: ARCH,
    TRAITS: TRAITS,
    archetypeOf: archetypeOf,
    fantasyPct: fantasyPct,
    buildPlayer: buildPlayer,
    genericPlayer: genericPlayer,
    cardStats: cardStats
  };
})();
