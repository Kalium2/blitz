// Menus, opening crawl, game lifecycle and main loop.
(function (SW) {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const settings = { faction: 'rebels', enemy: 'random', diff: 'normal', planet: 'tatooine', speed: '1' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('sw_settings') || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('sw_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  const audio = new SW.Audio();
  let session = null;

  // ------------------------------------------------------------ starfield
  const stars = $('stars'), sc = stars.getContext('2d');
  let starList = [];
  function initStars() {
    stars.width = innerWidth; stars.height = innerHeight;
    starList = [];
    for (let i = 0; i < 400; i++) starList.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, z: Math.random() });
  }
  function drawStars(t) {
    if (session && !session.over && !$('hud').classList.contains('hidden')) return;
    sc.fillStyle = '#000'; sc.fillRect(0, 0, stars.width, stars.height);
    for (const s of starList) {
      const tw = 0.6 + 0.4 * Math.sin(t * 0.002 + s.x);
      sc.globalAlpha = (0.3 + s.z * 0.7) * tw;
      sc.fillStyle = '#fff';
      sc.fillRect(s.x, s.y, s.z > 0.9 ? 2 : 1, s.z > 0.9 ? 2 : 1);
    }
    sc.globalAlpha = 1;
  }
  initStars();
  addEventListener('resize', () => { initStars(); if (session) session.renderer.resize(); });

  // ----------------------------------------------------------------- menu
  function buildMenu() {
    const box = $('factions');
    box.innerHTML = '';
    for (const [key, f] of Object.entries(SW.FACTIONS)) {
      const d = document.createElement('div');
      d.className = 'fcard' + (settings.faction === key ? ' sel' : '');
      d.style.setProperty('--fc', f.color);
      const icons = SW.factionUnits(key).map(u => `<img src="${SW.icon(u.key, f.color, 34).toDataURL()}" title="${u.name}">`).join('');
      d.innerHTML = `<div class="fname">${f.name}</div><div class="fblurb">${f.blurb}</div><div class="ftrait">${f.trait}</div><div class="ficons">${icons}</div>`;
      d.addEventListener('click', () => { settings.faction = key; save(); buildMenu(); audio.ensure(); audio.ui('click'); });
      box.appendChild(d);
    }
    $('opt-enemy').value = settings.enemy;
    $('opt-diff').value = settings.diff;
    $('opt-planet').value = settings.planet;
    $('opt-speed').value = settings.speed;
  }
  for (const [id, k] of [['opt-enemy', 'enemy'], ['opt-diff', 'diff'], ['opt-planet', 'planet'], ['opt-speed', 'speed']]) {
    $(id).addEventListener('change', (e) => { settings[k] = e.target.value; save(); });
  }

  function show(id) {
    for (const s of ['menu', 'units', 'help', 'crawl']) $(s).classList.toggle('hidden', s !== id);
  }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => show('menu')));
  $('btn-help').addEventListener('click', () => show('help'));
  $('btn-units').addEventListener('click', () => { buildUnitDb(settings.faction); show('units'); });

  function buildUnitDb(faction) {
    const tabs = $('unit-tabs');
    tabs.innerHTML = '';
    for (const [k, f] of Object.entries(SW.FACTIONS)) {
      const b = document.createElement('button');
      b.textContent = f.name;
      if (k === faction) b.className = 'on';
      b.addEventListener('click', () => buildUnitDb(k));
      tabs.appendChild(b);
    }
    const f = SW.FACTIONS[faction];
    const rows = SW.factionUnits(faction).map(u => {
      const req = u.requires === 'tech' ? ' <span title="Requires research structure">🔒</span>' : '';
      const trainedAt = Object.values(SW.BUILDINGS).find(b => b.trains.includes(u.key));
      return `<tr><td><img src="${SW.icon(u.key, f.color, 36).toDataURL()}"></td>
        <td><b>${u.name}</b>${req}<br><span class="c-t" style="font-size:11px">${trainedAt ? trainedAt.name : ''}</span></td>
        <td><span class="c-k">${u.cost[0]}</span> ${u.cost[1] ? `<span class="c-g">${u.cost[1]}</span>` : ''}<br><span class="c-s">${u.supply}</span>${u.spawnCount > 1 ? ' (×' + u.spawnCount + ')' : ''}</td>
        <td>${u.hp}${u.shields ? ' + <span style="color:#7ac0ff">' + u.shields + '</span>' : ''}<br>armor ${u.armor}</td>
        <td>${u.tags.join(', ')}</td>
        <td>${u.weapons.length ? SW.weaponText(u) : '—'}</td>
        <td>${u.speed}</td>
        <td>${u.strong ? `<span class="good">▲ ${u.strong}</span><br><span class="bad">▼ ${u.weak}</span>` : u.desc}</td></tr>`;
    }).join('');
    const brows = Object.values(SW.BUILDINGS).filter(b => b.faction === faction).map(b => `<tr><td><img src="${SW.icon(b.key, f.color, 36).toDataURL()}"></td><td><b>${b.name}</b></td>
      <td><span class="c-k">${b.cost[0]}</span> ${b.cost[1] ? `<span class="c-g">${b.cost[1]}</span>` : ''}</td><td>${b.hp}${b.shields ? ' + <span style="color:#7ac0ff">' + b.shields + '</span>' : ''}</td>
      <td colspan="4">${b.supplyProvided ? `+${b.supplyProvided} supply. ` : ''}${b.trains.length ? 'Trains ' + b.trains.map(t => SW.UNITS[t].name).join(', ') + '. ' : ''}${b.requiresRole ? 'Requires ' + SW.factionBuilding(faction, b.requiresRole).name + '. ' : ''}${b.desc || ''}${b.weapons.length ? SW.weaponText(b) : ''}</td></tr>`).join('');
    $('unit-table').innerHTML = `<p style="color:var(--dim)">${f.trait}</p>
      <table class="db"><tr><th></th><th>Unit</th><th>Cost</th><th>HP</th><th>Type</th><th>Weapon</th><th>Speed</th><th>Matchups</th></tr>${rows}</table>
      <h3 style="color:var(--gold);font-weight:600;margin-top:18px">Structures</h3>
      <table class="db"><tr><th></th><th>Structure</th><th>Cost</th><th>HP</th><th colspan="4">Notes</th></tr>${brows}</table>`;
  }

  // ---------------------------------------------------------------- crawl
  const CRAWL = {
    empire: ['Episode IV½', 'THE IRON FIST', 'The Rebellion has found a foothold on a remote world. The Emperor has dispatched his legions to crush this insurrection before it can spread.', 'Imperial engineers must harvest the planet\'s precious kyber crystals and build a garrison worthy of the Empire.', 'Commander, deploy your forces and destroy the enemy base. Failure will not be tolerated....'],
    rebels: ['Episode IV½', 'A SPARK OF HOPE', 'It is a period of civil war. Rebel cells, striking from hidden bases, struggle against overwhelming odds.', 'A rich vein of kyber crystals could fund the Alliance for years to come, but the enemy has arrived to claim it.', 'General, establish a base, rally your fighters, and drive the invaders from this world....'],
    separatists: ['Episode II½', 'THE DROID TIDE', 'The galaxy is torn apart by the Clone Wars. The Separatist Council has ordered the conquest of a strategic world rich in kyber.', 'Endless droid armies stand ready in the foundries, waiting only for raw materials and a commander\'s orders.', 'Roger, roger. Overwhelm the enemy with numbers and leave nothing standing....'],
  };

  function playCrawl(faction, done) {
    const c = CRAWL[faction];
    $('crawl-text').innerHTML = `<h2>${c[0]}</h2><h1>${c[1]}</h1>${c.slice(2).map(p => `<p>${p}</p>`).join('')}`;
    // restart animations
    for (const el of [$('crawl').querySelector('.farfar'), $('crawl-text')]) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    show('crawl');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      removeEventListener('keydown', finish); $('crawl').removeEventListener('click', finish);
      clearTimeout(timer);
      show(null);
      done();
    };
    const timer = setTimeout(finish, 13000);
    setTimeout(() => { addEventListener('keydown', finish); $('crawl').addEventListener('click', finish); }, 200);
  }

  $('btn-start').addEventListener('click', () => {
    audio.ensure();
    let enemy = settings.enemy;
    if (enemy === 'random') { const ks = Object.keys(SW.FACTIONS); enemy = ks[Math.floor(Math.random() * ks.length)]; }
    playCrawl(settings.faction, () => startGame({ faction: settings.faction, enemy, diff: settings.diff, planet: settings.planet, speed: +settings.speed }));
  });

  // ----------------------------------------------------------------- game
  function startGame(cfg) {
    if (session) endSession();
    const seed = Math.floor(Math.random() * 1e9);
    const map = SW.generateMap(seed);
    const meColor = SW.FACTIONS[cfg.faction].color;
    let enemyColor = SW.FACTIONS[cfg.enemy].color;
    if (cfg.enemy === cfg.faction) enemyColor = '#b05ad8';
    const swap = Math.random() < 0.5; // random start corner
    const players = [
      { faction: cfg.faction, color: meColor, name: 'You' },
      { faction: cfg.enemy, color: enemyColor, name: 'Enemy', isAI: true },
    ];
    if (swap) { map.starts.reverse(); }
    const game = new SW.Game({ map, players });
    $('hud').classList.remove('hidden');
    const renderer = new SW.Renderer($('view'), $('minimap'), game, cfg.planet, 0);
    const ui = new SW.UI(game, renderer, audio, 0, { onPause: () => togglePause() });
    const ai = new SW.AI(game, 1, cfg.diff);
    session = { game, renderer, ui, ai, cfg, paused: false, over: false, last: performance.now(), acc: 0 };
    const hq = game.list.find(e => e.owner === 0 && e.kind === 'building');
    renderer.centerOn(hq.x, hq.y + 60);
    ui.setSel([]);
    ui.flash(`Destroy the ${SW.FACTIONS[cfg.enemy].name}!`);
    updateSoundBtn();
  }

  function endSession() {
    if (!session) return;
    session.ui.destroy();
    session = null;
    $('hud').classList.add('hidden');
    $('overlay').classList.add('hidden');
    document.body.style.cursor = 'default';
  }

  function togglePause(force) {
    if (!session || session.over) return;
    session.paused = force != null ? force : !session.paused;
    session.ui.paused = session.paused;
    $('btn-pause').textContent = session.paused ? '▶' : '❚❚';
    const ov = $('overlay');
    if (session.paused) {
      ov.innerHTML = `<div class="ov"><h1>PAUSED</h1><div class="buttons"><button class="primary" id="ov-resume">Resume</button><button id="ov-quit">Surrender &amp; quit</button></div></div>`;
      ov.classList.remove('hidden');
      $('ov-resume').onclick = () => togglePause(false);
      $('ov-quit').onclick = () => { endSession(); show('menu'); buildMenu(); };
    } else ov.classList.add('hidden');
  }

  function gameOver() {
    const s = session;
    s.over = true;
    const won = s.game.winner === 0;
    audio.ui(won ? 'victory' : 'defeat');
    const ps = s.game.players;
    const row = (label, f) => `<tr><th>${label}</th><td>${f(ps[0])}</td><td>${f(ps[1])}</td></tr>`;
    const t = Math.floor(s.game.time);
    $('overlay').innerHTML = `<div class="ov"><h1 class="${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</h1>
      <div style="color:var(--dim)">${won ? 'The enemy has been crushed.' : 'Your base has fallen.'} Game time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</div>
      <table><tr><th></th><th>You (${SW.FACTIONS[ps[0].faction].short})</th><th>Enemy (${SW.FACTIONS[ps[1].faction].short})</th></tr>
      ${row('Resources mined', p => Math.floor(p.stats.mined))}${row('Units built', p => p.stats.unitsBuilt)}${row('Units lost', p => p.stats.unitsLost)}${row('Kills', p => p.stats.kills)}</table>
      <div class="buttons"><button class="primary" id="ov-again">Play again</button><button id="ov-menu">Main menu</button><button id="ov-watch">Keep watching</button></div></div>`;
    $('overlay').classList.remove('hidden');
    $('ov-again').onclick = () => { const cfg = s.cfg; endSession(); startGame(cfg); };
    $('ov-menu').onclick = () => { endSession(); show('menu'); buildMenu(); };
    $('ov-watch').onclick = () => { $('overlay').classList.add('hidden'); s.renderer.revealAll = true; };
  }

  $('btn-pause').addEventListener('click', () => togglePause());
  $('btn-quit').addEventListener('click', () => togglePause(true));
  $('btn-sound').addEventListener('click', () => { audio.setMuted(!audio.muted); updateSoundBtn(); });
  $('idle-workers').addEventListener('click', () => session && session.ui.selectIdleWorker());
  function updateSoundBtn() { $('btn-sound').classList.toggle('off', audio.muted); }
  addEventListener('blur', () => { if (session && !session.over && !session.paused) togglePause(true); });

  // ----------------------------------------------------------------- loop
  function loop(now) {
    requestAnimationFrame(loop);
    drawStars(now);
    const s = session;
    if (!s) return;
    const dt = Math.min(0.1, (now - s.last) / 1000);
    s.last = now;
    if (!s.paused) {
      s.acc += dt * s.cfg.speed;
      let steps = 0;
      while (s.acc >= SW.TICK && steps < 8) {
        if (!s.game.over || s.renderer.revealAll) s.ai.update(SW.TICK);
        s.game.tick();
        s.acc -= SW.TICK;
        steps++;
      }
      if (steps >= 8) s.acc = 0;
    }
    s.renderer.consumeEvents(audio);
    s.ui.update(s.paused ? 0 : dt);
    s.renderer.frame(s.paused ? 0 : dt, s.ui);
    if (s.game.over && !s.over) gameOver();
  }

  buildMenu();
  requestAnimationFrame(loop);

  // Debug hook for automated testing.
  SW.debug = { get session() { return session; }, startGame, settings };
})(globalThis.SW = globalThis.SW || {});
