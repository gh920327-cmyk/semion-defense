// ============================================================
// 타워 석상 그래픽
// 모든 타워를 "받침대 위의 캐릭터 석상"으로 그립니다.
// - 직업마다 몸 실루엣이 다르고 (전사 투구 / 마법사 모자 / 궁수 후드 / 사제 후광)
// - 타워마다 들고 있는 소품이 다릅니다 (검, 도끼, 방패, 지팡이, 활 ...)
// - 받침대 띠 = 주인 색, 레벨이 오르면 받침대가 금장으로 바뀜
// - 궁극기 타워는 황금 석상
// 한 번 그린 석상은 캐시해 두고 재사용합니다.
// ============================================================
(function () {
  const W = 40, H = 52;        // 논리 크기 (타일 40 + 위로 12 솟아오름)
  const TOP = 12;              // 타일 위로 솟는 높이
  const SCALE = 2;             // 선명하게 2배로 그려둠
  const cache = new Map();
  const OUT = 'rgba(18,20,28,.85)';

  const ELEMENT = { fire: '#ff7043', frost: '#4fc3f7', lightning: '#ffee58', holy: '#fff59d', curse: '#b388ff', nature: '#a5d6a7' };

  function material(c, kind) {
    const g = c.createLinearGradient(8, 0, 32, 0);
    if (kind === 'gold') { g.addColorStop(0, '#fff6c2'); g.addColorStop(0.45, '#e2b640'); g.addColorStop(1, '#86600f'); }
    else if (kind === 'dark') { g.addColorStop(0, '#c9bfd9'); g.addColorStop(0.5, '#857a99'); g.addColorStop(1, '#4a4258'); }
    else { g.addColorStop(0, '#eef0f3'); g.addColorStop(0.5, '#a9aeb7'); g.addColorStop(1, '#5d626b'); }
    return g;
  }

  // ---------- 기본 도형 ----------
  function poly(c, pts, fill, stroke = OUT, lw = 1) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function circ(c, x, y, r, fill, stroke = OUT, lw = 1) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, color, lw) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  }
  function glow(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  // ---------- 받침대 ----------
  function pedestal(c, ownerColor, level, ult) {
    // 그림자
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(20, 50, 17, 3.2, 0, 0, Math.PI * 2); c.fill();
    const stone = c.createLinearGradient(0, 38, 0, 51);
    stone.addColorStop(0, '#8d929b'); stone.addColorStop(1, '#4e525a');
    const trim = ult || level >= 3 ? '#e2b640' : level >= 2 ? '#c9cdd4' : '#7c8189';
    poly(c, [[6, 48], [34, 48], [35, 51], [5, 51]], '#555a62');            // 바닥
    poly(c, [[9, 41], [31, 41], [31, 48], [9, 48]], stone);                  // 몸통
    c.fillStyle = ownerColor; c.fillRect(9.5, 43.2, 21, 2.8);                // 주인 색 띠
    poly(c, [[7, 38.5], [33, 38.5], [32, 41.2], [8, 41.2]], trim);           // 윗판
    // 레벨 보석
    for (let i = 0; i < level; i++) {
      const x = 20 + (i - (level - 1) / 2) * 5;
      poly(c, [[x, 42.4], [x + 1.6, 44.6], [x, 46.8], [x - 1.6, 44.6]], '#ffd740', OUT, 0.7);
    }
  }

  // ---------- 직업별 몸 ----------
  function bodyWarrior(c, m, crown) {
    poly(c, [[15, 31], [19, 31], [19, 39], [15, 39]], m);                    // 다리
    poly(c, [[21, 31], [25, 31], [25, 39], [21, 39]], m);
    poly(c, [[11.5, 19], [28.5, 19], [25.5, 32], [14.5, 32]], m);            // 갑옷 몸통
    circ(c, 12.5, 20, 3.2, m);                                               // 어깨 보호대
    circ(c, 27.5, 20, 3.2, m);
    circ(c, 20, 14, 4.3, m);                                                 // 머리
    c.beginPath(); c.arc(20, 13.6, 4.6, Math.PI, 0); c.closePath();          // 투구
    c.fillStyle = m; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
    line(c, 16.5, 14.6, 23.5, 14.6, OUT, 1);                                 // 투구 틈
    if (crown) {
      poly(c, [[15.5, 9.5], [17, 5.5], [18.5, 8.5], [20, 4.5], [21.5, 8.5], [23, 5.5], [24.5, 9.5]], '#ffe082');
    } else {
      c.beginPath(); c.moveTo(20, 9); c.quadraticCurveTo(26, 5, 27, 11);     // 깃털 장식
      c.strokeStyle = OUT; c.lineWidth = 2.2; c.stroke();
      c.strokeStyle = m; c.lineWidth = 1.2; c.stroke();
    }
  }

  function bodyMage(c, m) {
    poly(c, [[15.5, 19], [24.5, 19], [29, 40], [11, 40]], m);                // 로브
    line(c, 20, 21, 20, 39, 'rgba(18,20,28,.35)', 0.8);
    circ(c, 20, 14.5, 4.1, m);                                               // 머리
    c.beginPath(); c.moveTo(12.5, 12); c.lineTo(27.5, 12);                   // 챙
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.stroke();
    c.strokeStyle = m; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(15, 11.5); c.lineTo(25, 11.5);                   // 뾰족 모자
    c.quadraticCurveTo(22, 5, 25.5, 1.5); c.quadraticCurveTo(19, 4, 15, 11.5);
    c.closePath(); c.fillStyle = m; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
  }

  function bodyArcher(c, m, cloak) {
    if (cloak) poly(c, [[14, 18], [26, 18], [29, 38], [11, 38]], m);        // 망토 (뒤)
    poly(c, [[16, 31], [19, 31], [18.5, 39], [15.5, 39]], m);                // 다리
    poly(c, [[21, 31], [24, 31], [24.5, 39], [21.5, 39]], m);
    poly(c, [[14.5, 19.5], [25.5, 19.5], [23.5, 32], [16.5, 32]], m);        // 몸통
    line(c, 15.5, 20.5, 24, 31, 'rgba(18,20,28,.45)', 1);                    // 가죽끈
    circ(c, 20, 14.5, 4, m);                                                 // 머리
    c.beginPath(); c.moveTo(14.5, 19.5); c.quadraticCurveTo(14, 8.5, 20, 8.6); // 후드
    c.quadraticCurveTo(26, 8.5, 25.5, 19.5); c.lineTo(23.5, 19.5);
    c.quadraticCurveTo(24, 11.5, 20, 11.2); c.quadraticCurveTo(16, 11.5, 16.5, 19.5); c.closePath();
    c.fillStyle = m; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
  }

  function bodyPriest(c, m, halo = true) {
    poly(c, [[14.5, 19], [25.5, 19], [28, 40], [12, 40]], m);                // 로브
    poly(c, [[18.5, 19.5], [21.5, 19.5], [21.5, 39.5], [18.5, 39.5]], 'rgba(255,255,255,.12)', 'rgba(18,20,28,.35)', 0.7); // 영대
    circ(c, 20, 14.5, 4.1, m);
    if (halo) {
      glow(c, 20, 7.5, 8, 'rgba(255,241,118,.45)');
      c.beginPath(); c.ellipse(20, 7.5, 5.5, 1.8, 0, 0, Math.PI * 2);
      c.strokeStyle = '#ffe57f'; c.lineWidth = 1.6; c.stroke();
    }
  }

  // ---------- 소품 ----------
  function sword(c, m, x, yTop, yHand) {
    poly(c, [[x - 1.3, yHand - 1], [x + 1.3, yHand - 1], [x + 1.3, yTop + 3], [x, yTop], [x - 1.3, yTop + 3]], m);
    line(c, x - 3.5, yHand - 1, x + 3.5, yHand - 1, OUT, 2.4);             // 손잡이 가드
    line(c, x - 3, yHand - 1, x + 3, yHand - 1, m, 1.2);
  }
  function arm(c, m, x1, y1, x2, y2) {
    line(c, x1, y1, x2, y2, OUT, 4.2);
    line(c, x1, y1, x2, y2, m, 2.6);
    circ(c, x2, y2, 1.8, m, OUT, 0.8);
  }
  function staff(c, m, x, yTop, orbColor, shape = 'orb') {
    line(c, x, 40, x, yTop + 3, OUT, 2.6);
    line(c, x, 40, x, yTop + 3, '#8d6e63', 1.4);
    glow(c, x, yTop, 7, orbColor + 'aa');
    if (shape === 'crystal') poly(c, [[x, yTop - 4], [x + 2.6, yTop], [x, yTop + 4], [x - 2.6, yTop]], orbColor);
    else circ(c, x, yTop, 2.8, orbColor);
    if (shape === 'bolt') {
      poly(c, [[x + 0.8, yTop - 2.5], [x - 1.5, yTop + 0.4], [x + 0.2, yTop + 0.4], [x - 0.9, yTop + 3]], null, '#6d5b00', 0.9);
    }
  }
  function bow(c, m, x, yTop, yBot, pull = 5) {
    const mid = (yTop + yBot) / 2;
    c.beginPath(); c.moveTo(x, yTop); c.quadraticCurveTo(x - 8, mid, x, yBot);
    c.strokeStyle = OUT; c.lineWidth = 2.8; c.stroke();
    c.strokeStyle = m; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.moveTo(x, yTop); c.lineTo(x + pull, mid); c.lineTo(x, yBot);    // 시위
    c.strokeStyle = 'rgba(240,240,240,.8)'; c.lineWidth = 0.6; c.stroke();
    line(c, x - 7, mid, x + pull + 1, mid, OUT, 1.6);                                 // 화살
    line(c, x - 7, mid, x + pull + 1, mid, m, 0.7);
    poly(c, [[x - 9.5, mid], [x - 6.5, mid - 1.6], [x - 6.5, mid + 1.6]], m, OUT, 0.6);
  }
  function wings(c, m) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(20 + s * 4, 21);
      c.quadraticCurveTo(20 + s * 19, 6, 20 + s * 18, 30);
      c.quadraticCurveTo(20 + s * 14, 26, 20 + s * 13, 32);
      c.quadraticCurveTo(20 + s * 10, 27, 20 + s * 5, 29);
      c.closePath();
      c.fillStyle = m; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      line(c, 20 + s * 8, 22, 20 + s * 15, 14, 'rgba(18,20,28,.35)', 0.7);
      line(c, 20 + s * 8, 25, 20 + s * 15, 22, 'rgba(18,20,28,.35)', 0.7);
    }
  }
  function cape(c, m) {
    poly(c, [[13, 19], [27, 19], [31, 39], [9, 39]], m);
  }

  // ---------- 타워별 석상 ----------
  const STATUES = {
    // 전사
    w_sword(c) {
      const m = material(c);
      bodyWarrior(c, m);
      arm(c, m, 26, 21, 29, 15);
      sword(c, m, 29, 0, 15);
      arm(c, m, 14, 21, 13, 29);
    },
    w_axe(c) {
      const m = material(c);
      line(c, 9, 35, 29, 5, OUT, 3);                                         // 도끼 자루
      line(c, 9, 35, 29, 5, '#8d6e63', 1.6);
      bodyWarrior(c, m);
      c.beginPath(); c.moveTo(26, 3); c.quadraticCurveTo(35, 5, 33, 14);    // 도끼날
      c.lineTo(28.5, 9); c.closePath();
      c.fillStyle = m; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      arm(c, m, 14, 21, 17, 27);
      arm(c, m, 26, 21, 23, 20);
    },
    w_shield(c) {
      const m = material(c);
      bodyWarrior(c, m);
      arm(c, m, 26, 21, 29, 25);
      sword(c, m, 29.5, 20, 30);
      circ(c, 15.5, 27, 7.5, m);                                              // 큰 방패
      circ(c, 15.5, 27, 5, null, 'rgba(18,20,28,.5)', 0.8);
      circ(c, 15.5, 27, 1.6, '#cfd8dc', OUT, 0.8);
    },
    w_ult(c) {
      const m = material(c, 'gold');
      cape(c, '#b71c1c');
      bodyWarrior(c, m, true);
      arm(c, m, 26, 21, 30, 13);
      sword(c, m, 30, -3, 13);
      glow(c, 30, 2, 6, 'rgba(255,236,179,.6)');
      circ(c, 14.5, 27, 7, m);
      poly(c, [[14.5, 22.5], [16, 26], [14.5, 31.5], [13, 26]], '#b71c1c', OUT, 0.6);
    },

    // 마법사
    m_fire(c) {
      const m = material(c);
      bodyMage(c, m);
      staff(c, m, 29, 9, ELEMENT.fire);
      arm(c, m, 24.5, 21, 28.5, 24);
      glow(c, 12, 27, 5, 'rgba(255,112,67,.7)');                             // 손에 불꽃
      arm(c, m, 16, 21, 12.5, 27);
    },
    m_frost(c) {
      const m = material(c);
      bodyMage(c, m);
      staff(c, m, 29, 9, ELEMENT.frost, 'crystal');
      arm(c, m, 24.5, 21, 28.5, 24);
      arm(c, m, 16, 21, 13, 27);
      poly(c, [[12, 22], [13.4, 24.5], [12, 27], [10.6, 24.5]], ELEMENT.frost, OUT, 0.6);
    },
    m_storm(c) {
      const m = material(c);
      bodyMage(c, m);
      staff(c, m, 29, 8, ELEMENT.lightning, 'bolt');
      arm(c, m, 24.5, 21, 28.5, 22);
      arm(c, m, 16, 21, 12, 17);                                              // 팔을 치켜듦
      c.beginPath(); c.moveTo(11, 15); c.lineTo(8, 10); c.lineTo(10.5, 10); c.lineTo(7.5, 4);
      c.strokeStyle = ELEMENT.lightning; c.lineWidth = 1.2; c.stroke();
    },
    m_ult(c) {
      const m = material(c, 'gold');
      cape(c, '#4527a0');
      bodyMage(c, m);
      staff(c, m, 30, 6, '#ffffff');
      arm(c, m, 24.5, 21, 29.5, 21);
      arm(c, m, 16, 21, 12, 16);
      [[8, 12, ELEMENT.fire], [12, 5, ELEMENT.frost], [5, 20, ELEMENT.lightning]].forEach(([x, y, col]) => {
        glow(c, x, y, 5, col + 'aa'); circ(c, x, y, 2, col);
      });
    },

    // 궁수
    a_bow(c) {
      const m = material(c);
      bodyArcher(c, m);
      bow(c, m, 11, 11, 33);
      arm(c, m, 16, 21, 11.5, 22);
      arm(c, m, 24, 21, 17, 22);
    },
    a_sniper(c) {
      const m = material(c);
      bodyArcher(c, m, true);
      bow(c, m, 9.5, 3, 40, 7);                                               // 거대한 장궁
      arm(c, m, 16, 21, 10, 21.5);
      arm(c, m, 24, 21, 16.5, 21.5);
      glow(c, 1, 21.5, 3.5, 'rgba(255,82,82,.9)');                            // 조준 빛
    },
    a_multi(c) {
      const m = material(c);
      [[23, 8], [26, 7], [29, 9]].forEach(([x, y]) => {                       // 화살통의 화살들
        line(c, 24, 26, x, y, OUT, 1.6); line(c, 24, 26, x, y, m, 0.7);
        poly(c, [[x, y - 1], [x + 1.2, y + 1.4], [x - 1.2, y + 1.4]], '#ef9a9a', OUT, 0.5);
      });
      poly(c, [[22, 16], [27, 18], [25, 29], [21, 27]], '#8d6e63');           // 화살통
      bodyArcher(c, m);
      bow(c, m, 11, 12, 33);
      arm(c, m, 16, 21, 11.5, 22.5);
      arm(c, m, 24, 21, 17, 22.5);
    },
    a_ult(c) {
      const m = material(c, 'gold');
      for (const s of [-1, 1]) {                                              // 바람의 날개
        c.beginPath(); c.arc(20 + s * 9, 20, 8, s > 0 ? -1.2 : Math.PI - 1.9, s > 0 ? 1.9 : Math.PI + 1.2);
        c.strokeStyle = 'rgba(165,214,167,.9)'; c.lineWidth = 1.6; c.stroke();
        c.beginPath(); c.arc(20 + s * 11, 22, 5, s > 0 ? -1.2 : Math.PI - 1.9, s > 0 ? 1.9 : Math.PI + 1.2);
        c.stroke();
      }
      bodyArcher(c, m, true);
      bow(c, m, 10, 6, 38, 6);
      arm(c, m, 16, 21, 10.5, 22);
      arm(c, m, 24, 21, 16.5, 22);
      glow(c, 2, 22, 5, 'rgba(255,255,255,.8)');
    },

    // 사제
    p_holy(c) {
      const m = material(c);
      bodyPriest(c, m);
      arm(c, m, 15.5, 21, 18, 27);
      arm(c, m, 24.5, 21, 22, 27);
      glow(c, 20, 27, 8, 'rgba(255,245,157,.8)');
      poly(c, [[15.5, 25], [24.5, 25], [24.5, 29.5], [15.5, 29.5]], '#8d6e63');   // 성서
      line(c, 20, 25, 20, 29.5, '#ffe57f', 0.8);
    },
    p_bless(c) {
      const m = material(c);
      bodyPriest(c, m);
      arm(c, m, 15.5, 21, 10.5, 12);                                          // 두 팔을 들어 축복
      arm(c, m, 24.5, 21, 29.5, 12);
      glow(c, 10.5, 12, 5, 'rgba(165,214,167,.9)');
      glow(c, 29.5, 12, 5, 'rgba(165,214,167,.9)');
    },
    p_curse(c) {
      const m = material(c, 'dark');
      poly(c, [[14.5, 19], [25.5, 19], [28, 40], [12, 40]], m);               // 어두운 로브
      circ(c, 20, 14.5, 4.1, '#2b2633');
      c.beginPath(); c.moveTo(14, 20); c.quadraticCurveTo(13.5, 8, 20, 8);   // 깊은 후드
      c.quadraticCurveTo(26.5, 8, 26, 20); c.lineTo(23.5, 19.5);
      c.quadraticCurveTo(24, 12, 20, 12); c.quadraticCurveTo(16, 12, 16.5, 19.5); c.closePath();
      c.fillStyle = m; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      circ(c, 18.6, 15, 0.8, '#e040fb', null); circ(c, 21.4, 15, 0.8, '#e040fb', null); // 빛나는 눈
      line(c, 29, 40, 29, 10, OUT, 2.6); line(c, 29, 40, 29, 10, '#5d4037', 1.4);  // 해골 지팡이
      glow(c, 29, 8, 7, 'rgba(179,136,255,.8)');
      circ(c, 29, 8, 3, '#e0e0e0');
      circ(c, 28, 7.6, 0.7, '#222', null); circ(c, 30, 7.6, 0.7, '#222', null);
      arm(c, m, 24.5, 21, 28.5, 23);
      arm(c, m, 15.5, 21, 13, 28);
    },
    p_ult(c) {
      const m = material(c, 'gold');
      wings(c, '#fafafa');
      bodyPriest(c, m);
      arm(c, m, 15.5, 21, 12, 14);
      arm(c, m, 24.5, 21, 28, 14);
      glow(c, 20, 10, 12, 'rgba(255,249,196,.55)');
    },
  };

  function render(type, level, ownerColor) {
    const cv = document.createElement('canvas');
    cv.width = W * SCALE; cv.height = H * SCALE;
    const c = cv.getContext('2d');
    c.scale(SCALE, SCALE);
    c.lineJoin = 'round';
    const def = CONFIG.TOWERS[type];
    pedestal(c, ownerColor, level, def.ult);
    c.save();
    // 레벨이 오를수록 석상이 조금씩 커짐
    const s = 1 + (level - 1) * 0.05;
    c.translate(20, 39); c.scale(s, s); c.translate(-20, -39);
    (STATUES[type] || STATUES.w_sword)(c);
    c.restore();
    return cv;
  }

  // 외부에서 쓰는 함수: 타일 (tx, ty) 위치에 석상 그리기
  window.drawStatue = function (ctx, type, level, ownerColor, tx, ty, T) {
    const key = type + '|' + level + '|' + ownerColor;
    let img = cache.get(key);
    if (!img) { img = render(type, level, ownerColor); cache.set(key, img); }
    const k = T / 40;
    ctx.drawImage(img, tx * T, ty * T - TOP * k, W * k, H * k);
  };
  // 타워 선택 바 등에 쓸 작은 초상화 (dataURL)
  window.statueIcon = function (type, ownerColor) {
    const key = 'icon|' + type + '|' + ownerColor;
    if (!cache.has(key)) cache.set(key, render(type, 1, ownerColor).toDataURL());
    return cache.get(key);
  };
})();
