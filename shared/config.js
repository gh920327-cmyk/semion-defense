// ============================================================
// 게임 데이터 설정 파일 (서버와 클라이언트가 함께 사용)
// 직업·타워·태그·시너지·적·웨이브 수치를 여기서만 고치면 됩니다.
// 새 시너지/타워는 여기에 데이터만 추가하면 자동으로 동작합니다.
// ============================================================
(function (root) {
  const CONFIG = {
    TICK_RATE: 20,              // 서버 틱 (초당)
    TILE: 40,                   // 화면상 타일 크기(px)
    MAP: {
      cols: 24,
      rows: 14,
      // 적이 지나가는 길 (타일 좌표, 가로/세로 직선으로만 연결)
      waypoints: [[0, 2], [5, 2], [5, 10], [10, 10], [10, 3], [15, 3], [15, 11], [20, 11], [20, 6], [23, 6]],
    },

    START_GOLD: 220,
    START_LIFE: 30,
    FIRST_PREP_TIME: 30,        // 첫 웨이브 전 준비 시간(초)
    PREP_TIME: 20,              // 웨이브 사이 준비 시간(초)
    MAX_WAVE: 30,               // 이 웨이브를 클리어하면 승리
    ULT_UNLOCK_WAVE: 10,        // 이 웨이브를 클리어하면 궁극기 타워 해금
    MAX_PLAYERS: 4,
    SELL_REFUND: 0.7,           // 판매 시 환급 비율
    ADJ_RANGE: 2.5,             // 조합 시너지 인접 판정 거리(타일)
    CRIT_MULT: 2,               // 기본 치명타 배율
    ARMOR_FACTOR: 0.04,         // 방어력 1당 물리 피해 감소율
    MIN_ARMOR_DMG: 0.2,         // 방어력이 아무리 높아도 최소 이 비율만큼은 들어감
    SLOW_CAP: 0.7,              // 감속 최대치
    SHOCK_VULN: 0.15,           // 감전 상태 적이 받는 피해 증가
    WAVE_BONUS_BASE: 40,        // 웨이브 클리어 보너스 = BASE + PER * 웨이브
    WAVE_BONUS_PER: 6,
    GOLD_GROWTH: 0.04,          // 웨이브당 처치 골드 증가율

    UPGRADE: {
      maxLevel: 3,
      costMult: [0, 0.8, 1.4],  // [_, 1→2 비용배율, 2→3 비용배율] (타워 기본가 기준)
      dmgMult: 1.5,             // 레벨당 공격력 배율
      rateMult: 1.1,            // 레벨당 공격속도 배율
      rangeAdd: 0.25,           // 레벨당 사거리 증가
      auraMult: 1.25,           // 레벨당 오라 효과 배율
    },

    PLAYER_COLORS: ['#4fc3f7', '#ff8a65', '#aed581', '#f06292'],

    // 적 체력 스케일 (웨이브 / 인원 수)
    hpScale: (w) => Math.pow(1.12, w - 1),
    playerHpFactor: (n) => 0.5 + 0.5 * Math.max(1, n),

    // ---------------- 태그 ----------------
    TAGS: {
      physical:  { name: '물리', icon: '⚔️', color: '#cfd8dc' },
      fire:      { name: '화염', icon: '🔥', color: '#ff7043' },
      frost:     { name: '냉기', icon: '❄️', color: '#4fc3f7' },
      lightning: { name: '번개', icon: '⚡', color: '#ffee58' },
      holy:      { name: '신성', icon: '✨', color: '#fff59d' },
      crit:      { name: '치명타', icon: '🎯', color: '#ef5350' },
      support:   { name: '지원', icon: '💚', color: '#a5d6a7' },
      aoe:       { name: '광역', icon: '💥', color: '#ba68c8' },
    },

    // ---------------- 직업 ----------------
    // passive.effect 는 해당 직업 타워에 적용 (condition 이 있으면 조건부)
    CLASSES: {
      warrior: {
        name: '전사', icon: '⚔️', color: '#e57373',
        desc: '근접 물리. 사거리는 짧지만 강력하고, 탱커 적에 강합니다. 공중은 방패벽만 칠 수 있습니다.',
        passive: { name: '최전선', desc: '길에 바로 붙은 타워 공격력 +15%', condition: 'nearPath', effect: { dmgMult: 1.15 } },
        towers: ['w_sword', 'w_axe', 'w_shield', 'w_ult'],
      },
      mage: {
        name: '마법사', icon: '🔮', color: '#7986cb',
        desc: '원소 마법. 화상·감속·감전 상태이상과 범위 공격을 다룹니다.',
        passive: { name: '원소 증폭', desc: '상태이상 걸린 적에게 주는 피해 +20%', effect: { statusDmgMult: 1.2 } },
        towers: ['m_fire', 'm_frost', 'm_storm', 'm_ult'],
      },
      archer: {
        name: '궁수', icon: '🏹', color: '#81c784',
        desc: '장거리 치명타. 공중 적을 잘 잡습니다.',
        passive: { name: '매의 눈', desc: '치명타 확률 +10%', effect: { critAdd: 0.1 } },
        towers: ['a_bow', 'a_sniper', 'a_multi', 'a_ult'],
      },
      priest: {
        name: '사제', icon: '🕊️', color: '#ffd54f',
        desc: '지원. 주변 타워 강화, 적 약화, 팀 골드 보너스.',
        passive: { name: '풍요의 기도', desc: '웨이브 클리어 시 팀 전원 골드 +10%', teamGoldMult: 1.1 },
        towers: ['p_holy', 'p_bless', 'p_curse', 'p_ult'],
      },
    },

    // ---------------- 타워 ----------------
    // attack: single(단일) / splash(착탄 범위) / chain(연쇄) / multi(다중 대상) / none(공격 안 함)
    // dtype: physical(방어력 영향) / magic(마법 저항 영향)
    TOWERS: {
      // 전사
      w_sword:  { class: 'warrior', name: '검사 초소', icon: '🗡️', tags: ['physical'], dtype: 'physical', cost: 60,
                  attack: 'single', dmg: 24, rate: 1.2, range: 1.7, air: false,
                  desc: '저렴하고 튼튼한 근접 단일 공격.' },
      w_axe:    { class: 'warrior', name: '광전사 막사', icon: '🪓', tags: ['physical', 'aoe'], dtype: 'physical', cost: 110,
                  attack: 'splash', splash: 1.0, dmg: 34, rate: 0.8, range: 1.7, air: false,
                  desc: '도끼를 휘둘러 주변 적까지 벱니다.' },
      w_shield: { class: 'warrior', name: '방패벽', icon: '🛡️', tags: ['physical', 'support'], dtype: 'physical', cost: 90,
                  attack: 'single', dmg: 16, rate: 1, range: 2.5, air: true,
                  enemyAura: { range: 1.8, slow: 0.25, armorBreak: 3 },
                  desc: '방패를 던져 공중도 공격. 주변 적 25% 감속, 방어력 -3.' },
      w_ult:    { class: 'warrior', name: '전쟁군주의 요새', icon: '🏰', tags: ['physical', 'aoe'], dtype: 'physical', cost: 500, ult: true,
                  attack: 'splash', splash: 1.5, dmg: 140, rate: 0.7, range: 2.3, air: false, stunChance: 0.2,
                  desc: '[궁극기] 강력한 내려찍기. 20% 확률로 기절.' },

      // 마법사
      m_fire:   { class: 'mage', name: '화염 탑', icon: '🔥', tags: ['fire'], dtype: 'magic', cost: 70,
                  attack: 'single', dmg: 14, rate: 1, range: 3, air: true, burn: { dps: 10, dur: 3 },
                  desc: '적에게 3초간 화상을 입힙니다.' },
      m_frost:  { class: 'mage', name: '서리 탑', icon: '❄️', tags: ['frost'], dtype: 'magic', cost: 80,
                  attack: 'single', dmg: 8, rate: 1, range: 3, air: true, slow: { pct: 0.35, dur: 2 },
                  desc: '적을 35% 감속시킵니다.' },
      m_storm:  { class: 'mage', name: '번개 탑', icon: '⚡', tags: ['lightning'], dtype: 'magic', cost: 120,
                  attack: 'chain', chain: 3, dmg: 22, rate: 0.8, range: 3, air: true, shock: { dur: 2 },
                  desc: '번개가 3명에게 튕기고 감전(받는 피해 +15%)시킵니다.' },
      m_ult:    { class: 'mage', name: '대마법사의 첨탑', icon: '🌋', tags: ['fire', 'frost', 'lightning', 'aoe'], dtype: 'magic', cost: 550, ult: true,
                  attack: 'splash', splash: 2, dmg: 160, rate: 0.4, range: 4, air: true,
                  burn: { dps: 40, dur: 3 }, slow: { pct: 0.3, dur: 2 }, shock: { dur: 2 },
                  desc: '[궁극기] 운석 낙하. 화상+감속+감전을 모두 겁니다.' },

      // 궁수
      a_bow:    { class: 'archer', name: '궁수 초소', icon: '🏹', tags: ['crit'], dtype: 'physical', cost: 60,
                  attack: 'single', dmg: 14, rate: 1.5, range: 4, air: true, crit: 0.15,
                  desc: '빠른 연사, 치명타 15%.' },
      a_sniper: { class: 'archer', name: '저격탑', icon: '🎯', tags: ['crit'], dtype: 'physical', cost: 130,
                  attack: 'single', dmg: 75, rate: 0.35, range: 6.5, air: true, crit: 0.3,
                  desc: '초장거리 강타, 치명타 30%.' },
      a_multi:  { class: 'archer', name: '연사 탑', icon: '🪶', tags: ['crit', 'aoe'], dtype: 'physical', cost: 110,
                  attack: 'multi', multishot: 3, dmg: 11, rate: 1.3, range: 3.5, air: true, crit: 0.1,
                  desc: '한 번에 3명을 쏩니다.' },
      a_ult:    { class: 'archer', name: '폭풍 사수의 탑', icon: '🌪️', tags: ['crit', 'aoe'], dtype: 'physical', cost: 520, ult: true,
                  attack: 'multi', multishot: 6, dmg: 45, rate: 2, range: 5, air: true, crit: 0.35,
                  desc: '[궁극기] 6명에게 화살 폭풍, 치명타 35%.' },

      // 사제
      p_holy:   { class: 'priest', name: '신성 탑', icon: '✨', tags: ['holy'], dtype: 'magic', cost: 70,
                  attack: 'single', dmg: 16, rate: 1, range: 3, air: true, bossMult: 1.5,
                  desc: '보스에게 50% 추가 피해.' },
      p_bless:  { class: 'priest', name: '축복의 제단', icon: '🙏', tags: ['support'], dtype: 'magic', cost: 100,
                  attack: 'none', range: 2, towerAura: { range: 2, rateMult: 1.2 },
                  desc: '주변 타워(모든 플레이어) 공격속도 +20%.' },
      p_curse:  { class: 'priest', name: '저주의 토템', icon: '🗿', tags: ['holy', 'support'], dtype: 'magic', cost: 110,
                  attack: 'none', range: 2.5, enemyAura: { range: 2.5, armorBreak: 5, vuln: 0.1 },
                  desc: '주변 적 방어력 -5, 받는 피해 +10%.' },
      p_ult:    { class: 'priest', name: '대천사의 성소', icon: '👼', tags: ['holy', 'support', 'aoe'], dtype: 'magic', cost: 500, ult: true,
                  attack: 'splash', splash: 1.5, dmg: 90, rate: 0.8, range: 3.5, air: true, bossMult: 1.5,
                  towerAura: { range: 3, dmgMult: 1.25 },
                  desc: '[궁극기] 신성 폭발 + 주변 타워 공격력 +25%.' },
    },

    // ---------------- 태그 시너지 (오토체스 방식) ----------------
    // 팀 전체 타워의 태그 개수로 발동. 해당 태그를 가진 타워에만 효과 적용.
    // effect 규칙: 이름이 ...Mult 로 끝나면 곱하기, 숫자는 더하기, true 는 켜기
    TAG_SYNERGIES: {
      physical:  { name: '강철', tiers: [
        { count: 2, desc: '물리 타워 공격력 +10%', effect: { dmgMult: 1.1 } },
        { count: 4, desc: '물리 타워 공격력 +20%', effect: { dmgMult: 1.2 } },
        { count: 6, desc: '물리 타워 공격력 +35%', effect: { dmgMult: 1.35 } } ] },
      fire:      { name: '불꽃', tiers: [
        { count: 2, desc: '화상 피해 +30%', effect: { burnMult: 1.3 } },
        { count: 4, desc: '화상 피해 +30%, 불타던 적이 죽으면 주변으로 불이 번짐', effect: { burnMult: 1.3, burnSpread: true } } ] },
      frost:     { name: '혹한', tiers: [
        { count: 2, desc: '감속 +10%p', effect: { slowAdd: 0.1 } },
        { count: 4, desc: '감속 +10%p, 적중 시 15% 확률로 1초 빙결', effect: { slowAdd: 0.1, freezeChance: 0.15 } } ] },
      lightning: { name: '폭풍', tiers: [
        { count: 2, desc: '연쇄 대상 +1', effect: { chainAdd: 1 } },
        { count: 4, desc: '연쇄 대상 +2, 감전 시간 +1초', effect: { chainAdd: 2, shockDurAdd: 1 } } ] },
      holy:      { name: '성역', tiers: [
        { count: 2, desc: '보스 피해 +25%', effect: { bossDmgMult: 1.25 } },
        { count: 4, desc: '보스 피해 +25%, 적중 시 적 방어력 -2 누적(최대 -10)', effect: { bossDmgMult: 1.25, holyShred: 2 } } ] },
      crit:      { name: '급소', tiers: [
        { count: 2, desc: '치명타 확률 +5%p', effect: { critAdd: 0.05 } },
        { count: 4, desc: '치명타 확률 +10%p', effect: { critAdd: 0.1 } },
        { count: 6, desc: '치명타 확률 +15%p, 치명타 피해 +50%p', effect: { critAdd: 0.15, critMultAdd: 0.5 } } ] },
      support:   { name: '결속', tiers: [
        { count: 2, desc: '오라 범위 +0.5', effect: { auraRangeAdd: 0.5 } },
        { count: 4, desc: '오라 범위 +0.5, 오라 효과 +50%', effect: { auraRangeAdd: 0.5, auraPowerMult: 1.5 } } ] },
      aoe:       { name: '파괴', tiers: [
        { count: 2, desc: '폭발 범위 +20%, 다중 사격 +1', effect: { splashMult: 1.2, multishotAdd: 1 } },
        { count: 4, desc: '폭발 범위 +40%, 다중 사격 +2', effect: { splashMult: 1.4, multishotAdd: 2 } } ] },
    },

    // ---------------- 직업 간 조합 시너지 ----------------
    // a 조건 타워와 b 조건 타워가 ADJ_RANGE 안에 있고 직업이 서로 다를 때 발동 (협동 유도).
    // target: 'b' 면 b 타워만, 'both' 면 둘 다 효과를 받음.
    COMBOS: [
      { id: 'shatter', name: '산산조각', icon: '🧊',
        a: { tag: 'frost' }, b: { cls: 'warrior' }, target: 'b',
        desc: '냉기 타워 옆 전사 타워: 감속된 적에게 피해 1.5배, 빙결된 적에게 2배',
        effect: { vsSlowedMult: 1.5, vsFrozenMult: 2 } },
      { id: 'blessed_arrow', name: '축복받은 화살', icon: '🌟',
        a: { cls: 'priest', tag: 'support' }, b: { cls: 'archer' }, target: 'b',
        desc: '사제 지원 타워 옆 궁수 타워: 치명타 피해 +50%p',
        effect: { critMultAdd: 0.5 } },
      { id: 'thunder_arrow', name: '번개 화살', icon: '🌩️',
        a: { tag: 'lightning' }, b: { cls: 'archer' }, target: 'b',
        desc: '번개 타워 옆 궁수 타워: 화살이 근처 적 1명에게 50% 피해로 튕김',
        effect: { chainArrow: 1 } },
      { id: 'holy_flame', name: '성화', icon: '🕯️',
        a: { tag: 'holy' }, b: { tag: 'fire' }, target: 'b',
        desc: '신성 타워 옆 화염 타워: 화상 피해 +50%, 화상이 마법 저항 무시',
        effect: { burnMult: 1.5, burnIgnoreMR: true } },
      { id: 'war_cry', name: '전장의 함성', icon: '📯',
        a: { cls: 'priest' }, b: { cls: 'warrior' }, target: 'b',
        desc: '사제 타워 옆 전사 타워: 공격속도 +25%',
        effect: { rateMult: 1.25 } },
      { id: 'holy_blade', name: '성검', icon: '⚜️',
        a: { tag: 'holy' }, b: { cls: 'warrior' }, target: 'b',
        desc: '신성 타워 옆 전사 타워: 적 방어력 50% 무시',
        effect: { armorPen: 0.5 } },
      { id: 'execution', name: '처형', icon: '💀',
        a: { cls: 'warrior' }, b: { cls: 'archer' }, target: 'both',
        desc: '전사·궁수 타워가 붙어 있으면 둘 다: 체력 30% 미만 적에게 피해 1.3배',
        effect: { executeMult: 1.3 } },
      { id: 'overload', name: '과부하', icon: '🔋',
        a: { cls: 'priest', tag: 'support' }, b: { cls: 'mage' }, target: 'b',
        desc: '사제 지원 타워 옆 마법사 타워: 공격력 +20%',
        effect: { dmgMult: 1.2 } },
    ],

    // ---------------- 적 ----------------
    ENEMIES: {
      normal: { name: '구울', color: '#9e9e9e', radius: 0.28, hp: 60, speed: 1.6, armor: 0, mr: 0, gold: 5, life: 1 },
      fast:   { name: '질주 박쥐', color: '#fdd835', radius: 0.22, hp: 40, speed: 2.8, armor: 0, mr: 0, gold: 4, life: 1 },
      tank:   { name: '철갑 골렘', color: '#8d6e63', radius: 0.38, hp: 200, speed: 1.1, armor: 6, armorGrowth: 0.3, mr: 0, gold: 12, life: 2 },
      flying: { name: '가고일', color: '#90caf9', radius: 0.28, hp: 70, speed: 1.8, armor: 0, mr: 0, gold: 8, life: 1, flying: true },
      resist: { name: '주술사', color: '#ab47bc', radius: 0.3, hp: 120, speed: 1.4, armor: 0, mr: 0.5, gold: 9, life: 1 },
      boss:   { name: '군주', color: '#d32f2f', radius: 0.55, hp: 1800, speed: 0.9, armor: 5, armorGrowth: 0.3, mr: 0.25, gold: 150, life: 10 },
    },
    BOSS_ORDER: ['regen', 'summon', 'shield', 'haste'],
    BOSS_ABILITIES: {
      regen:  { name: '재생의 군주', desc: '초당 최대 체력의 1.2% 회복', regen: 0.012 },
      summon: { name: '소환의 군주', desc: '4초마다 박쥐 3마리 소환', cooldown: 4, count: 3 },
      shield: { name: '불멸의 군주', desc: '7초마다 1.5초간 무적', cooldown: 7, duration: 1.5 },
      haste:  { name: '질풍의 군주', desc: '5초마다 1.5초간 2.5배 속도', cooldown: 5, duration: 1.5, mult: 2.5 },
    },

    // ---------------- 웨이브 구성 ----------------
    // 그룹은 순서대로 나오며, 그룹 사이에 groupGap 초 쉼
    groupGap: 2,
    makeWave(w) {
      const g = [];
      g.push({ type: 'normal', count: 8 + w, interval: 0.8 });
      if (w >= 2) g.push({ type: 'fast', count: 3 + Math.floor(w * 0.8), interval: 0.5 });
      if (w >= 3 && w % 2 === 1) g.push({ type: 'tank', count: 2 + Math.floor(w / 3), interval: 1.4 });
      if (w >= 4 && w % 3 === 1) g.push({ type: 'flying', count: 4 + Math.floor(w / 2), interval: 0.9 });
      if (w >= 6 && w % 2 === 0) g.push({ type: 'resist', count: 3 + Math.floor(w / 3), interval: 1 });
      if (w % 5 === 0) {
        const boss = CONFIG.BOSS_ORDER[(w / 5 - 1) % CONFIG.BOSS_ORDER.length];
        g.push({ type: 'boss', count: w >= 25 ? 2 : 1, interval: 4, boss });
      }
      return g;
    },
  };

  // 길 계산 (서버/클라이언트 공용)
  CONFIG.buildPath = function () {
    const wp = CONFIG.MAP.waypoints.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
    const segs = []; let total = 0;
    const tiles = new Set();
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i], b = wp[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a, b, len, start: total });
      total += len;
      const [ax, ay] = CONFIG.MAP.waypoints[i], [bx, by] = CONFIG.MAP.waypoints[i + 1];
      const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
      let x = ax, y = ay;
      tiles.add(x + ',' + y);
      while (x !== bx || y !== by) { x += sx; y += sy; tiles.add(x + ',' + y); }
    }
    const near = new Set();
    for (let x = 0; x < CONFIG.MAP.cols; x++) for (let y = 0; y < CONFIG.MAP.rows; y++) {
      if (tiles.has(x + ',' + y)) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        if (tiles.has((x + dx) + ',' + (y + dy))) near.add(x + ',' + y);
    }
    function posAt(d) {
      if (d <= 0) return { x: wp[0].x, y: wp[0].y };
      for (const s of segs) {
        if (d <= s.start + s.len) {
          const t = (d - s.start) / s.len;
          return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
        }
      }
      const l = wp[wp.length - 1];
      return { x: l.x, y: l.y };
    }
    return { segs, total, tiles, near, posAt };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(this);
