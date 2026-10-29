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
    gun:    { QB: [-5, 0], RB: [-5, 2.6], WR1: [-0.8, -17], WR2: [-0.8, 16], TE: [-0.8, 5], OL0: [-0.6, -1.6], OL1: [-0.6, 1.6] },
    under:  { QB: [-1.4, 0], RB: [-5.5, 0], WR1: [-0.8, -17], WR2: [-0.8, 16], TE: [-0.8, 4.6], OL0: [-0.6, -1.6], OL1: [-0.6, 1.6] },
    spread: { QB: [-5, 0], RB: [-5, -2.6], WR1: [-0.8, -20], WR2: [-0.8, 20], TE: [-0.8, -9], OL0: [-0.6, -1.6], OL1: [-0.6, 1.6] },
    // special-teams looks used by the fakes
    punt:   { QB: [-12, 0], RB: [-3, -2], WR1: [-0.8, -22], WR2: [-0.8, 22], TE: [-0.8, 4], OL0: [-0.6, -1.6], OL1: [-0.6, 1.6] },
    fakefg: { QB: [-7, 0], RB: [-7, 2.2], WR1: [-0.8, -7], WR2: [-0.8, 7], TE: [-0.8, 3.4], OL0: [-0.6, -1.6], OL1: [-0.6, 1.6] }
  };

  // Defensive alignment (offense-relative, dx > 0 is the defense's side).
  var DEF_ALIGN = { F1: [1.1, -3.2], F2: [1.1, 3.2], NT: [1.1, 0], M: [5, -1], B1: [6.5, -16], DB: [6.5, 15.5], B2: [13, 2] };

  var OFFENSE = [
    { id: 'slants', name: 'SLANTS', type: 'pass', form: 'gun', primary: 'WR2',
      routes: { WR1: [[4, 0], [10, 8]], WR2: [[4, 0], [10, -8]], TE: [[5, 0], [6, 9]], RB: [[1, 4], [4, 10]] },
      cont: { WR1: true, WR2: true } },
    { id: 'deep', name: 'DEEP STRIKE', type: 'pass', form: 'gun', primary: 'WR1', drop: 6,
      routes: { WR1: [[34, 0]], WR2: [[34, 0]], TE: [[10, 0], [22, -6]], RB: [[2, -5], [5, -9]] },
      cont: { WR1: true, WR2: true, TE: true } },
    { id: 'curl', name: 'CURL FLAT', type: 'pass', form: 'gun', primary: 'TE',
      routes: { WR1: [[13, 0], [11, 1]], WR2: [[13, 0], [11, -1]], TE: [[3, 0], [4, 10]], RB: [[4, -3], [7, -12]] },
      cont: {} },
    { id: 'post', name: 'POST CORNER', type: 'pass', form: 'gun', primary: 'WR1',
      routes: { WR1: [[12, 0], [26, 10]], WR2: [[12, 0], [24, 8]], TE: [[7, 0], [8, -12]], RB: [[2, 6]] },
      cont: { WR1: true, WR2: true, TE: true } },
    { id: 'mesh', name: 'MESH', type: 'pass', form: 'spread', primary: 'TE',
      routes: { WR1: [[5, 0], [6, 26]], WR2: [[6, 0], [7, -26]], TE: [[18, 0]], RB: [[2, -8]] },
      cont: { WR1: true, WR2: true, TE: true } },
    { id: 'screen', name: 'HB SCREEN', type: 'screen', form: 'gun', primary: 'RB',
      routes: { RB: [[-2, -3], [-1, -9]], WR1: [[6, 0]], WR2: [[25, 0]], TE: [[3, 0], [4, -6]] },
      cont: { WR2: true }, block: { WR1: true, TE: true } },
    { id: 'blast', name: 'HB BLAST', type: 'run', form: 'under',
      run: [[3.5, 1.4], [15, 1.6]], block: { WR1: true, WR2: true, TE: true } },
    { id: 'toss', name: 'TOSS SWEEP', type: 'run', form: 'under', pitch: true,
      run: [[0, 6], [3.5, 11], [15, 13]], block: { WR1: true, WR2: true, TE: true } },
    { id: 'hail', name: 'HAIL MARY', type: 'pass', form: 'spread', primary: 'WR2', drop: 9,
      routes: { WR1: [[40, 9]], WR2: [[40, -9]], TE: [[38, 10]], RB: [[1, 0]] },
      cont: { WR1: true, WR2: true, TE: true }, block: { RB: true } }
  ];

  var SPECIAL = [
    { id: 'punt', name: 'PUNT', type: 'punt', special: true },
    { id: 'fg', name: 'FIELD GOAL', type: 'fg', special: true },
    { id: 'fakepunt', name: 'FAKE PUNT', type: 'pass', form: 'punt', special: true, primary: 'WR2', drop: 6.5,
      routes: { WR1: [[12, 0], [20, 6]], WR2: [[26, 0]], TE: [[6, 0], [8, -7]], RB: [[1, -4], [3, -10]] },
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
    { id: 'man', name: 'MAN PRESS', a: { F1: 'rush', F2: 'rush', NT: 'spy', M: { man: 'RB' }, B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: { man: 'TE' } } },
    { id: 'c2', name: 'COVER 2', a: { F1: 'rush', F2: 'rush', NT: { zone: [4, 0] }, M: { zone: [8, -5] }, B1: { zone: [17, -13] }, DB: { zone: [17, 13] }, B2: { zone: [9, 7] } } },
    { id: 'c3', name: 'COVER 3', a: { F1: 'rush', F2: 'rush', NT: { zone: [5, 0] }, M: { zone: [7, -9] }, B1: { zone: [20, -15] }, DB: { zone: [20, 15] }, B2: { zone: [24, 0] } } },
    { id: 'sblitz', name: 'SAFETY BLITZ', a: { F1: 'rush', F2: 'rush', NT: 'spy', M: { man: 'TE' }, B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: 'rush' } },
    { id: 'allout', name: 'ALL-OUT BLITZ', a: { F1: 'rush', F2: 'rush', NT: 'rush', M: 'rush', B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: 'rush' } },
    { id: 'zblitz', name: 'ZONE BLITZ', a: { F1: { zone: [4, -9] }, F2: 'rush', NT: 'rush', M: 'rush', B1: { zone: [14, -12] }, DB: { zone: [14, 12] }, B2: { zone: [22, 0] } } },
    { id: 'prevent', name: 'PREVENT', a: { F1: 'rush', F2: 'rush', NT: { zone: [6, 0] }, M: { zone: [12, 0] }, B1: { zone: [22, -14] }, DB: { zone: [22, 14] }, B2: { zone: [30, 0] } } },
    { id: 'runstuff', name: 'RUN STUFF', a: { F1: 'runfit', F2: 'runfit', NT: 'runfit', M: 'runfit', B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: 'spy' } },
    { id: 'spy', name: 'QB SPY', a: { F1: 'rush', F2: 'rush', NT: 'rush', M: 'spy', B1: { man: 'WR1' }, DB: { man: 'WR2' }, B2: { zone: [20, 0] } } }
  ];

  FB.Plays = { FORMATIONS: FORMATIONS, DEF_ALIGN: DEF_ALIGN, OFFENSE: OFFENSE, SPECIAL: SPECIAL, DEFENSE: DEFENSE,
    ROUTES: ROUTES, ROUTE_NAMES: ROUTE_NAMES, DEFAULT_CUSTOM: DEFAULT_CUSTOM, customPlay: customPlay };
})();
