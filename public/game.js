// ============================================================
// 세미온 디펜스 - 클라이언트
// 서버가 보내준 상태를 그리고, 입력을 서버로 보냅니다.
// ============================================================
(() => {
  const socket = io();
  const T = CONFIG.TILE;
  const PATH = CONFIG.buildPath();
  const $ = (id) => document.getElementById(id);

  // ---------------- 상태 ----------------
  let myName = null;
  let lobby = null;          // 로비 정보
  let towers = [];           // 서버에서 받은 타워 목록
  let synergy = { tags: [], combos: [] };
  let st = null;             // 최신 게임 상태
  const enemyView = new Map(); // 보간용 적 위치
  let fxList = [];
  let pings = [];
  let selType = null;        // 설치하려고 고른 타워 종류
  let selTowerId = null;     // 클릭해서 선택한 타워
  let hoverTile = null;
  let gameOver = false;

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
  };

  // ---------------- 화면 전환 ----------------
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  function me() { return st && st.pl.find((p) => p.name === myName); }
  function myClass() {
    const p = lobby && lobby.players.find((x) => x.name === myName);
    return p ? p.cls : null;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ============================================================
  // 타이틀
  // ============================================================
  $('in-name').value = storage.get('td_name') || '';
  const urlCode = new URLSearchParams(location.search).get('room');
  if (urlCode) $('in-code').value = urlCode.toUpperCase();

  $('btn-create').onclick = () => {
    const name = $('in-name').value.trim();
    storage.set('td_name', name);
    socket.emit('create', { name });
  };
  $('btn-join').onclick = () => {
    const name = $('in-name').value.trim();
    storage.set('td_name', name);
    socket.emit('join', { code: $('in-code').value, name });
  };
  $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

  socket.on('err', (msg) => {
    if ($('screen-game').classList.contains('active')) toast('⚠️ ' + msg);
    else alert(msg);
  });

  socket.on('joined', ({ code, name }) => {
    myName = name;
    history.replaceState(null, '', '?room=' + code);
    show('lobby');
  });

  // ============================================================
  // 로비
  // ============================================================
  socket.on('lobby', (info) => {
    lobby = info;
    renderLobby();
    if (info.state === 'lobby' && $('screen-game').classList.contains('active') && !gameOver) show('lobby');
  });

  function renderLobby() {
    if (!lobby) return;
    $('lobby-code').textContent = lobby.code;
    $('lobby-players').innerHTML = lobby.players.map((p) => {
      const c = p.cls ? CONFIG.CLASSES[p.cls] : null;
      return `<div class="lp" style="border-color:${p.color}">
        <div class="nm" style="color:${p.color}">${lobby.host === p.name ? '👑 ' : ''}${esc(p.name)}${p.name === myName ? ' (나)' : ''}</div>
        <div class="st">${c ? c.icon + ' ' + c.name : '직업 선택 중'} · ${p.ready || lobby.host === p.name ? (lobby.host === p.name ? '방장' : '✅ 준비') : '대기'}${p.connected ? '' : ' · 🔌 끊김'}</div>
      </div>`;
    }).join('');

    const mine = myClass();
    $('class-cards').innerHTML = Object.entries(CONFIG.CLASSES).map(([key, c]) => {
      const owner = lobby.players.find((p) => p.cls === key);
      const taken = owner && owner.name !== myName;
      const list = c.towers.map((tid) => {
        const d = CONFIG.TOWERS[tid];
        return `<li><img class="li-img" src="${statueIcon(tid, c.color)}" alt=""><span><b>${d.name}</b> (${d.cost}) - ${d.desc} <span class="hint">${d.tags.map((tg) => CONFIG.TAGS[tg].icon).join('')}</span></span></li>`;
      }).join('');
      return `<div class="cc ${key === mine ? 'mine' : ''} ${taken ? 'taken' : ''}" data-cls="${key}" style="border-top:4px solid ${c.color}">
        <h4>${c.icon} ${c.name}</h4>
        <p class="desc">${c.desc}</p>
        <div class="passive">패시브 <b>${c.passive.name}</b>: ${c.passive.desc}</div>
        <ul>${list}</ul>
        ${owner ? `<div class="owner" style="color:${owner.color}">선택: ${esc(owner.name)}</div>` : ''}
      </div>`;
    }).join('');
    document.querySelectorAll('.cc').forEach((el) => {
      el.onclick = () => { if (!el.classList.contains('taken')) socket.emit('selectClass', el.dataset.cls); };
    });

    const isHost = lobby.host === myName;
    const meP = lobby.players.find((p) => p.name === myName);
    $('btn-ready').classList.toggle('hidden', isHost);
    $('btn-ready').classList.toggle('on', !!(meP && meP.ready));
    $('btn-ready').textContent = meP && meP.ready ? '✅ 준비 완료' : '준비';
    $('btn-start').classList.toggle('hidden', !isHost);
    const allSet = lobby.players.every((p) => p.cls && (p.ready || p.name === lobby.host));
    $('btn-start').disabled = !allSet;
    $('lobby-msg').textContent = isHost
      ? (allSet ? '모두 준비됐어요. 시작하세요!' : '모든 플레이어가 직업을 고르고 준비하면 시작할 수 있어요. (혼자서도 가능)')
      : '직업을 고르고 준비를 누르세요.';
  }

  $('btn-ready').onclick = () => socket.emit('lobbyReady');
  $('btn-start').onclick = () => socket.emit('start');
  $('btn-copy').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + (lobby ? lobby.code : '');
    navigator.clipboard?.writeText(url).then(() => alert('초대 링크를 복사했어요!\n' + url), () => prompt('이 링크를 복사하세요', url));
  };

  // ============================================================
  // 게임 시작 / 상태 수신
  // ============================================================
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = CONFIG.MAP.cols * T;
  canvas.height = CONFIG.MAP.rows * T;
  $('hud-maxwave').textContent = CONFIG.MAX_WAVE;

  socket.on('gameStart', () => {
    gameOver = false;
    towers = []; synergy = { tags: [], combos: [] }; st = null;
    enemyView.clear(); fxList = []; pings = [];
    selType = null; selTowerId = null;
    $('result').classList.add('hidden');
    $('chat-log').innerHTML = '';
    show('game');
    renderTowerBar();
    renderTowerPanel();
  });

  socket.on('towers', (data) => {
    towers = data.towers;
    synergy = data.synergy;
    if (selTowerId && !towers.find((t) => t.id === selTowerId)) selTowerId = null;
    renderSynergy();
    renderTowerPanel();
  });

  let lastGold = -1, lastUlt = null, lastPhase = null;
  socket.on('state', (s) => {
    st = s;
    const now = performance.now();
    const seen = new Set();
    for (const e of s.en) {
      seen.add(e.id);
      const v = enemyView.get(e.id);
      if (v) { Object.assign(v, e, { x: v.x, y: v.y, tx: e.x, ty: e.y }); }
      else enemyView.set(e.id, { ...e, tx: e.x, ty: e.y });
    }
    for (const id of enemyView.keys()) if (!seen.has(id)) enemyView.delete(id);
    for (const f of s.fx) {
      f.born = now;
      if (f.k === 'leak') { flashLife(); continue; }
      fxList.push(f);
    }
    if (fxList.length > 300) fxList = fxList.slice(-300);
    renderHud();
    const g = me() ? me().gold : 0;
    if (g !== lastGold || s.ult !== lastUlt) { lastGold = g; lastUlt = s.ult; renderTowerBar(); renderTowerPanel(); }
    if (s.ph !== lastPhase) { lastPhase = s.ph; }
  });

  let lifeFlash = 0;
  function flashLife() { lifeFlash = performance.now(); }

  function renderHud() {
    if (!st) return;
    $('hud-wave').textContent = st.w;
    $('hud-life').textContent = st.life;
    $('hud-life').style.color = performance.now() - lifeFlash < 400 ? '#ff5252' : '';
    const m = me();
    $('hud-gold').textContent = m ? m.gold : 0;
    $('hud-phase').textContent = st.ph === 'prep'
      ? `⏳ 다음 웨이브까지 ${st.tm}초`
      : `⚔️ 전투 중 · 남은 적 ${st.left}`;
    const btn = $('btn-wave-ready');
    btn.classList.toggle('hidden', st.ph !== 'prep');
    btn.classList.toggle('on', !!(m && m.ready));
    btn.textContent = m && m.ready ? '✅ 준비됨 (R)' : '준비 (R)';
    $('hud-players').innerHTML = st.pl.map((p) => {
      const c = p.cls ? CONFIG.CLASSES[p.cls] : null;
      return `<span class="hp-chip ${p.connected ? '' : 'off'}" style="border-color:${p.color}">
        ${c ? c.icon : ''} ${esc(p.name)} 💰${p.gold}${st.ph === 'prep' && p.ready ? ' ✅' : ''}</span>`;
    }).join('');
  }

  $('btn-wave-ready').onclick = () => socket.emit('waveReady');

  // ---------------- 타워 선택 바 ----------------
  function upgradeCost(t) {
    return Math.round(CONFIG.TOWERS[t.type].cost * CONFIG.UPGRADE.costMult[t.level]);
  }

  function renderTowerBar() {
    const cls = myClass();
    if (!cls) { $('tower-bar').innerHTML = ''; return; }
    const gold = me() ? me().gold : 0;
    const ultOk = st && st.ult;
    const hasUlt = towers.some((t) => t.owner === myName && CONFIG.TOWERS[t.type].ult);
    $('tower-bar').innerHTML = CONFIG.CLASSES[cls].towers.map((tid, i) => {
      const d = CONFIG.TOWERS[tid];
      const locked = d.ult && (!ultOk || hasUlt);
      const lockText = d.ult ? (!ultOk ? `🔒 ${CONFIG.ULT_UNLOCK_WAVE}웨이브 클리어 후` : (hasUlt ? '이미 설치함' : '')) : '';
      return `<button class="tb ${selType === tid ? 'sel' : ''} ${gold < d.cost ? 'poor' : ''}" data-t="${tid}" ${locked ? 'disabled' : ''}
        title="${esc(d.desc)}">
        <img class="tb-img" src="${statueIcon(tid, me() ? me().color : '#ffffff')}" alt="">
        <span class="tb-txt">
          <span class="row1"><span>${i + 1}. ${d.name}</span><span class="cost">${d.cost}</span></span>
          <span class="row2">${lockText || d.tags.map((tg) => CONFIG.TAGS[tg].icon + CONFIG.TAGS[tg].name).join(' ')}</span>
        </span>
      </button>`;
    }).join('');
    document.querySelectorAll('.tb').forEach((b) => { b.onclick = () => selectType(b.dataset.t); });
  }

  function selectType(tid) {
    const d = CONFIG.TOWERS[tid];
    if (!d) return;
    if (d.ult && !(st && st.ult)) return toast(`궁극기 타워는 ${CONFIG.ULT_UNLOCK_WAVE}웨이브 클리어 후 해금됩니다.`);
    selType = selType === tid ? null : tid;
    selTowerId = null;
    renderTowerBar();
    renderTowerPanel();
  }

  // ---------------- 시너지 패널 ----------------
  function renderSynergy() {
    const tagsHtml = synergy.tags.map((s) => {
      const def = CONFIG.TAG_SYNERGIES[s.tag];
      const tg = CONFIG.TAGS[s.tag];
      const cur = s.tier >= 0 ? def.tiers[s.tier] : null;
      const nxt = def.tiers.find((tr) => tr.count > s.count);
      const steps = def.tiers.map((tr) => tr.count).join(' / ');
      return `<div class="syn ${cur ? 'on' : ''}">
        <div class="top"><span>${tg.icon} ${def.name} (${tg.name})</span><span>${s.count} <span class="hint">[${steps}]</span></span></div>
        ${cur ? `<div class="d cur">✔ ${cur.desc}</div>` : ''}
        ${nxt ? `<div class="d">다음 ${nxt.count}개: ${nxt.desc}</div>` : ''}
      </div>`;
    }).join('');
    $('syn-tags').innerHTML = tagsHtml || '<p class="hint">타워를 지으면 태그 시너지가 쌓입니다.</p>';

    const active = new Set(synergy.combos.map((c) => c.id));
    $('syn-combos').innerHTML = CONFIG.COMBOS.map((c) => {
      const on = synergy.combos.find((x) => x.id === c.id);
      return `<div class="syn ${active.has(c.id) ? 'on' : ''}">
        <div class="top"><span>${c.icon} ${c.name}</span><span>${on ? '×' + on.count : ''}</span></div>
        <div class="d ${on ? 'cur' : ''}">${c.desc}</div>
      </div>`;
    }).join('');
  }

  // ---------------- 선택한 타워 정보 ----------------
  function renderTowerPanel() {
    const el = $('tower-panel');
    if (selType) {
      const d = CONFIG.TOWERS[selType];
      el.innerHTML = `<div class="tp-head"><img class="tp-img" src="${statueIcon(selType, me() ? me().color : '#ffffff')}" alt=""><div class="tp-title">${d.name} 설치</div></div>
        <p class="hint">${d.desc}</p>
        <div class="chips">${d.tags.map((tg) => `<span class="chip">${CONFIG.TAGS[tg].icon} ${CONFIG.TAGS[tg].name}</span>`).join('')}</div>
        <p class="hint">맵을 클릭해서 설치 · 우클릭/Esc로 취소<br>마우스를 올리면 발동될 시너지가 보입니다.</p>`;
      return;
    }
    const t = towers.find((x) => x.id === selTowerId);
    if (!t) { el.innerHTML = '<p class="hint">타워를 클릭하면 정보가 보입니다.<br>1~4: 타워 선택 · R: 준비 · U: 업그레이드 · S: 판매</p>'; return; }
    const d = CONFIG.TOWERS[t.type];
    const owner = st && st.pl.find((p) => p.name === t.owner);
    const mine = t.owner === myName;
    const s = t.s;
    const rows = [];
    if (d.attack !== 'none') {
      rows.push(['공격력', s.dmg], ['공격속도', s.rate + '/초'], ['사거리', s.range]);
      if (s.crit) rows.push(['치명타', `${s.crit}% (x${s.critMult})`]);
      if (d.attack === 'splash') rows.push(['폭발 범위', s.splash]);
      if (d.attack === 'multi') rows.push(['동시 사격', s.multishot + '명']);
      if (d.attack === 'chain') rows.push(['연쇄', s.chain + '명']);
      if (s.burn) rows.push(['화상', s.burn + '/초']);
      if (s.slow) rows.push(['감속', s.slow + '%']);
      if (!d.air) rows.push(['공중 공격', '불가']);
    }
    if (s.auraRange) rows.push(['오라 범위', s.auraRange]);
    rows.push(['처치 / 피해', `${t.kills} / ${t.dmg}`]);
    const gold = me() ? me().gold : 0;
    const maxed = t.level >= CONFIG.UPGRADE.maxLevel;
    el.innerHTML = `<div class="tp-head"><img class="tp-img" src="${statueIcon(t.type, owner ? owner.color : '#ffffff')}" alt="">
      <div><div class="tp-title">${d.name} <span class="hint">Lv.${t.level}</span></div>
      <div class="hint" style="color:${owner ? owner.color : ''}">주인: ${esc(t.owner)}</div></div></div>
      <p class="hint">${d.desc}</p>
      ${rows.map(([k, v]) => `<div class="tp-row"><span>${k}</span><b>${v}</b></div>`).join('')}
      <div class="chips">${d.tags.map((tg) => `<span class="chip">${CONFIG.TAGS[tg].icon} ${CONFIG.TAGS[tg].name}</span>`).join('')}</div>
      <div class="chips">${t.syn.length ? t.syn.map((n) => `<span class="chip syn-chip">✦ ${esc(n)}</span>`).join('') : '<span class="hint">적용 중인 시너지 없음</span>'}</div>
      ${mine ? `<div class="tp-btns">
        <button id="tp-up" ${maxed || gold < upgradeCost(t) ? 'disabled' : ''}>${maxed ? '최대 레벨' : `업그레이드 (${upgradeCost(t)})`}</button>
        <button id="tp-sell">판매 (+${Math.floor(t.invested * CONFIG.SELL_REFUND)})</button>
      </div>` : ''}`;
    if (mine) {
      const up = $('tp-up'), sell = $('tp-sell');
      if (up) up.onclick = () => socket.emit('upgrade', t.id);
      if (sell) sell.onclick = () => socket.emit('sell', t.id);
    }
  }

  // ============================================================
  // 설치 미리보기: 여기 지으면 발동될 시너지
  // ============================================================
  function matches(type, cond) {
    const d = CONFIG.TOWERS[type];
    if (cond.cls && d.class !== cond.cls) return false;
    if (cond.tag && !d.tags.includes(cond.tag)) return false;
    return true;
  }

  function previewAt(type, x, y) {
    const d = CONFIG.TOWERS[type];
    const lines = [];
    const counts = {};
    for (const t of towers) for (const tg of CONFIG.TOWERS[t.type].tags) counts[tg] = (counts[tg] || 0) + 1;
    for (const tg of d.tags) {
      const def = CONFIG.TAG_SYNERGIES[tg];
      const n = (counts[tg] || 0) + 1;
      const hit = def.tiers.find((tr) => tr.count === n);
      const nxt = def.tiers.find((tr) => tr.count > n);
      if (hit) lines.push(`<span class="ok">▲ ${CONFIG.TAGS[tg].icon} ${def.name} ${n} 발동: ${hit.desc}</span>`);
      else if (nxt) lines.push(`${CONFIG.TAGS[tg].icon} ${def.name} ${n}/${nxt.count}`);
    }
    const c = { x: x + 0.5, y: y + 0.5 };
    const near = towers.filter((t) => Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y) <= CONFIG.ADJ_RANGE
      && CONFIG.TOWERS[t.type].class !== d.class);
    for (const combo of CONFIG.COMBOS) {
      if (matches(type, combo.b) && near.some((t) => matches(t.type, combo.a))) {
        lines.push(`<span class="ok">★ ${combo.icon} ${combo.name}: 이 타워에 적용</span>`);
      }
      const partners = near.filter((t) => matches(t.type, combo.b));
      if (matches(type, combo.a) && partners.length) {
        lines.push(`<span class="ok">★ ${combo.icon} ${combo.name}: 이웃 타워 ${partners.length}개에 적용</span>`);
      }
    }
    for (const t of towers) {
      const td = CONFIG.TOWERS[t.type];
      if (td.towerAura && Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y) <= (t.s.auraRange || td.towerAura.range)) {
        lines.push(`<span class="ok">💚 ${td.name} 오라 받음</span>`);
      }
    }
    const passive = CONFIG.CLASSES[d.class].passive;
    if (passive.condition === 'nearPath') {
      lines.push(PATH.near.has(x + ',' + y)
        ? `<span class="ok">✔ 패시브 ${passive.name} 적용</span>`
        : `<span class="bad">✘ 길에서 떨어져 패시브 ${passive.name} 미적용</span>`);
    }
    return lines;
  }

  function canPlace(x, y) {
    if (x < 0 || y < 0 || x >= CONFIG.MAP.cols || y >= CONFIG.MAP.rows) return false;
    if (PATH.tiles.has(x + ',' + y)) return false;
    return !towers.some((t) => t.x === x && t.y === y);
  }

  // ============================================================
  // 입력
  // ============================================================
  function tileFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (canvas.width / r.width);
    const py = (e.clientY - r.top) * (canvas.height / r.height);
    return { x: Math.floor(px / T), y: Math.floor(py / T), fx: px / T, fy: py / T };
  }

  canvas.addEventListener('mousemove', (e) => {
    hoverTile = tileFromEvent(e);
    updateTooltip(e);
  });
  canvas.addEventListener('mouseleave', () => { hoverTile = null; $('tooltip').classList.add('hidden'); });

  function updateTooltip(e) {
    const tip = $('tooltip');
    if (!selType || !hoverTile) { tip.classList.add('hidden'); return; }
    const d = CONFIG.TOWERS[selType];
    const ok = canPlace(hoverTile.x, hoverTile.y);
    const gold = me() ? me().gold : 0;
    const lines = [`<b>${d.icon} ${d.name}</b> (${d.cost}골드)`];
    if (!ok) lines.push('<span class="bad">여기엔 지을 수 없어요</span>');
    else {
      if (gold < d.cost) lines.push('<span class="bad">골드 부족</span>');
      lines.push(...previewAt(selType, hoverTile.x, hoverTile.y));
    }
    tip.innerHTML = lines.join('<br>');
    tip.classList.remove('hidden');
    const wrap = canvas.parentElement.getBoundingClientRect();
    let lx = e.clientX - wrap.left + 16, ly = e.clientY - wrap.top + 16;
    if (lx + 290 > wrap.width) lx = e.clientX - wrap.left - 296;
    tip.style.left = Math.max(4, lx) + 'px';
    tip.style.top = Math.min(ly, wrap.height - 120) + 'px';
  }

  canvas.addEventListener('click', (e) => {
    const t = tileFromEvent(e);
    if (selType) {
      if (canPlace(t.x, t.y)) socket.emit('build', { type: selType, x: t.x, y: t.y });
      else toast('여기엔 지을 수 없어요.');
      if (!e.shiftKey) { /* 연속 설치: 선택 유지 (Esc로 취소) */ }
      return;
    }
    const tw = towers.find((o) => o.x === t.x && o.y === t.y);
    selTowerId = tw ? tw.id : null;
    renderTowerPanel();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (selType) { selType = null; renderTowerBar(); renderTowerPanel(); $('tooltip').classList.add('hidden'); return; }
    const t = tileFromEvent(e);
    socket.emit('mapPing', { x: t.fx, y: t.fy });
  });

  document.addEventListener('keydown', (e) => {
    if (!$('screen-game').classList.contains('active')) return;
    const chatIn = $('chat-in');
    if (document.activeElement === chatIn) {
      if (e.key === 'Enter') {
        if (chatIn.value.trim()) socket.emit('chat', chatIn.value);
        chatIn.value = '';
        chatIn.blur();
      } else if (e.key === 'Escape') chatIn.blur();
      return;
    }
    if (e.key === 'Enter') { chatIn.focus(); e.preventDefault(); return; }
    const cls = myClass();
    if (cls && e.key >= '1' && e.key <= '4') selectType(CONFIG.CLASSES[cls].towers[+e.key - 1]);
    else if (e.key === 'Escape') { selType = null; selTowerId = null; renderTowerBar(); renderTowerPanel(); $('tooltip').classList.add('hidden'); }
    else if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') socket.emit('waveReady');
    else if ((e.key === 'u' || e.key === 'U' || e.key === 'ㅕ') && selTowerId) socket.emit('upgrade', selTowerId);
    else if ((e.key === 's' || e.key === 'S' || e.key === 'ㄴ') && selTowerId) {
      const t = towers.find((o) => o.id === selTowerId);
      if (t && t.owner === myName) socket.emit('sell', selTowerId);
    }
  });

  // ---------------- 채팅 / 시스템 메시지 / 핑 ----------------
  function addChat(html) {
    const log = $('chat-log');
    const div = document.createElement('div');
    div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  socket.on('chat', (m) => addChat(`<b style="color:${m.color}">${esc(m.name)}</b>: ${esc(m.text)}`));
  socket.on('sys', (msg) => { addChat(`<span class="sys">${esc(msg)}</span>`); if (/웨이브|보스|해금/.test(msg)) toast(msg); });
  socket.on('mapPing', (p) => pings.push({ ...p, born: performance.now() }));

  // ---------------- 게임 종료 ----------------
  socket.on('gameOver', (r) => {
    gameOver = true;
    $('result').classList.remove('hidden');
    $('result-title').textContent = r.win ? '🏆 승리!' : '💀 패배';
    $('result-sub').textContent = r.win ? `${r.wave}웨이브를 모두 막아냈습니다!` : `${r.wave}웨이브에서 쓰러졌습니다. (클리어 ${r.cleared})`;
    $('result-table').innerHTML = `<tr><th>플레이어</th><th>직업</th><th>피해량</th><th>처치</th><th>설치</th><th>최고 시너지</th></tr>`
      + r.stats.map((s) => `<tr>
        <td style="color:${s.color}">${esc(s.name)}</td>
        <td>${s.cls ? CONFIG.CLASSES[s.cls].icon + ' ' + CONFIG.CLASSES[s.cls].name : '-'}</td>
        <td>${s.damage.toLocaleString()}</td><td>${s.kills}</td><td>${s.built}</td>
        <td>${s.topSyn ? esc(s.topSyn) + ` <span class="hint">(${s.topSynDmg.toLocaleString()})</span>` : '-'}</td></tr>`).join('');
    const isHost = lobby && lobby.host === myName;
    $('btn-lobby').classList.toggle('hidden', !isHost);
    $('result-hint').textContent = isHost ? '' : '방장이 로비로 돌아가면 다시 할 수 있어요.';
  });
  $('btn-lobby').onclick = () => socket.emit('backToLobby');
  socket.on('lobby', (info) => {
    if (info.state === 'lobby' && gameOver) { gameOver = false; $('result').classList.add('hidden'); show('lobby'); }
  });

  socket.on('disconnect', () => {
    if (myName) toast('🔌 서버 연결이 끊겼습니다. 새로고침 후 같은 닉네임으로 다시 참가하세요.');
  });

  // ============================================================
  // 그리기
  // ============================================================
  const bg = document.createElement('canvas');
  bg.width = canvas.width; bg.height = canvas.height;
  (function drawBackground() {
    const b = bg.getContext('2d');
    for (let x = 0; x < CONFIG.MAP.cols; x++) for (let y = 0; y < CONFIG.MAP.rows; y++) {
      const k = x + ',' + y;
      if (PATH.tiles.has(k)) b.fillStyle = (x + y) % 2 ? '#6d5a3f' : '#735f43';
      else b.fillStyle = (x + y) % 2 ? '#22382a' : '#253c2d';
      b.fillRect(x * T, y * T, T, T);
    }
    b.strokeStyle = 'rgba(0,0,0,.18)';
    for (let x = 0; x <= CONFIG.MAP.cols; x++) { b.beginPath(); b.moveTo(x * T, 0); b.lineTo(x * T, bg.height); b.stroke(); }
    for (let y = 0; y <= CONFIG.MAP.rows; y++) { b.beginPath(); b.moveTo(0, y * T); b.lineTo(bg.width, y * T); b.stroke(); }
    const wp = CONFIG.MAP.waypoints;
    b.font = `${T * 0.7}px serif`; b.textAlign = 'center'; b.textBaseline = 'middle';
    b.fillText('🚪', (wp[0][0] + 0.5) * T, (wp[0][1] + 0.5) * T);
    b.fillText('🏯', (wp[wp.length - 1][0] + 0.5) * T, (wp[wp.length - 1][1] + 0.5) * T);
  })();

  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

  function drawTowers(now) {
    // 아래쪽 타워가 위쪽 석상을 가리도록 y 순서로 그림
    const list = towers.slice().sort((a, b) => a.y - b.y);
    for (const t of list) {
      const d = CONFIG.TOWERS[t.type];
      const owner = st && st.pl.find((p) => p.name === t.owner);
      const cx = (t.x + 0.5) * T, cy = (t.y + 0.5) * T;
      if (d.ult) {   // 궁극기: 발밑에서 맥동하는 금빛
        const a = 0.25 + 0.15 * Math.sin(now / 300);
        const g = ctx.createRadialGradient(cx, cy + T * 0.2, 0, cx, cy + T * 0.2, T * 0.8);
        g.addColorStop(0, `rgba(255,215,64,${a})`); g.addColorStop(1, 'rgba(255,215,64,0)');
        ctx.fillStyle = g; circle(cx, cy + T * 0.2, T * 0.8); ctx.fill();
      }
      if (t.id === selTowerId) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.3, T * 0.48, T * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
      }
      drawStatue(ctx, t.type, t.level, owner ? owner.color : '#ffffff', t.x, t.y, T);
      if (t.syn.length > 1) {
        ctx.fillStyle = 'rgba(20,16,8,.8)';
        circle(t.x * T + T - 7, t.y * T + 2, 7); ctx.fill();
        ctx.fillStyle = '#ffb74d'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✦' + t.syn.length, t.x * T + T - 7, t.y * T + 2.5);
      }
    }
  }

  function drawRanges() {
    const t = towers.find((x) => x.id === selTowerId);
    if (t) {
      const cx = (t.x + 0.5) * T, cy = (t.y + 0.5) * T;
      if (CONFIG.TOWERS[t.type].attack !== 'none') {
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.5;
        circle(cx, cy, t.s.range * T); ctx.fill(); ctx.stroke();
      }
      if (t.s.auraRange) {
        ctx.strokeStyle = 'rgba(165,214,167,.8)'; ctx.setLineDash([6, 4]);
        circle(cx, cy, t.s.auraRange * T); ctx.stroke(); ctx.setLineDash([]);
      }
      // 조합 시너지 인접 범위
      ctx.strokeStyle = 'rgba(255,183,77,.35)'; ctx.setLineDash([2, 4]);
      circle(cx, cy, CONFIG.ADJ_RANGE * T); ctx.stroke(); ctx.setLineDash([]);
    }
    if (selType && hoverTile) {
      const d = CONFIG.TOWERS[selType];
      const ok = canPlace(hoverTile.x, hoverTile.y);
      const cx = (hoverTile.x + 0.5) * T, cy = (hoverTile.y + 0.5) * T;
      ctx.fillStyle = ok ? 'rgba(129,199,132,.35)' : 'rgba(229,115,115,.4)';
      ctx.fillRect(hoverTile.x * T, hoverTile.y * T, T, T);
      if (ok) {
        const range = d.attack === 'none' ? (d.towerAura || d.enemyAura).range : d.range;
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
        circle(cx, cy, range * T); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,183,77,.4)'; ctx.setLineDash([2, 4]);
        circle(cx, cy, CONFIG.ADJ_RANGE * T); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.6;
        const mc = me() ? me().color : '#ffffff';
        drawStatue(ctx, selType, 1, mc, hoverTile.x, hoverTile.y, T);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawEnemies(dt) {
    const k = Math.min(1, dt * 14);
    for (const e of enemyView.values()) {
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
      const def = CONFIG.ENEMIES[e.t];
      const cx = e.x * T, cy = e.y * T, r = def.radius * T;
      if (def.flying) {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.9, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      }
      const lift = def.flying ? -r * 0.5 : 0;
      ctx.fillStyle = e.f & 8 ? '#e1f5fe' : def.color;
      circle(cx, cy + lift, r); ctx.fill();
      ctx.lineWidth = 2;
      if (e.f & 16) { ctx.strokeStyle = '#ffffff'; circle(cx, cy + lift, r + 4); ctx.stroke(); }
      if (e.f & 2) { ctx.strokeStyle = '#ff7043'; circle(cx, cy + lift, r + 1); ctx.stroke(); }
      if (e.f & 1) { ctx.fillStyle = 'rgba(79,195,247,.35)'; circle(cx, cy + lift, r); ctx.fill(); }
      if (e.f & 4) { ctx.strokeStyle = '#ffee58'; ctx.setLineDash([3, 3]); circle(cx, cy + lift, r + 3); ctx.stroke(); ctx.setLineDash([]); }
      if (e.f & 32) { ctx.strokeStyle = '#fdd835'; circle(cx, cy + lift, r + 6); ctx.stroke(); }
      if (e.b) {
        ctx.font = `${r}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('👑', cx, cy + lift - r - 8);
      }
      const w = Math.max(18, r * 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - w / 2, cy + lift - r - 6, w, 4);
      ctx.fillStyle = e.h > 0.5 ? '#66bb6a' : e.h > 0.25 ? '#ffca28' : '#ef5350';
      ctx.fillRect(cx - w / 2, cy + lift - r - 6, w * Math.max(0, e.h), 4);
    }
  }

  function drawFx(now) {
    fxList = fxList.filter((f) => now - f.born < (f.k === 'txt' || f.k === 'gold' ? 800 : 300));
    for (const f of fxList) {
      const age = (now - f.born) / 300;
      ctx.globalAlpha = Math.max(0, 1 - age);
      if (f.k === 'line') {
        ctx.strokeStyle = f.c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x1 * T, f.y1 * T); ctx.lineTo(f.x2 * T, f.y2 * T); ctx.stroke();
      } else if (f.k === 'chain') {
        ctx.strokeStyle = f.c; ctx.lineWidth = 2.5;
        ctx.beginPath();
        f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * T, y * T) : ctx.moveTo(x * T, y * T)));
        ctx.stroke();
      } else if (f.k === 'boom') {
        ctx.fillStyle = f.c + '55'; ctx.strokeStyle = f.c; ctx.lineWidth = 2;
        circle(f.x * T, f.y * T, f.r * T * (0.6 + age * 0.4)); ctx.fill(); ctx.stroke();
      } else if (f.k === 'txt' || f.k === 'gold') {
        const a = (now - f.born) / 800;
        ctx.globalAlpha = Math.max(0, 1 - a);
        ctx.fillStyle = f.k === 'gold' ? '#ffd740' : f.c;
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(f.k === 'gold' ? '+' + f.v : f.v, f.x * T, f.y * T - 14 - a * 20);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPings(now) {
    pings = pings.filter((p) => now - p.born < 2500);
    for (const p of pings) {
      const a = (now - p.born) / 2500;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - a;
      for (let i = 0; i < 2; i++) {
        circle(p.x * T, p.y * T, (((a * 3 + i * 0.5) % 1) * 1.2 + 0.2) * T); ctx.stroke();
      }
      ctx.fillStyle = p.color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('📍 ' + p.name, p.x * T, p.y * T - T * 0.9);
      ctx.globalAlpha = 1;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if ($('screen-game').classList.contains('active')) {
      ctx.drawImage(bg, 0, 0);
      drawRanges();
      drawTowers(now);
      drawEnemies(dt);
      drawFx(now);
      drawPings(now);
      if (st && st.ph === 'prep') {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(canvas.width / 2 - 130, 8, 260, 30);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${st.w + 1}웨이브까지 ${st.tm}초 · R로 준비`, canvas.width / 2, 23);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
