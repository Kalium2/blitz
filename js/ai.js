/*
 * Football Blitz '26 — CPU play calling.
 */
(function () {
  var FB = (window.FB = window.FB || {});

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }
  function weighted(list, weights) {
    var total = 0, k;
    for (k in weights) total += weights[k];
    var r = Math.random() * total;
    for (k in weights) { r -= weights[k]; if (r <= 0) return byId(list, k); }
    return list[0];
  }

  function pickOffense(g) {
    var O = FB.Plays.OFFENSE.concat(FB.Plays.OFFENSE2), S = FB.Plays.SPECIAL;
    var toGo = g.toGo(), ytg = g.yardsToGoal();
    var trailing = g.score[g.poss] < g.score[1 - g.poss];
    var late = (g.quarter >= 4 && g.clock < 75) || (g.quarter === 2 && g.clock < 25);
    if (!g.conversion && g.down === 4) {
      var fgd = g.fgDistance();
      var goForIt = toGo <= 2 || (trailing && late) || (ytg <= 5 && toGo <= 3);
      if (!goForIt) {
        if (fgd <= 52 && !(trailing && late && g.score[1 - g.poss] - g.score[g.poss] > 3)) return byId(S, toGo <= 4 && Math.random() < 0.05 ? 'fakefg' : 'fg');
        if (!(trailing && late)) return byId(S, toGo <= 4 && Math.random() < 0.07 ? 'fakepunt' : 'punt');
      }
    }
    if (g.quarter === 2 && g.clock < 8 && g.fgDistance() <= 50 && !g.conversion) return byId(S, 'fg');
    if ((g.quarter >= 4) && g.clock < 10 && ytg > 30 && trailing) return byId(O, 'hail');
    if (!g.conversion && toGo <= 1 && Math.random() < 0.45) return byId(O, 'sneak');
    if (g.conversion || ytg <= 6) return weighted(O, { slants: 3, mesh: 3, blast: 3, toss: 2, curl: 2, stick: 3, smash: 2, paboot: 2, counter: 2 });
    if (toGo <= 3) return weighted(O, { blast: 4, toss: 3, slants: 3, curl: 2, screen: 2, mesh: 2, stick: 3, counter: 3, paboot: 2 });
    if (toGo >= 12) return weighted(O, { deep: 4, post: 4, mesh: 3, curl: 2, slants: 2, screen: 1, toss: 1, verts: 4, flood: 3, drive: 2, draw: 2 });
    return weighted(O, { slants: 3, deep: 2, curl: 3, post: 3, mesh: 3, screen: 2, blast: 2, toss: 2, smash: 3, flood: 2, stick: 2, drive: 3, paboot: 3, draw: 2, counter: 2, verts: 1 });
  }

  function pickDefense(g) {
    var D = FB.Plays.DEFENSE;
    var toGo = g.toGo(), ytg = g.yardsToGoal();
    var late = g.quarter >= 4 && g.clock < 30;
    var leading = g.score[1 - g.poss] > g.score[g.poss];
    if (late && leading && ytg > 35) return weighted(D, { prevent: 5, c3: 3 });
    if (g.conversion || ytg <= 6) return weighted(D, { runstuff: 3, man: 3, allout: 2, c2: 2 });
    if (toGo <= 3) return weighted(D, { runstuff: 4, sblitz: 2, man: 3, zblitz: 2, spy: 1 });
    if (toGo >= 12) return weighted(D, { c3: 4, c2: 3, prevent: 1, zblitz: 2, man: 2, sblitz: 1 });
    return weighted(D, { man: 3, c2: 3, c3: 3, sblitz: 2, allout: 1, zblitz: 2, spy: 1, runstuff: 1 });
  }

  FB.AI = { pickOffense: pickOffense, pickDefense: pickDefense };
})();
