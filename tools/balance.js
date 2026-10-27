#!/usr/bin/env node
// Headless balance harness: runs real engine battles between equal-cost armies.
//   node tools/balance.js            -> unit matrix + faction matchups
//   node tools/balance.js --units    -> unit-vs-unit matrix only
//   node tools/balance.js --factions -> faction matchups only
'use strict';
const SW = require('../js/data.js');
require('../js/map.js');
require('../js/sim.js');

const T = SW.TILE;
const args = process.argv.slice(2);
const BUDGET = +(args.find(a => a.startsWith('--budget=')) || '--budget=1500').split('=')[1];
const GAMES = +(args.find(a => a.startsWith('--games=')) || '--games=160').split('=')[1];

function arena() {
  const w = 64, h = 40;
  const terrain = new Uint8Array(w * h);
  return { w, h, terrain, resources: [], doodads: [], bases: [], starts: [] };
}

function combatUnits(faction) {
  return SW.factionUnits(faction).filter(u => u.role !== 'worker');
}

// army: [[type, count]] where count is number of production batches
function battle(fa, armyA, fb, armyB, seed) {
  const g = new SW.Game({ map: arena(), players: [{ faction: fa }, { faction: fb }], empty: true, noFog: true, headless: true });
  let rnd = seed || 1;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  const place = (army, owner, x0) => {
    const units = [];
    let i = 0;
    for (const [type, n] of army) {
      const d = SW.UNITS[type];
      for (let k = 0; k < n * d.spawnCount; k++) {
        const col = Math.floor(i / 12), row = i % 12;
        const x = (x0 + (owner === 0 ? -col : col) * 1.2) * T + rand() * 6;
        const y = (8 + row * 2) * T + rand() * 6;
        units.push(g.spawnUnit(type, owner, x, y));
        i++;
      }
    }
    return units;
  };
  const A = place(armyA, 0, 22), B = place(armyB, 1, 42);
  g.cmdAttackMove(A, 56 * T, 20 * T);
  g.cmdAttackMove(B, 8 * T, 20 * T);
  const value = (units) => units.reduce((s, u) => s + (u.alive ? SW.costValue(u.def) / u.def.spawnCount * (u.hp + u.sh) / (u.maxHp + u.maxSh) : 0), 0);
  const v0a = value(A), v0b = value(B);
  for (let t = 0; t < 20 * 150; t++) {
    g.tick();
    // re-issue attack-move for idle survivors so fights always resolve
    if (t % 40 === 0) {
      const ia = A.filter(u => u.alive && u.order.type === 'idle');
      const ib = B.filter(u => u.alive && u.order.type === 'idle');
      const tb = B.find(u => u.alive), ta = A.find(u => u.alive);
      if (ia.length && tb) g.cmdAttackMove(ia, tb.x, tb.y);
      if (ib.length && ta) g.cmdAttackMove(ib, ta.x, ta.y);
    }
    const aa = A.some(u => u.alive), bb = B.some(u => u.alive);
    if (!aa || !bb) break;
  }
  const ra = value(A) / v0a, rb = value(B) / v0b;
  // Score in [-1,1]: positive = A did better
  return ra - rb;
}

function armyFor(type, budget) {
  const d = SW.UNITS[type];
  return [[type, Math.max(1, Math.round(budget / SW.costValue(d)))]];
}

function unitMatrix() {
  const all = Object.values(SW.UNITS).filter(u => u.role !== 'worker');
  const names = all.map(u => u.key);
  console.log(`\n=== Unit vs unit (equal cost, budget ${BUDGET}); value = A's remaining-value margin, + favours row ===`);
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log(pad('', 14) + names.map(n => pad(n.slice(0, 6), 7)).join(''));
  const avg = {};
  for (const a of all) {
    let line = pad(a.key, 14), sum = 0, cnt = 0, msum = 0, mcnt = 0;
    const hitsAny = (x, y) => x.weapons.some(w => w.hits.includes(y.air ? 'a' : 'g'));
    for (const b of all) {
      let s = 0;
      for (let k = 0; k < 2; k++) s += battle(a.faction, armyFor(a.key, BUDGET), b.faction, armyFor(b.key, BUDGET), 7 + k);
      s /= 2;
      if (a.faction !== b.faction) {
        sum += s; cnt++;
        if (hitsAny(a, b) && hitsAny(b, a)) { msum += s; mcnt++; }
      }
      line += pad((s >= 0 ? '+' : '') + s.toFixed(2), 7);
    }
    avg[a.key] = msum / mcnt;
    console.log(line + '  avg ' + (sum / cnt).toFixed(2) + '  mutual ' + (msum / mcnt).toFixed(2));
  }
  return avg;
}

function randomComp(faction, rand, budget) {
  const roster = combatUnits(faction);
  const k = 2 + Math.floor(rand() * 3);
  const picks = [];
  const pool = roster.slice();
  for (let i = 0; i < k && pool.length; i++) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const weights = picks.map(() => 0.3 + rand());
  const wsum = weights.reduce((a, b) => a + b, 0);
  return picks.map((u, i) => [u.key, Math.max(1, Math.round(budget * weights[i] / wsum / SW.costValue(u)))]);
}

function factionMatchups() {
  const F = Object.keys(SW.FACTIONS);
  console.log(`\n=== Faction matchups: ${GAMES} random mixed armies each (budget ${BUDGET * 2}) ===`);
  let worst = 0;
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    let seed = 12345 + i * 100 + j;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let wins = 0, margin = 0;
    for (let n = 0; n < GAMES; n++) {
      const ca = randomComp(F[i], rand, BUDGET * 2), cb = randomComp(F[j], rand, BUDGET * 2);
      const s = battle(F[i], ca, F[j], cb, n + 1);
      if (s > 0) wins++; else if (s === 0) wins += 0.5;
      margin += s;
    }
    const wr = wins / GAMES * 100;
    worst = Math.max(worst, Math.abs(wr - 50));
    console.log(`${F[i].padEnd(12)} vs ${F[j].padEnd(12)}: ${wr.toFixed(1)}% / ${(100 - wr).toFixed(1)}%   (avg margin ${(margin / GAMES).toFixed(3)})`);
  }
  return worst;
}

if (!args.includes('--factions')) unitMatrix();
if (!args.includes('--units')) {
  const worst = factionMatchups();
  console.log(`\nLargest deviation from 50%: ${worst.toFixed(1)} points`);
}
