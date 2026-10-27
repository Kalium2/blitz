#!/usr/bin/env node
// AI vs AI smoke test: node tools/aitest.js [factionA] [factionB] [difficulty] [seed]
'use strict';
const SW = require('../js/data.js');
require('../js/map.js'); require('../js/sim.js'); require('../js/ai.js');
const [fa = 'empire', fb = 'rebels', diff = 'normal', seed = '42'] = process.argv.slice(2);
const map = SW.generateMap(+seed);
const g = new SW.Game({ map, players: [{ faction: fa, isAI: true }, { faction: fb, isAI: true }] });
const ais = [new SW.AI(g, 0, diff), new SW.AI(g, 1, diff)];
const t0 = Date.now();
for (let t = 0; t < 20 * 60 * 30 && !g.over; t++) {
  for (const a of ais) a.update(SW.TICK);
  g.tick();
  g.events.length = 0;
  if (t % (20 * 60) === 0) {
    const s = g.players.map(p => {
      const units = g.list.filter(e => e.alive && e.owner === p.index && e.kind === 'unit');
      const blds = g.list.filter(e => e.alive && e.owner === p.index && e.kind === 'building');
      return `${p.faction}: k${Math.floor(p.kyber)} g${Math.floor(p.gas)} sup ${p.supplyUsed}/${p.supplyMax} w${units.filter(u => u.def.role === 'worker').length} army${units.filter(u => u.def.role !== 'worker').length} bld${blds.length} kills${p.stats.kills}`;
    });
    console.log(`${(g.time / 60).toFixed(0).padStart(2)}m  ${s.join(' | ')}`);
  }
}
console.log(g.over ? `Winner: ${g.players[g.winner]?.faction} at ${(g.time / 60).toFixed(1)} min` : 'No winner after 30 min');
console.log(`sim wall time ${(Date.now() - t0) / 1000}s`);
