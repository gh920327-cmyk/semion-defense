// ============================================================
// 세미온 스타일 협동 타워 디펜스 - 서버 (권위 서버)
// 게임 로직은 전부 서버에서 계산하고, 클라이언트는 그리기만 합니다.
// ============================================================
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const C = require('./shared/config');

const PORT = process.env.PORT || 3000;
// 테스트용 배속 (예: SIM_SPEED=10). 평소에는 1.
const SIM_SPEED = Math.max(1, parseInt(process.env.SIM_SPEED || '1', 10));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.get('/health', (req, res) => res.send('ok'));

const PATH = C.buildPath();
const DT = 1 / C.TICK_RATE;
const rooms = new Map();   // 방 코드 -> 방

// ---------------- 유틸 ----------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round1 = (v) => Math.round(v * 10) / 10;

function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function cleanName(n) {
  return String(n || '').replace(/[<>]/g, '').trim().slice(0, 12);
}

function playerList(room) {
  return [...room.players.values()];
}

function connectedPlayers(room) {
  return playerList(room).filter((p) => p.connected);
}

// ---------------- 로비 ----------------
function lobbyInfo(room) {
  return {
    code: room.code,
    host: room.host,
    state: room.state,
    players: playerList(room).map((p) => ({
      name: p.name, cls: p.cls, color: p.color, ready: p.lobbyReady, connected: p.connected,
    })),
  };
}

function sendLobby(room) {
  io.to(room.code).emit('lobby', lobbyInfo(room));
}

function pickColor(room) {
  const used = new Set(playerList(room).map((p) => p.color));
  return C.PLAYER_COLORS.find((c) => !used.has(c)) || C.PLAYER_COLORS[0];
}

function newStats() {
  return { damage: 0, kills: 0, built: 0, syn: {} };
}

// ---------------- 게임 시작 ----------------
function startGame(room) {
  const n = playerList(room).length;
  room.state = 'playing';
  room.game = {
    wave: 0,
    cleared: 0,
    life: C.START_LIFE,
    phase: 'prep',
    timer: C.FIRST_PREP_TIME,
    towers: [],
    enemies: [],
    spawn: [],
    spawnT: 0,
    nextId: 1,
    fx: [],
    msgs: [],
    hpFactor: C.playerHpFactor(n),
    synergy: { tags: [], combos: [] },
    towersDirty: true,
  };
  for (const p of playerList(room)) {
    p.gold = C.START_GOLD;
    p.waveReady = false;
    p.stats = newStats();
  }
  io.to(room.code).emit('gameStart', { players: publicPlayers(room) });
  recomputeTowers(room);
}

function publicPlayers(room) {
  return playerList(room).map((p) => ({
    name: p.name, cls: p.cls, color: p.color, gold: Math.floor(p.gold || 0),
    ready: !!p.waveReady, connected: p.connected,
  }));
}

// ============================================================
// 시너지 계산 (타워가 지어지거나 팔리거나 업그레이드될 때만 호출)
// ============================================================
function baseMods() {
  return {
    dmgMult: 1, rateMult: 1, rangeAdd: 0, critAdd: 0, critMultAdd: 0,
    burnMult: 1, slowAdd: 0, freezeChance: 0, chainAdd: 0, shockDurAdd: 0,
    bossDmgMult: 1, holyShred: 0, auraRangeAdd: 0, auraPowerMult: 1,
    splashMult: 1, multishotAdd: 0, statusDmgMult: 1, vsSlowedMult: 1, vsFrozenMult: 1,
    chainArrow: 0, burnIgnoreMR: false, armorPen: 0, executeMult: 1, burnSpread: false,
  };
}

// 효과 합치기: ...Mult 는 곱, 숫자는 합, true 는 켜기. power 로 세기 조절 (오라 레벨 등)
function applyEffect(m, effect, power = 1) {
  for (const k in effect) {
    const v = effect[k];
    if (typeof v === 'boolean') m[k] = m[k] || v;
    else if (k.endsWith('Mult')) m[k] = (m[k] ?? 1) * (1 + (v - 1) * power);
    else m[k] = (m[k] || 0) + v * power;
  }
}

function matches(t, cond) {
  const d = C.TOWERS[t.type];
  if (cond.cls && d.class !== cond.cls) return false;
  if (cond.tag && !d.tags.includes(cond.tag)) return false;
  return true;
}

