/*
 * Football Blitz '26 — playbook.
 *
 * Coordinates are offense-relative yards: dx = downfield from the line of
 * scrimmage (+ is toward the goal the offense attacks), dy = across the field
 * (+ is to the right as seen from behind the offense). Routes are lists of
 * offsets from the player's alignment spot.
 */
(function () {
  var FB = (window.FB = window.FB || {});

  var FORMATIONS = {
    // 11 on offense: five linemen (OL3 LT, OL0 LG, OL2 C, OL1 RG, OL4 RT), QB, RB, TE and three receivers
    gun:    { QB: [-5, 0], RB: [-5, 2.6], WR1: [-0.8, -17], WR2: [-0.8, 16], WR3: [-0.8, -10], TE: [-0.8, 5] },
    under:  { QB: [-1.4, 0], RB: [-5.5, 0], WR1: [-0.8, -17], WR2: [-0.8, 16], WR3: [-0.8, -10], TE: [-0.8, 4.8] },
    spread: { QB: [-5, 0], RB: [-5, -2.6], WR1: [-0.8, -20], WR2: [-0.8, 20], WR3: [-0.8, 10], TE: [-0.8, -9] },
    // special-teams looks used by the fakes
    punt:   { QB: [-12, 0], RB: [-3, -2], WR1: [-0.8, -22], WR2: [-0.8, 22], WR3: [-0.8, -4.8], TE: [-0.8, 4.8] },
    fakefg: { QB: [-7, 0], RB: [-7, 2.2], WR1: [-0.8, -6.4], WR2: [-0.8, 6.4], WR3: [-0.8, -4.8], TE: [-0.8, 4.8] }
  };
  var LINE = { OL3: [-0.6, -3.2], OL0: [-0.6, -1.6], OL2: [-0.6, 0], OL1: [-0.6, 1.6], OL4: [-0.6, 3.2] };
  Object.keys(FORMATIONS).forEach(function (f) { Object.keys(LINE).forEach(function (k) { FORMATIONS[f][k] = LINE[k]; }); });
  var OL_ROLES = ['OL0', 'OL1', 'OL2', 'OL3', 'OL4'];

  // Defensive alignment (offense-relative, dx > 0 is the defense's side).
  // 4-3: ends F1/F2, tackles T2/NT, linebackers W/M/SL, corners B1/DB, safeties B2/FS
  var DEF_ALIGN = { F1: [1.1, -4.6], T2: [1.1, -1.0], NT: [1.1, 1.0], F2: [1.1, 4.6], W: [5, -6], M: [5, 0], SL: [5, 6],
    B1: [6.5, -16], DB: [6.5, 15.5], B2: [13, -7], FS: [13, 7] };
  var DEF_KEYS = ['F1', 'T2', 'NT', 'F2', 'W', 'M', 'SL', 'B1', 'DB', 'B2', 'FS'];

  var OFFENSE = [
    { id: 'slants', name: 'SLANTS', type: 'pass', form: 'gun', primary: 'WR2',
      routes: { WR3: [[6, 0], [5, 1]], WR1: [[4, 0], [10, 8]], WR2: [[4, 0], [10, -8]], TE: [[5, 0], [6, 9]], RB: [[1, 4], [4, 10]] },
      cont: { WR1: true, WR2: true } },
    { id: 'deep', name: 'DEEP STRIKE', type: 'pass', form: 'gun', primary: 'WR1', drop: 6,
      routes: { WR3: [[12, 0], [12, 9]], WR1: [[34, 0]], WR2: [[34, 0]], TE: [[10, 0], [22, -6]], RB: [[2, -5], [5, -9]] },
      cont: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'curl', name: 'CURL FLAT', type: 'pass', form: 'gun', primary: 'TE',
      routes: { WR3: [[3, 0], [4, -8]], WR1: [[13, 0], [11, 1]], WR2: [[13, 0], [11, -1]], TE: [[3, 0], [4, 10]], RB: [[4, -3], [7, -12]] },
      cont: {} },
    { id: 'post', name: 'POST CORNER', type: 'pass', form: 'gun', primary: 'WR1',
      routes: { WR3: [[8, 0], [8, 10]], WR1: [[12, 0], [26, 10]], WR2: [[12, 0], [24, 8]], TE: [[7, 0], [8, -12]], RB: [[2, 6]] },
      cont: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'mesh', name: 'MESH', type: 'pass', form: 'spread', primary: 'TE',
      routes: { WR3: [[20, 0]], WR1: [[5, 0], [6, 26]], WR2: [[6, 0], [7, -26]], TE: [[18, 0]], RB: [[2, -8]] },
      cont: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'screen', name: 'HB SCREEN', type: 'screen', form: 'gun', primary: 'RB',
      routes: { WR3: [[2, 0]], RB: [[-2, -3], [-1, -9]], WR1: [[6, 0]], WR2: [[25, 0]], TE: [[3, 0], [4, -6]] },
      cont: { WR2: true }, block: { WR3: true, WR1: true, TE: true } },
    { id: 'blast', name: 'HB BLAST', type: 'run', form: 'under',
      run: [[3.5, 1.4], [15, 1.6]], block: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'toss', name: 'TOSS SWEEP', type: 'run', form: 'under', pitch: true,
      run: [[0, 6], [3.5, 11], [15, 13]], block: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'hail', name: 'HAIL MARY', type: 'pass', form: 'spread', primary: 'WR2', drop: 9,
      routes: { WR3: [[40, 4]], WR1: [[40, 9]], WR2: [[40, -9]], TE: [[38, 10]], RB: [[1, 0]] },
      cont: { WR3: true, WR1: true, WR2: true, TE: true }, block: { RB: true } }
  ];

  // Page two: classic concepts every playbook runs, drawn up for the 11-man game.
  //   pa: play-action fake to the back first; boot: where the QB rolls out to
  //   draw: the QB shows pass, then hands off late; keeper: the QB runs it
  var OFFENSE2 = [
    { id: 'verts', name: 'FOUR VERTS', type: 'pass', form: 'spread', primary: 'TE', drop: 6,
      routes: { WR3: [[30, -1]], WR1: [[30, 2]], WR2: [[30, -2]], TE: [[30, 0]], RB: [[2, 4], [4, 6]] },
      cont: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'smash', name: 'SMASH', type: 'pass', form: 'gun', primary: 'TE',
      routes: { WR3: [[10, 0], [18, -8]], WR1: [[6, 0], [5, 1]], WR2: [[6, 0], [5, -1]], TE: [[10, 0], [18, 9]], RB: [[1, -4], [3, -9]] },
      cont: { WR3: true, TE: true } },
    { id: 'flood', name: 'FLOOD', type: 'pass', form: 'gun', primary: 'TE',
      routes: { WR3: [[5, 0], [6, 12]], WR2: [[30, 0]], TE: [[10, 0], [10, 9]], RB: [[1, 4], [3, 10]], WR1: [[12, 0], [12, 14]] },
      cont: { WR3: true, WR2: true, TE: true, WR1: true } },
    { id: 'stick', name: 'STICK', type: 'pass', form: 'gun', primary: 'TE',
      routes: { WR3: [[6, 0], [6, 1]], TE: [[6, 0], [6, -1]], WR2: [[25, 0]], RB: [[1, 4], [3, 9]], WR1: [[3, 0], [9, 7]] },
      cont: { WR2: true, WR1: true } },
    { id: 'drive', name: 'DRIVE', type: 'pass', form: 'gun', primary: 'TE',
      routes: { WR3: [[18, 0]], TE: [[2, 0], [3, -14]], WR1: [[12, 0], [12, 13]], WR2: [[28, 0]], RB: [[0, 4], [2, 9]] },
      cont: { WR3: true, TE: true, WR1: true, WR2: true } },
    { id: 'paboot', name: 'PA BOOT', type: 'pass', form: 'under', primary: 'TE', pa: true, boot: [-6, -8],
      routes: { WR3: [[2, 0], [4, -8]], TE: [[3, 0], [5, -14]], WR1: [[16, 0], [14, -3]], WR2: [[12, 0], [24, -9]], RB: [[1.5, 1.2], [5, 7]] },
      cont: { TE: true, WR2: true } },
    { id: 'draw', name: 'HB DRAW', type: 'run', form: 'gun', draw: true,
      run: [[-0.3, -2.4], [6, -2.4], [15, -2.4]], block: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'counter', name: 'COUNTER', type: 'run', form: 'under',
      run: [[0.5, 1.5], [1.5, -1], [4, -3.5], [15, -4.5]], block: { WR3: true, WR1: true, WR2: true, TE: true } },
    { id: 'sneak', name: 'QB SNEAK', type: 'run', form: 'under', keeper: true,
      run: [[2, 0.3], [6, 0.3]], block: { WR3: true, WR1: true, WR2: true, TE: true, RB: true } }
  ];

  var SPECIAL = [
    { id: 'punt', name: 'PUNT', type: 'punt', special: true },
    { id: 'fg', name: 'FIELD GOAL', type: 'fg', special: true },
    { id: 'fakepunt', name: 'FAKE PUNT', type: 'pass', form: 'punt', special: true, primary: 'WR2', drop: 6.5,
      routes: { WR3: [[6, 0], [8, 4]], WR1: [[12, 0], [20, 6]], WR2: [[26, 0]], TE: [[6, 0], [8, -7]], RB: [[1, -4], [3, -10]] },
      cont: { WR1: true, WR2: true } },
    { id: 'fakefg', name: 'FAKE FG', type: 'pass', form: 'fakefg', special: true, primary: 'TE', drop: 5,
      routes: { TE: [[2, 0], [4, 11]], WR1: [[10, 0], [17, -7]], WR2: [[10, 0], [17, 7]], RB: [[1, 7], [4, 13]] },
      cont: { WR1: true, WR2: true } }
  ];

  // ---------------------------------------------------- create-a-play
  // Route shapes in yards; dy > 0 means "toward the middle of the field".
  var ROUTES = {
    GO: { pts: [[32, 0]], cont: true },
    SLANT: { pts: [[3, 0], [9, 7]], cont: true },
    OUT: { pts: [[8, 0], [8, -9]] },
    IN: { pts: [[8, 0], [8, 12]], cont: true },
    CURL: { pts: [[12, 0], [10, 1]] },
    POST: { pts: [[12, 0], [24, 9]], cont: true },
    CORNER: { pts: [[12, 0], [22, -9]], cont: true },
    FLAT: { pts: [[1, -3], [3, -10]] },
    WHEEL: { pts: [[1, -5], [18, -7]], cont: true },
    BLOCK: { block: true }
  };
  var ROUTE_NAMES = Object.keys(ROUTES);
  var DEFAULT_CUSTOM = { WR1: 'POST', WR2: 'CORNER', TE: 'IN', RB: 'FLAT' };

  // Build a playable play from { role: routeName }.
  function customPlay(sel) {
    sel = sel || DEFAULT_CUSTOM;
    var F = FORMATIONS.gun, play = { id: 'custom', name: 'MY PLAY', type: 'pass', form: 'gun', special: true, routes: {}, cont: {}, block: {}, primary: null };
    ['WR1', 'WR2', 'TE', 'RB'].forEach(function (role) {
      var r = ROUTES[sel[role]] || ROUTES.GO;
      var inward = F[role][1] < 0 ? 1 : -1;
      if (r.block) { play.block[role] = true; return; }
      play.routes[role] = r.pts.map(function (pt) { return [pt[0], pt[1] * inward]; });
      if (r.cont) play.cont[role] = true;
      if (!play.primary) play.primary = role;
    });
    if (!play.primary) play.primary = 'WR1';
    return play;
  }

  // Defensive assignments: 'rush', 'spy', 'runfit', {man: role}, {zone: [dx, dy]}
  var DEFENSE = [
    { id: 'man', name: 'MAN PRESS', a: { T2: 'rush', W: { man: 'WR3' }, SL: { zone: [6, 6] }, FS: { zone: [20, 0] }, F1: 'rush', F2: 'rush', NT: 'spy', M: { man: 'RB' }, B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: { man: 'TE' } } },
    { id: 'c2', name: 'COVER 2', a: { T2: 'rush', W: { zone: [7, -9] }, SL: { zone: [7, 9] }, FS: { zone: [9, -7] }, F1: 'rush', F2: 'rush', NT: { zone: [4, 0] }, M: { zone: [8, -5] }, B1: { zone: [17, -13] }, DB: { zone: [17, 13] }, B2: { zone: [9, 7] } } },
    { id: 'c3', name: 'COVER 3', a: { T2: 'rush', W: { zone: [6, -12] }, SL: { zone: [6, 12] }, FS: { zone: [10, -4] }, F1: 'rush', F2: 'rush', NT: { zone: [5, 0] }, M: { zone: [7, -9] }, B1: { zone: [20, -15] }, DB: { zone: [20, 15] }, B2: { zone: [24, 0] } } },
    { id: 'sblitz', name: 'SAFETY BLITZ', a: { T2: 'rush', W: { man: 'WR3' }, SL: { zone: [7, 0] }, FS: { zone: [20, 0] }, F1: 'rush', F2: 'rush', NT: 'spy', M: { man: 'TE' }, B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: 'rush' } },
    { id: 'allout', name: 'ALL-OUT BLITZ', a: { T2: 'rush', W: 'rush', SL: { man: 'TE' }, FS: { man: 'WR3' }, F1: 'rush', F2: 'rush', NT: 'rush', M: 'rush', B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: 'rush' } },
    { id: 'zblitz', name: 'ZONE BLITZ', a: { T2: { zone: [4, 9] }, W: 'rush', SL: { zone: [8, 6] }, FS: { zone: [14, 0] }, F1: { zone: [4, -9] }, F2: 'rush', NT: 'rush', M: 'rush', B1: { zone: [14, -12] }, DB: { zone: [14, 12] }, B2: { zone: [22, 0] } } },
    { id: 'prevent', name: 'PREVENT', a: { T2: 'rush', W: { zone: [10, -10] }, SL: { zone: [10, 10] }, FS: { zone: [28, -10] }, F1: 'rush', F2: 'rush', NT: { zone: [6, 0] }, M: { zone: [12, 0] }, B1: { zone: [22, -14] }, DB: { zone: [22, 14] }, B2: { zone: [30, 0] } } },
    { id: 'runstuff', name: 'RUN STUFF', a: { T2: 'runfit', W: 'runfit', SL: 'runfit', FS: { zone: [10, 0] }, F1: 'runfit', F2: 'runfit', NT: 'runfit', M: 'runfit', B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: 'spy' } },
    { id: 'spy', name: 'QB SPY', a: { T2: 'rush', W: { man: 'WR3' }, SL: { man: 'TE' }, FS: { man: 'RB' }, F1: 'rush', F2: 'rush', NT: 'rush', M: 'spy', B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: { zone: [20, 0] } } }
  ];

  FB.Plays = { FORMATIONS: FORMATIONS, DEF_ALIGN: DEF_ALIGN, DEF_KEYS: DEF_KEYS, OL_ROLES: OL_ROLES, OFFENSE: OFFENSE, OFFENSE2: OFFENSE2, SPECIAL: SPECIAL, DEFENSE: DEFENSE,
    ROUTES: ROUTES, ROUTE_NAMES: ROUTE_NAMES, DEFAULT_CUSTOM: DEFAULT_CUSTOM, customPlay: customPlay };
})();
