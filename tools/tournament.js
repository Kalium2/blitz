#!/usr/bin/env node
// Full-game AI vs AI tournament (same AI, both start positions, many maps).
//   node tools/tournament.js [gamesPerPairing=8] [difficulty=hard]
'use strict';
const SW = require('../js/data.js');
require('../js/map.js'); require('../js/sim.js'); require('../js/ai.js');

const N = +(process.argv[2] || 8), diff = process.argv[3] || 'hard';
const F = Object.keys(SW.FACTIONS);

function play(fa, fb, seed) {
  const g = new SW.Game({ map: SW.generateMap(seed), players: [{ faction: fa, isAI: true }, { faction: fb, isAI: true }] });
  const ais = [new SW.AI(g, 0, diff), new SW.AI(g, 1, diff)];
  for (let t = 0; t < 20 * 60 * 30 && !g.over; t++) {
    for (const a of ais) a.update(SW.TICK);
    g.tick();
    g.events.length = 0;
  }
  if (g.over) return g.winner;
  // timeout: decide by remaining army + structure value
  const val = (i) => g.list.filter(e => e.alive && e.owner === i && e.def).reduce((s, e) => s + SW.costValue(e.def), 0);
  return val(0) >= val(1) ? 0 : 1;
}

const wins = {}, games = {};
for (const f of F) { wins[f] = 0; games[f] = 0; }
for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
  let wi = 0;
  for (let k = 0; k < N; k++) {
    const seed = 1000 + k * 7919;
    const flip = k % 2 === 1; // alternate start positions
    const [a, b] = flip ? [F[j], F[i]] : [F[i], F[j]];
    const w = play(a, b, seed);
    const winner = w === 0 ? a : b;
    if (winner === F[i]) wi++;
    wins[winner]++; games[F[i]]++; games[F[j]]++;
  }
  console.log(`${F[i].padEnd(12)} vs ${F[j].padEnd(12)}: ${wi}-${N - wi}`);
}
console.log('\nOverall win rate: ' + F.map(f => `${f} ${(wins[f] / games[f] * 100).toFixed(0)}%`).join(', '));