function tileCenter(t) {
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

function recomputeTowers(room) {
  const g = room.game;
  const U = C.UPGRADE;

  // 1) 태그 개수 세기 (팀 전체)
  const counts = {};
  for (const t of g.towers) for (const tag of C.TOWERS[t.type].tags) counts[tag] = (counts[tag] || 0) + 1;
  const tagTier = {};
  for (const tag in C.TAG_SYNERGIES) {
    const tiers = C.TAG_SYNERGIES[tag].tiers;
    let idx = -1;
    tiers.forEach((tr, i) => { if ((counts[tag] || 0) >= tr.count) idx = i; });
    tagTier[tag] = idx;
  }

  // 2) 타워별 기본 보정 (직업 패시브 + 태그 시너지 + 조합 시너지)
  const comboCount = {};
  for (const t of g.towers) {
    const def = C.TOWERS[t.type];
    const m = baseMods();
    const syn = [];
    const pos = tileCenter(t);

    const passive = C.CLASSES[def.class].passive;
    if (passive.effect) {
      const ok = !passive.condition || (passive.condition === 'nearPath' && PATH.near.has(t.x + ',' + t.y));
      if (ok) { applyEffect(m, passive.effect); syn.push(passive.name); }
    }

    for (const tag of def.tags) {
      const idx = tagTier[tag];
      if (idx >= 0) {
        const s = C.TAG_SYNERGIES[tag];
        applyEffect(m, s.tiers[idx].effect);
        syn.push(`${s.name} ${s.tiers[idx].count}`);
      }
    }

    for (const combo of C.COMBOS) {
      const near = (cond) => g.towers.some((o) => o !== t && matches(o, cond)
        && C.TOWERS[o.type].class !== def.class && dist(tileCenter(o), pos) <= C.ADJ_RANGE);
      let on = matches(t, combo.b) && near(combo.a);
      if (!on && combo.target === 'both') on = matches(t, combo.a) && near(combo.b);
      if (on) {
        applyEffect(m, combo.effect);
        syn.push(combo.name);
        comboCount[combo.id] = (comboCount[combo.id] || 0) + 1;
      }
    }
    t.m = m;
    t.syn = syn;
  }

  // 3) 타워 오라 (축복의 제단 등) - 다른 타워의 보정이 끝난 뒤 적용
  for (const s of g.towers) {
    const aura = C.TOWERS[s.type].towerAura;
    if (!aura) continue;
    const power = Math.pow(U.auraMult, s.level - 1) * s.m.auraPowerMult;
    const range = aura.range + s.m.auraRangeAdd;
    const eff = {};
    if (aura.rateMult) eff.rateMult = aura.rateMult;
    if (aura.dmgMult) eff.dmgMult = aura.dmgMult;
    for (const t of g.towers) {
      if (t === s || dist(tileCenter(t), tileCenter(s)) > range) continue;
      applyEffect(t.m, eff, power);
      const label = `${C.TOWERS[s.type].name} 오라`;
      if (!t.syn.includes(label)) t.syn.push(label);
    }
  }

  // 4) 최종 능력치
  for (const t of g.towers) {
    const def = C.TOWERS[t.type];
    const m = t.m;
    const lv = t.level - 1;
    const s = {
      dmg: (def.dmg || 0) * Math.pow(U.dmgMult, lv) * m.dmgMult,
      rate: (def.rate || 0) * Math.pow(U.rateMult, lv) * m.rateMult,
      range: def.range + U.rangeAdd * lv + m.rangeAdd,
      crit: Math.min(1, (def.crit || 0) + m.critAdd),
      critMult: C.CRIT_MULT + m.critMultAdd,
      splash: (def.splash || 0) * m.splashMult,
      multishot: (def.multishot || 1) + (def.attack === 'multi' ? m.multishotAdd : 0),
      chain: (def.chain || 1) + (def.attack === 'chain' ? m.chainAdd : 0),
    };
    if (def.burn) s.burn = { dps: def.burn.dps * Math.pow(U.dmgMult, lv) * m.burnMult, dur: def.burn.dur };
    if (def.slow) s.slow = { pct: Math.min(C.SLOW_CAP, def.slow.pct + m.slowAdd), dur: def.slow.dur };
    if (def.shock) s.shock = { dur: def.shock.dur + m.shockDurAdd };
    if (def.enemyAura) {
      const p = Math.pow(U.auraMult, lv) * m.auraPowerMult;
      s.enemyAura = {
        range: def.enemyAura.range + m.auraRangeAdd,
        slow: Math.min(C.SLOW_CAP, (def.enemyAura.slow || 0) * p),
        armorBreak: (def.enemyAura.armorBreak || 0) * p,
        vuln: (def.enemyAura.vuln || 0) * p,
      };
    }
    if (def.towerAura) s.auraRange = def.towerAura.range + m.auraRangeAdd;
    t.s = s;
  }

  // 5) 시너지 패널용 정보
  g.synergy = {
    tags: Object.keys(C.TAG_SYNERGIES).filter((tag) => counts[tag]).map((tag) => {
      const tiers = C.TAG_SYNERGIES[tag].tiers;
      const next = tiers.find((tr) => tr.count > counts[tag]);
      return { tag, count: counts[tag], tier: tagTier[tag], next: next ? next.count : null };
    }),
    combos: C.COMBOS.filter((c) => comboCount[c.id]).map((c) => ({ id: c.id, count: comboCount[c.id] })),
  };
  g.towersDirty = true;
}

function sendTowers(room) {
  const g = room.game;
  io.to(room.code).emit('towers', {
    towers: g.towers.map((t) => ({
      id: t.id, type: t.type, owner: t.owner, x: t.x, y: t.y, level: t.level, invested: t.invested,
      syn: t.syn, kills: t.kills, dmg: Math.round(t.dmgDealt),
      s: {
        dmg: round1(t.s.dmg), rate: round1(t.s.rate * 100) / 100, range: round1(t.s.range),
        crit: Math.round(t.s.crit * 100), critMult: round1(t.s.critMult),
        splash: round1(t.s.splash), multishot: t.s.multishot, chain: t.s.chain,
        burn: t.s.burn ? round1(t.s.burn.dps) : 0, slow: t.s.slow ? Math.round(t.s.slow.pct * 100) : 0,
        auraRange: t.s.enemyAura ? round1(t.s.enemyAura.range) : (t.s.auraRange ? round1(t.s.auraRange) : 0),
      },
    })),
    synergy: g.synergy,
  });
  g.towersDirty = false;
}

// ============================================================
// 웨이브 / 적
// ============================================================
function startWave(room) {
  const g = room.game;
  g.wave++;
  g.phase = 'wave';
  g.spawn = [];
  g.spawnT = 0;
  let t = 0;
  for (const grp of C.makeWave(g.wave)) {
    for (let i = 0; i < grp.count; i++) {
      g.spawn.push({ t, type: grp.type, boss: grp.boss });
      t += grp.interval;
    }
    t += C.groupGap;
  }
  for (const p of playerList(room)) p.waveReady = false;
  const bossGrp = C.makeWave(g.wave).find((x) => x.boss);
  g.msgs.push(bossGrp
    ? `⚠️ ${g.wave}웨이브 - 보스 등장: ${C.BOSS_ABILITIES[bossGrp.boss].name} (${C.BOSS_ABILITIES[bossGrp.boss].desc})`
    : `${g.wave}웨이브 시작!`);
}

function spawnEnemy(g, type, boss, d = 0) {
  const def = C.ENEMIES[type];
  const w = Math.max(1, g.wave);
  const hp = def.hp * C.hpScale(w) * g.hpFactor;
  const e = {
    id: g.nextId++, type, d, x: 0, y: 0,
    hp, maxHp: hp,
    speed: def.speed * (1 + 0.01 * w),
    armor: def.armor + (def.armorGrowth || 0) * (w - 1),
    mr: def.mr, flying: !!def.flying,
    gold: Math.round(def.gold * (1 + C.GOLD_GROWTH * (w - 1))),
    life: def.life,
    slowT: 0, slowPct: 0, shockT: 0, frozenT: 0, stunT: 0, shred: 0, burn: null,
    auraSlow: 0, auraArmor: 0, auraVuln: 0,
    boss: boss || null, abT: 0, invulnT: 0, hasteT: 0,
    dead: false,
  };
  if (boss) e.abT = C.BOSS_ABILITIES[boss].cooldown || 0;
  const p = PATH.posAt(d);
  e.x = p.x; e.y = p.y;
  g.enemies.push(e);
  return e;
}

// ---------------- 피해 계산 ----------------
function resistMult(e, dtype, armorPen, ignoreMR) {
  let mult = 1 + (e.shockT > 0 ? C.SHOCK_VULN : 0) + e.auraVuln;
  if (dtype === 'physical') {
    const armor = Math.max(0, e.armor - e.auraArmor - e.shred) * (1 - Math.min(1, armorPen));
    mult *= Math.max(C.MIN_ARMOR_DMG, 1 - armor * C.ARMOR_FACTOR);
  } else if (!ignoreMR) {
    mult *= 1 - e.mr;
  }
  return mult;
}

function applyRaw(room, e, amount, ownerName, tower) {
  if (e.dead || e.invulnT > 0 || amount <= 0) return;
  const dealt = Math.min(e.hp, amount);
  e.hp -= amount;
  const p = room.players.get(ownerName);
  if (p) {
    p.stats.damage += dealt;
    if (tower) for (const name of tower.syn) p.stats.syn[name] = (p.stats.syn[name] || 0) + dealt;
  }
  if (tower) tower.dmgDealt += dealt;
  if (e.hp <= 0) kill(room, e, ownerName, tower);
}

function kill(room, e, ownerName, tower) {
  if (e.dead) return;
  e.dead = true;
  const g = room.game;
  const p = room.players.get(ownerName);
  if (p) { p.gold += e.gold; p.stats.kills++; }
  if (tower) tower.kills++;
  g.fx.push({ k: 'gold', x: round1(e.x), y: round1(e.y), v: e.gold, c: p ? p.color : '#fff' });
  // 불꽃 4 시너지: 불이 주변으로 번짐
  if (e.burn && e.burn.spread) {
    for (const o of g.enemies) {
      if (o.dead || o === e || dist(o, e) > 1.5) continue;
      if (!o.burn || o.burn.dps < e.burn.dps) o.burn = { ...e.burn, t: e.burn.dur };
    }
    g.fx.push({ k: 'boom', x: round1(e.x), y: round1(e.y), r: 1.5, c: '#ff7043' });
  }
}

function damage(room, t, e, base, opts = {}) {
  if (e.dead || e.invulnT > 0) return false;
  const def = C.TOWERS[t.type];
  const m = t.m;
  let d = base;
  if (e.boss) d *= (def.bossMult || 1) * m.bossDmgMult;
  const slowed = e.slowT > 0 || e.auraSlow > 0 || e.stunT > 0;
  if (e.burn || slowed || e.shockT > 0 || e.frozenT > 0) d *= m.statusDmgMult;
  if (e.frozenT > 0) d *= m.vsFrozenMult;
  else if (slowed) d *= m.vsSlowedMult;
  if (e.hp < e.maxHp * 0.3) d *= m.executeMult;
  let crit = false;
  if (!opts.noCrit && t.s.crit > 0 && Math.random() < t.s.crit) { d *= t.s.critMult; crit = true; }
  d *= resistMult(e, def.dtype, m.armorPen, false);
  if (crit && room.game.fx.length < 80) room.game.fx.push({ k: 'txt', x: round1(e.x), y: round1(e.y), v: Math.round(d) + '!', c: '#ff5252' });
  applyRaw(room, e, d, t.owner, t);
  return true;
}

function onHit(t, e) {
  if (e.dead) return;
  const s = t.s, m = t.m, def = C.TOWERS[t.type];
  const bossRes = e.boss ? 0.3 : 1;  // 보스는 군중제어 시간 감소
  if (s.burn) {
    if (!e.burn || e.burn.dps <= s.burn.dps) {
      e.burn = { dps: s.burn.dps, t: s.burn.dur, dur: s.burn.dur, owner: t.owner, tid: t.id,
        ignoreMR: m.burnIgnoreMR, spread: m.burnSpread };
    } else e.burn.t = Math.max(e.burn.t, s.burn.dur);
  }
  if (s.slow) {
    e.slowPct = Math.max(e.slowT > 0 ? e.slowPct : 0, s.slow.pct);
    e.slowT = Math.max(e.slowT, s.slow.dur);
  }
  if (m.freezeChance > 0 && Math.random() < m.freezeChance) e.frozenT = Math.max(e.frozenT, 1 * bossRes);
  if (s.shock) e.shockT = Math.max(e.shockT, s.shock.dur);
  if (def.stunChance && Math.random() < def.stunChance) e.stunT = Math.max(e.stunT, 1 * bossRes);
  if (m.holyShred > 0) e.shred = Math.min(10, e.shred + m.holyShred);
}

function canHit(t, e) {
  return !e.dead && (!e.flying || C.TOWERS[t.type].air);
}

function findTargets(g, t) {
  const c = tileCenter(t);
  return g.enemies
    .filter((e) => canHit(t, e) && dist(c, e) <= t.s.range)
    .sort((a, b) => b.d - a.d);   // 가장 멀리 간 적 우선
}

function nearestOther(g, t, from, exclude, maxD) {
  let best = null, bd = maxD;
  for (const e of g.enemies) {
    if (exclude.has(e) || !canHit(t, e)) continue;
    const d = dist(from, e);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

function towerAttack(room, t, targets) {
  const g = room.game;
  const def = C.TOWERS[t.type];
  const c = tileCenter(t);
  const color = C.CLASSES[def.class].color;
  const s = t.s;
  const push = (f) => { if (g.fx.length < 120) g.fx.push(f); };

  const arrowBounce = (primary) => {
    if (t.m.chainArrow <= 0) return;
    const o = nearestOther(g, t, primary, new Set([primary]), 2);
    if (o) {
      push({ k: 'line', x1: round1(primary.x), y1: round1(primary.y), x2: round1(o.x), y2: round1(o.y), c: '#ffee58' });
      damage(room, t, o, s.dmg * 0.5);
    }
  };

  if (def.attack === 'single') {
    const e = targets[0];
    push({ k: 'line', x1: c.x, y1: c.y, x2: round1(e.x), y2: round1(e.y), c: color });
    if (damage(room, t, e, s.dmg)) onHit(t, e);
    arrowBounce(e);
  } else if (def.attack === 'splash') {
    const e = targets[0];
    const ex = e.x, ey = e.y;
    push({ k: 'line', x1: c.x, y1: c.y, x2: round1(ex), y2: round1(ey), c: color });
    push({ k: 'boom', x: round1(ex), y: round1(ey), r: round1(s.splash), c: color });
    for (const o of g.enemies.slice()) {
      if (!canHit(t, o) || Math.hypot(o.x - ex, o.y - ey) > s.splash) continue;
      if (damage(room, t, o, s.dmg)) onHit(t, o);
    }
  } else if (def.attack === 'chain') {
    const hit = new Set([targets[0]]);
    const pts = [[c.x, c.y]];
    let cur = targets[0];
    let mult = 1;
    for (let i = 0; i < s.chain && cur; i++) {
      pts.push([round1(cur.x), round1(cur.y)]);
      if (damage(room, t, cur, s.dmg * mult)) onHit(t, cur);
      mult *= 0.85;
      const next = nearestOther(g, t, cur, hit, 2.2);
      if (next) hit.add(next);
      cur = next;
    }
    push({ k: 'chain', pts, c: '#ffee58' });
  } else if (def.attack === 'multi') {
    for (const e of targets.slice(0, s.multishot)) {
      push({ k: 'line', x1: c.x, y1: c.y, x2: round1(e.x), y2: round1(e.y), c: color });
      if (damage(room, t, e, s.dmg)) onHit(t, e);
      arrowBounce(e);
    }
  }
}

// ============================================================
// 게임 한 틱 진행
// ============================================================
function update(room, dt) {
  const g = room.game;

  if (g.phase === 'prep') {
    g.timer -= dt;
    const online = connectedPlayers(room);
    const allReady = online.length > 0 && online.every((p) => p.waveReady);
    if (g.timer <= 0 || allReady) startWave(room);
  } else if (g.phase === 'wave') {
    g.spawnT += dt;
    while (g.spawn.length && g.spawn[0].t <= g.spawnT) {
      const sp = g.spawn.shift();
      spawnEnemy(g, sp.type, sp.boss);
    }
  }

  // 적에게 오라 적용 (방패벽, 저주의 토템)
  for (const e of g.enemies) { e.auraSlow = 0; e.auraArmor = 0; e.auraVuln = 0; }
  for (const t of g.towers) {
    const a = t.s.enemyAura;
    if (!a) continue;
    const c = tileCenter(t);
    for (const e of g.enemies) {
      if (dist(c, e) > a.range) continue;
      e.auraSlow = Math.max(e.auraSlow, a.slow);
      e.auraArmor = Math.max(e.auraArmor, a.armorBreak);
      e.auraVuln = Math.max(e.auraVuln, a.vuln);
    }
  }

  // 적 이동 / 상태이상 / 보스 능력
  for (const e of g.enemies.slice()) {
    if (e.dead) continue;
    e.slowT = Math.max(0, e.slowT - dt);
    e.shockT = Math.max(0, e.shockT - dt);
    e.frozenT = Math.max(0, e.frozenT - dt);
    e.stunT = Math.max(0, e.stunT - dt);
    e.invulnT = Math.max(0, e.invulnT - dt);
    e.hasteT = Math.max(0, e.hasteT - dt);

    if (e.boss) {
      const ab = C.BOSS_ABILITIES[e.boss];
      if (ab.regen) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ab.regen * dt);
      if (ab.cooldown) {
        e.abT -= dt;
        if (e.abT <= 0) {
          e.abT = ab.cooldown;
          if (e.boss === 'summon') {
            for (let i = 0; i < ab.count; i++) spawnEnemy(g, 'fast', null, Math.max(0, e.d - 0.3 * i));
            g.fx.push({ k: 'boom', x: round1(e.x), y: round1(e.y), r: 1, c: '#fdd835' });
          } else if (e.boss === 'shield') e.invulnT = ab.duration;
          else if (e.boss === 'haste') e.hasteT = ab.duration;
        }
      }
    }

    if (e.burn) {
      e.burn.t -= dt;
      const tower = g.towers.find((t) => t.id === e.burn.tid);
      const amt = e.burn.dps * dt * resistMult(e, 'magic', 0, e.burn.ignoreMR);
      const owner = e.burn.owner;
      if (e.burn.t <= 0) e.burn = null;
      applyRaw(room, e, amt, owner, tower);
      if (e.dead) continue;
    }

    let spd = e.speed;
    if (e.frozenT > 0 || e.stunT > 0) spd = 0;
    else {
      const slow = Math.min(C.SLOW_CAP, Math.max(e.slowT > 0 ? e.slowPct : 0, e.auraSlow));
      spd *= 1 - slow;
      if (e.hasteT > 0) spd *= C.BOSS_ABILITIES.haste.mult;
    }
    e.d += spd * dt;
    if (e.d >= PATH.total) {
      e.dead = true;
      g.life -= e.life;
      g.fx.push({ k: 'leak', v: e.life });
      continue;
    }
    const p = PATH.posAt(e.d);
    e.x = p.x; e.y = p.y;
  }

  // 타워 공격
  for (const t of g.towers) {
    if (C.TOWERS[t.type].attack === 'none' || t.s.rate <= 0) continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    const targets = findTargets(g, t);
    if (!targets.length) { t.cd = 0; continue; }
    towerAttack(room, t, targets);
    t.cd += 1 / t.s.rate;
    if (t.cd < 0) t.cd = 0;
  }

  g.enemies = g.enemies.filter((e) => !e.dead);

  if (g.life <= 0) { g.life = 0; endGame(room, false); return; }

  if (g.phase === 'wave' && g.spawn.length === 0 && g.enemies.length === 0) waveClear(room);
}

function waveClear(room) {
  const g = room.game;
  g.cleared = g.wave;
  let bonus = C.WAVE_BONUS_BASE + C.WAVE_BONUS_PER * g.wave;
  const hasPriest = playerList(room).some((p) => p.cls === 'priest');
  if (hasPriest) bonus *= C.CLASSES.priest.passive.teamGoldMult;
  bonus = Math.round(bonus);
  for (const p of playerList(room)) p.gold += bonus;
  g.msgs.push(`✅ ${g.wave}웨이브 클리어! 전원 +${bonus}골드${hasPriest ? ' (풍요의 기도)' : ''}`);
  if (g.wave === C.ULT_UNLOCK_WAVE) g.msgs.push('🌟 궁극기 타워가 해금되었습니다!');
  if (g.wave >= C.MAX_WAVE) { endGame(room, true); return; }
  g.phase = 'prep';
  g.timer = C.PREP_TIME;
}

function endGame(room, win) {
  const g = room.game;
  room.state = 'over';
  const stats = playerList(room).map((p) => {
    let top = null, topV = 0;
    for (const k in p.stats.syn) if (p.stats.syn[k] > topV) { topV = p.stats.syn[k]; top = k; }
    return {
      name: p.name, cls: p.cls, color: p.color,
      damage: Math.round(p.stats.damage), kills: p.stats.kills, built: p.stats.built,
      topSyn: top, topSynDmg: Math.round(topV),
    };
  });
  io.to(room.code).emit('gameOver', { win, wave: g.wave, cleared: g.cleared, stats });
  for (const p of playerList(room)) p.lobbyReady = false;
  sendLobby(room);
}

function sendState(room) {
  const g = room.game;
  io.to(room.code).volatile.emit('state', {
    ph: g.phase,
    tm: Math.ceil(Math.max(0, g.timer)),
    w: g.wave,
    life: g.life,
    ult: g.cleared >= C.ULT_UNLOCK_WAVE,
    left: g.spawn.length + g.enemies.length,
    pl: publicPlayers(room),
    en: g.enemies.map((e) => ({
      id: e.id, t: e.type, x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100,
      h: Math.round((e.hp / e.maxHp) * 100) / 100,
      f: (e.slowT > 0 || e.auraSlow > 0 ? 1 : 0) | (e.burn ? 2 : 0) | (e.shockT > 0 ? 4 : 0)
        | (e.frozenT > 0 || e.stunT > 0 ? 8 : 0) | (e.invulnT > 0 ? 16 : 0) | (e.hasteT > 0 ? 32 : 0),
      b: e.boss || undefined,
    })),
    fx: g.fx,
  });
  g.fx = [];
  for (const msg of g.msgs) io.to(room.code).emit('sys', msg);
  g.msgs = [];
}

// 메인 루프
let tickCount = 0;
setInterval(() => {
  tickCount++;
  for (const room of rooms.values()) {
    if (room.state !== 'playing') continue;
    for (let i = 0; i < SIM_SPEED && room.state === 'playing'; i++) update(room, DT);
    if (!room.game) continue;
    // 타워 목록은 바뀔 때 + 1초마다(처치/피해 통계 갱신) 전송
    if (room.game.towersDirty || tickCount % C.TICK_RATE === 0) sendTowers(room);
    sendState(room);
  }
}, 1000 / C.TICK_RATE);

// ============================================================
// 소켓 이벤트
// ============================================================
io.on('connection', (socket) => {
  let room = null;
  let me = null;

  const err = (msg) => socket.emit('err', msg);

  function enter(r, p) {
    room = r; me = p;
    p.sid = socket.id;
    p.connected = true;
    socket.join(r.code);
    socket.emit('joined', { code: r.code, name: p.name });
    sendLobby(r);
    if (r.state === 'playing') {
      socket.emit('gameStart', { players: publicPlayers(r) });
      r.game.towersDirty = true;
    }
  }

  socket.on('create', ({ name } = {}) => {
    if (room) return;
    name = cleanName(name);
    if (!name) return err('닉네임을 입력하세요.');
    const r = { code: makeCode(), host: name, state: 'lobby', players: new Map(), game: null, emptySince: null };
    rooms.set(r.code, r);
    const p = { name, cls: null, color: pickColor(r), lobbyReady: false, connected: true, gold: 0, stats: newStats() };
    r.players.set(name, p);
    enter(r, p);
  });

  socket.on('join', ({ code, name } = {}) => {
    if (room) return;
    name = cleanName(name);
    code = String(code || '').trim().toUpperCase();
    if (!name) return err('닉네임을 입력하세요.');
    const r = rooms.get(code);
    if (!r) return err('방을 찾을 수 없습니다.');
    const existing = r.players.get(name);
    if (existing) {
      if (existing.connected) return err('이미 같은 닉네임이 방에 있습니다.');
      r.emptySince = null;
      enter(r, existing);                 // 재접속
      io.to(r.code).emit('sys', `🔌 ${name} 님이 다시 접속했습니다.`);
      return;
    }
    if (r.state !== 'lobby') return err('이미 게임이 진행 중입니다. (재접속은 같은 닉네임으로)');
    if (r.players.size >= C.MAX_PLAYERS) return err('방이 가득 찼습니다.');
    const p = { name, cls: null, color: pickColor(r), lobbyReady: false, connected: true, gold: 0, stats: newStats() };
    r.players.set(name, p);
    r.emptySince = null;
    enter(r, p);
  });

  socket.on('selectClass', (cls) => {
    if (!room || room.state !== 'lobby' || !C.CLASSES[cls]) return;
    if (playerList(room).some((p) => p !== me && p.cls === cls)) return err('다른 플레이어가 고른 직업입니다.');
    me.cls = cls;
    me.lobbyReady = false;
    sendLobby(room);
  });

  socket.on('lobbyReady', () => {
    if (!room || room.state !== 'lobby') return;
    if (!me.cls) return err('먼저 직업을 고르세요.');
    me.lobbyReady = !me.lobbyReady;
    sendLobby(room);
  });

  socket.on('start', () => {
    if (!room || room.state !== 'lobby' || room.host !== me.name) return;
    const ps = playerList(room);
    if (ps.some((p) => !p.cls)) return err('모든 플레이어가 직업을 골라야 합니다.');
    if (ps.some((p) => p !== me && !p.lobbyReady)) return err('모든 플레이어가 준비해야 합니다.');
    startGame(room);
  });

  socket.on('waveReady', () => {
    if (!room || room.state !== 'playing' || room.game.phase !== 'prep') return;
    me.waveReady = !me.waveReady;
  });

  socket.on('build', ({ type, x, y } = {}) => {
    if (!room || room.state !== 'playing') return;
    const g = room.game;
    const def = C.TOWERS[type];
    x = Math.floor(x); y = Math.floor(y);
    if (!def || def.class !== me.cls) return err('내 직업의 타워가 아닙니다.');
    if (!(x >= 0 && y >= 0 && x < C.MAP.cols && y < C.MAP.rows)) return;
    if (PATH.tiles.has(x + ',' + y)) return err('길 위에는 지을 수 없습니다.');
    if (g.towers.some((t) => t.x === x && t.y === y)) return err('이미 타워가 있습니다.');
    if (def.ult) {
      if (g.cleared < C.ULT_UNLOCK_WAVE) return err(`궁극기 타워는 ${C.ULT_UNLOCK_WAVE}웨이브 클리어 후 해금됩니다.`);
      if (g.towers.some((t) => t.owner === me.name && C.TOWERS[t.type].ult)) return err('궁극기 타워는 1개만 지을 수 있습니다.');
    }
    if (me.gold < def.cost) return err('골드가 부족합니다.');
    me.gold -= def.cost;
    me.stats.built++;
    g.towers.push({ id: g.nextId++, type, owner: me.name, x, y, level: 1, invested: def.cost, cd: 0, kills: 0, dmgDealt: 0 });
    recomputeTowers(room);
  });

  socket.on('upgrade', (id) => {
    if (!room || room.state !== 'playing') return;
    const t = room.game.towers.find((o) => o.id === id);
    if (!t || t.owner !== me.name) return;
    if (t.level >= C.UPGRADE.maxLevel) return err('최대 레벨입니다.');
    const cost = Math.round(C.TOWERS[t.type].cost * C.UPGRADE.costMult[t.level]);
    if (me.gold < cost) return err('골드가 부족합니다.');
    me.gold -= cost;
    t.level++;
    t.invested += cost;
    recomputeTowers(room);
  });

  socket.on('sell', (id) => {
    if (!room || room.state !== 'playing') return;
    const g = room.game;
    const t = g.towers.find((o) => o.id === id);
    if (!t || t.owner !== me.name) return;
    me.gold += Math.floor(t.invested * C.SELL_REFUND);
    g.towers = g.towers.filter((o) => o !== t);
    recomputeTowers(room);
  });

  socket.on('mapPing', ({ x, y } = {}) => {
    if (!room || room.state !== 'playing') return;
    io.to(room.code).emit('mapPing', { x: +x || 0, y: +y || 0, name: me.name, color: me.color });
  });

  socket.on('chat', (text) => {
    if (!room) return;
    text = String(text || '').replace(/[<>]/g, '').trim().slice(0, 120);
    if (text) io.to(room.code).emit('chat', { name: me.name, color: me.color, text });
  });

  socket.on('backToLobby', () => {
    if (!room || room.state !== 'over' || room.host !== me.name) return;
    room.state = 'lobby';
    room.game = null;
    // 끊긴 플레이어는 로비로 돌아갈 때 정리
    for (const p of playerList(room)) if (!p.connected) room.players.delete(p.name);
    sendLobby(room);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    me.connected = false;
    me.waveReady = false;
    if (room.state === 'lobby') {
      room.players.delete(me.name);
    } else {
      io.to(room.code).emit('sys', `🔌 ${me.name} 님의 연결이 끊겼습니다. 같은 닉네임으로 다시 들어올 수 있어요.`);
    }
    if (room.host === me.name) {
      const next = connectedPlayers(room)[0];
      if (next) room.host = next.name;
    }
    if (connectedPlayers(room).length === 0) room.emptySince = Date.now();
    sendLobby(room);
  });
});

// 아무도 없는 방 정리 (2분)
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.emptySince && now - r.emptySince > 120000) rooms.delete(code);
    else if (r.players.size === 0) rooms.delete(code);
  }
}, 10000);

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}${SIM_SPEED > 1 ? ` (배속 x${SIM_SPEED})` : ''}`);
});
