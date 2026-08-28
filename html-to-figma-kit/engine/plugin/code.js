// BizPlanet UID 보드 생성기 — 하이브리드
//  · 디자인 영역 : PNG 이미지 레이어 (화면 스크린샷은 재구성 실익이 낮다)
//  · 헤더 2행 / 콜아웃 / 디스크립션 표 / General 표 : 네이티브 노드 (검색·수정·코멘트 가능)
// 입력은 build_figma_bundle.mjs가 만든 번들 JSON + output/screens 의 PNG.

figma.showUI(__html__, { width: 420, height: 560 });

const FONT = { family: 'Pretendard', regular: 'Regular', medium: 'Medium', bold: 'Bold' };
let F = null; // 실제 사용할 폰트 (Pretendard 없으면 Inter로 폴백)

async function resolveFonts() {
  const tryLoad = async (family, styles) => {
    for (const s of styles) await figma.loadFontAsync({ family, style: s });
    return family;
  };
  try {
    await tryLoad(FONT.family, [FONT.regular, FONT.medium, FONT.bold]);
    return { family: FONT.family, r: FONT.regular, m: FONT.medium, b: FONT.bold, fallback: false };
  } catch (e) {
    // 폴백은 반드시 한글 글리프를 가진 폰트여야 한다(Inter는 한글이 없어 재대체가 일어난다)
    for (const fb of [
      { family: 'Noto Sans KR', r: 'Regular', m: 'Medium', b: 'Bold' },
      { family: 'Apple SD Gothic Neo', r: 'Regular', m: 'Medium', b: 'Bold' },
    ]) {
      try {
        await tryLoad(fb.family, [fb.r, fb.m, fb.b]);
        return Object.assign({}, fb, { fallback: true });
      } catch (e2) { /* 다음 후보 */ }
    }
    throw new Error('Pretendard·Noto Sans KR·Apple SD Gothic Neo 중 하나가 필요합니다. Pretendard 설치를 권장합니다.');
  }
}

const hex = (h) => {
  const s = h.replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return { r: parseInt(n.slice(0, 2), 16) / 255, g: parseInt(n.slice(2, 4), 16) / 255, b: parseInt(n.slice(4, 6), 16) / 255 };
};
const solid = (h) => [{ type: 'SOLID', color: hex(h) }];

function frame(name, x, y, w, h, fill) {
  const f = figma.createFrame();
  f.name = name;
  f.x = x; f.y = y;
  f.resize(Math.max(1, w), Math.max(1, h));
  f.fills = fill ? solid(fill) : [];
  f.clipsContent = false;
  return f;
}

function text(str, opts) {
  const t = figma.createText();
  t.fontName = { family: F.family, style: opts.weight >= 700 ? F.b : (opts.weight >= 500 ? F.m : F.r) };
  t.characters = str == null ? '' : String(str);
  t.fontSize = opts.size || 14;
  t.fills = solid(opts.color || '#000000');
  t.lineHeight = { value: (opts.lineHeight || 1.45) * (opts.size || 14), unit: 'PIXELS' };
  // textAutoResize를 먼저 정해야 resize가 먹는다.
  // 기본값 WIDTH_AND_HEIGHT 상태에서 resize하면 폭 지정이 무시되어 한 줄로 뻗고 서로 겹친다.
  if (opts.width && opts.height) { t.textAutoResize = 'NONE'; t.resize(opts.width, opts.height); }
  else if (opts.width) { t.textAutoResize = 'HEIGHT'; t.resize(opts.width, t.height); }
  else t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (opts.align) t.textAlignHorizontal = opts.align;
  if (opts.valign) t.textAlignVertical = opts.valign;
  if (opts.name) t.name = opts.name;
  return t;
}

// Auto Layout 프레임의 폭만 바꾼다.
// resize()는 지정한 축의 sizingMode를 FIXED로 바꿔버리므로, 호출 후 원래 모드를 되돌린다.
// 되돌리지 않으면 세로 컨테이너 높이가 1px에 고정되어 자식이 전부 겹쳐 보인다.
function setWidth(f, w) {
  const primary = f.primaryAxisSizingMode;
  const counter = f.counterAxisSizingMode;
  f.resize(w, Math.max(1, f.height));
  f.primaryAxisSizingMode = primary;
  f.counterAxisSizingMode = counter;
}

// 세로 Auto Layout 컨테이너
function vstack(name, w, opts) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = 'VERTICAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'FIXED';
  setWidth(f, w);
  f.itemSpacing = (opts && opts.gap) || 0;
  f.fills = opts && opts.fill ? solid(opts.fill) : [];
  if (opts && opts.padding) {
    const p = opts.padding;
    f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];
  }
  f.clipsContent = false;
  return f;
}
function hstack(name, opts) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = 'HORIZONTAL';
  f.primaryAxisSizingMode = 'FIXED';
  f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = (opts && opts.gap) || 0;
  f.counterAxisAlignItems = (opts && opts.align) || 'MIN';
  f.fills = opts && opts.fill ? solid(opts.fill) : [];
  f.clipsContent = false;
  return f;
}

// ── 디자인 영역 네이티브 렌더 ──────────────────────────────
// build_figma_bundle이 만든 렌더 트리를 그대로 노드로 만든다. 플러그인은 계산하지 않는다.
// 좌표는 부모 기준 상대값, 색은 이미 hex로 풀려 있다.
const ALIGN = { center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED' };

function renderNode(spec) {
  const f = figma.createFrame();
  f.name = spec.n || 'node';
  f.resize(Math.max(1, spec.w), Math.max(1, spec.h));
  f.fills = spec.bg ? [{ type: 'SOLID', color: hex(spec.bg), opacity: spec.bgA == null ? 1 : spec.bgA }] : [];
  if (spec.sc) {
    // 네 변이 모두 같으면 프레임 stroke로 그린다.
    // 한 변만 있는 경우(표 셀 구분선 등)는 자식 사각형으로 직접 그린다 —
    // strokeTopWeight 같은 변별 두께 속성에 기대면 Figma가 사각형 전체를 그려
    // 표에 없어야 할 세로선이 생긴다.
    const w = spec.bw || [spec.sw || 1, spec.sw || 1, spec.sw || 1, spec.sw || 1];
    const uniform = w[0] === w[1] && w[1] === w[2] && w[2] === w[3] && w[0] > 0;
    if (uniform && !spec.bs) {
      f.strokes = solid(spec.sc);
      f.strokeAlign = 'INSIDE';
      f.strokeWeight = w[0];
    } else {
      // 점선은 사각형으로 흉내 낼 수 없으므로 채움 비율만큼 투명도를 낮춘다.
      // 실측 기준 dotted는 약 0.44, dashed는 약 0.6이 칠해진다.
      const op = spec.bs === 'dotted' ? 0.44 : spec.bs === 'dashed' ? 0.6 : 1;
      const edge = (name, x, y, ew, eh) => {
        if (ew <= 0 || eh <= 0) return;
        const r = figma.createRectangle();
        r.name = name;
        r.resize(Math.max(0.5, ew), Math.max(0.5, eh));
        r.fills = [{ type: 'SOLID', color: hex(spec.sc), opacity: op }];
        r.strokes = [];
        f.appendChild(r);
        r.x = x; r.y = y;
      };
      edge('테두리 상', 0, 0, spec.w, w[0]);
      edge('테두리 우', spec.w - w[1], 0, w[1], spec.h);
      edge('테두리 하', 0, spec.h - w[2], spec.w, w[2]);
      edge('테두리 좌', 0, 0, w[3], spec.h);
    }
  }
  if (spec.r) f.cornerRadius = spec.r;
  if (spec.o != null) f.opacity = spec.o;
  // 표 셀·카드가 서로의 내용을 덮지 않도록 자기 영역에서 자른다.
  // 다만 글만 든 상자는 자르지 않는다 — Pretendard 실측이 브라우저보다 1px만 넓어도
  // 문장 끝이 잘려 나간다("… 모니터링으로 이"). 몇 px 넘치는 편이 글자 유실보다 낫다.
  f.clipsContent = !!(spec.c && spec.c.length);

  // 파일 선택도 네이티브 위젯이라 계산 스타일이 비어 있다. 버튼 + 안내 문구를 직접 그린다
  if (spec.ctl && spec.ctl.t === 'file') {
    const BW = 92, BH = Math.min(22, spec.h - 2), PAD = 2;
    const btn = figma.createFrame();
    btn.name = '파일 선택 버튼';
    btn.resize(BW, Math.max(1, BH));
    btn.fills = solid('#EFEFEF');
    btn.strokes = solid('#B0B6C3');
    btn.strokeWeight = 1;
    btn.strokeAlign = 'INSIDE';
    btn.cornerRadius = 3;
    f.appendChild(btn);
    btn.x = PAD; btn.y = (spec.h - BH) / 2;
    const bt = text(spec.ctl.b || 'Choose File', { size: 11.5, weight: 400, color: '#1A1A2E', name: 'text' });
    btn.appendChild(bt);
    bt.x = (BW - bt.width) / 2; bt.y = (BH - bt.height) / 2;
    const et = text(spec.ctl.e || 'No file chosen', { size: 11.5, weight: 400, color: '#1A1A2E', name: 'text' });
    f.appendChild(et);
    et.x = PAD + BW + 8; et.y = (spec.h - et.height) / 2;
    return f;
  }
  // 체크박스·라디오는 브라우저 네이티브 위젯이라 스타일이 없다. 직접 그린다
  if (spec.ctl && (spec.ctl.t === 'checkbox' || spec.ctl.t === 'radio')) {
    const round = spec.ctl.t === 'radio';
    f.cornerRadius = round ? Math.min(spec.w, spec.h) / 2 : 3;
    f.strokes = solid(spec.ctl.c ? '#3B5BDB' : '#B0B6C3');
    f.strokeWeight = 1;
    f.strokeAlign = 'INSIDE';
    f.fills = spec.ctl.c ? solid('#3B5BDB') : solid('#FFFFFF');
    if (spec.ctl.c) {
      const mark = text(round ? '●' : '✓', {
        size: Math.max(7, spec.h * (round ? 0.5 : 0.72)), weight: 700, color: '#FFFFFF', name: 'mark',
      });
      f.appendChild(mark);
      mark.x = (spec.w - mark.width) / 2;
      mark.y = (spec.h - mark.height) / 2;
    }
    return f;
  }

  if (spec.t) {
    // 패딩·테두리 안쪽이 콘텐츠 상자다. 표 셀 정렬이 여기에 달려 있다.
    // 테두리를 빼지 않으면 세로 중앙이 아래로 밀린다 (셀 아래 1px 선만큼).
    const p = spec.p || [0, 0, 0, 0];
    const bd = spec.sc ? (spec.bw || [spec.sw || 1, spec.sw || 1, spec.sw || 1, spec.sw || 1]) : [0, 0, 0, 0];
    const tw = Math.max(1, spec.w - p[1] - p[3] - bd[1] - bd[3]);
    const th = Math.max(1, spec.h - p[0] - p[2] - bd[0] - bd[2]);
    const boxed = spec.bg || spec.sc || p[0] || p[2];
    const lineRatio = spec.lh ? spec.lh / (spec.fs || 14) : 1.45;

    let t;
    if (spec.tx != null) {
      // 실측한 글자 자리에 그대로 놓는다. 버튼·페이지네이션은 flex로 가운데 정렬하므로
      // text-align만 보면 왼쪽 위로 붙어 버린다.
      t = spec.nw
        ? text(spec.t, { size: spec.fs, weight: spec.fw, color: spec.tc, lineHeight: lineRatio, name: 'text' })
        : text(spec.t, {
          size: spec.fs, weight: spec.fw, color: spec.tc, lineHeight: lineRatio,
          width: Math.max(1, spec.tw), height: Math.max(1, spec.th), align: ALIGN[spec.ta], name: 'text',
        });
      f.appendChild(t);
      t.x = spec.tx; t.y = spec.ty;
    } else if (spec.nw) {
      // 원본에서 한 줄인 글 : 폭을 고정하면 0.x px 차이로 줄이 넘어가 라벨이 세로로 쪼개진다.
      // 자동 폭으로 만들어 줄바꿈 자체를 막고, 위치는 직접 계산한다.
      t = text(spec.t, {
        size: spec.fs, weight: spec.fw, color: spec.tc,
        lineHeight: lineRatio, name: 'text',
      });
      f.appendChild(t);
      t.x = spec.ta === 'center' ? (spec.w - t.width) / 2
        : spec.ta === 'right' ? spec.w - p[1] - t.width
          : p[3];
      t.y = boxed ? (spec.h - t.height) / 2 : p[0];
    } else {
      t = text(spec.t, {
        size: spec.fs, weight: spec.fw, color: spec.tc,
        width: tw, height: th,
        lineHeight: lineRatio,
        align: ALIGN[spec.ta],
        // 박스(배경·테두리·패딩 보유)의 글은 세로 중앙, 순수 텍스트는 위 맞춤
        valign: boxed ? 'CENTER' : 'TOP',
        name: 'text',
      });
      f.appendChild(t);
      t.x = p[3] + bd[3]; t.y = p[0] + bd[0];
    }
    // 문장 안의 볼드·강조 구간 — 텍스트를 쪼개지 않고 구간에만 스타일을 입힌다
    for (const r of spec.rn || []) {
      const s = Math.max(0, Math.min(r.s, t.characters.length));
      const e = Math.max(s, Math.min(r.e, t.characters.length));
      if (e <= s) continue;
      if (r.fw) t.setRangeFontName(s, e, { family: F.family, style: r.fw >= 700 ? F.b : (r.fw >= 500 ? F.m : F.r) });
      if (r.tc) t.setRangeFills(s, e, solid(r.tc));
    }
  }
  // select의 드롭다운 화살표 — 원본은 CSS background-image(SVG data URI)라 그냥 두면 사라진다.
  // 원본과 같은 10x6 삼각형을 오른쪽 9px, 세로 중앙에 둔다 (색은 그 data URI에서 뽑은 값)
  if (spec.ctl && spec.ctl.t === 'select') {
    const AW = 10, AH = 6, RIGHT = 9;
    const v = figma.createVector();
    v.name = '드롭다운 화살표';
    v.vectorPaths = [{ windingRule: 'NONZERO', data: `M 0 0 L ${AW / 2} ${AH} L ${AW} 0 Z` }];
    v.fills = solid(spec.ctl.ar || spec.tc || '#9AA0B4');
    v.strokes = [];
    f.appendChild(v);
    v.resize(AW, AH);
    v.x = spec.w - RIGHT - AW;
    v.y = (spec.h - AH) / 2;
  }
  for (const c of spec.c || []) {
    const child = renderNode(c);
    f.appendChild(child);
    child.x = c.x; child.y = c.y;   // 부모에 붙인 뒤 좌표를 준다
  }
  return f;
}

// ── 헤더 2행 ──────────────────────────────────────────────
function buildHeader(board, C, L) {
  const H = frame('Header', 0, 0, L.designWidth, board.headerHeight, '#FFFFFF');
  const row1H = 34, row2H = board.headerHeight - 34;

  const mkLabel = (label, y, h, bg) => {
    const cell = frame(`${label} 라벨`, 0, y, 94, h, bg);
    const t = text(label, { size: 14, weight: 700, width: 94, height: h, align: 'CENTER', valign: 'CENTER' });
    t.x = 0; t.y = 0;
    cell.appendChild(t);
    return cell;
  };
  H.appendChild(mkLabel('Chapter', 0, row1H, C['header.chapter']));
  H.appendChild(mkLabel('Screen Path', row1H, row2H, C['header.path']));

  const ch = text(board.chapter, { size: 14, weight: 700, name: 'Chapter' });
  ch.x = 106; ch.y = row1H / 2 - ch.height / 2;
  H.appendChild(ch);

  const chip = frame('Application 칩', L.designWidth - 27 - 125, (row1H - 20) / 2, 125, 20, C['header.app']);
  chip.cornerRadius = 2;
  const chipT = text(board.application, { size: 14, weight: 700, color: '#FFFFFF', width: 125, height: 20, align: 'CENTER', valign: 'CENTER' });
  chip.appendChild(chipT);
  H.appendChild(chip);

  const cases = vstack('Screen Path', 700, { gap: 4 });
  cases.x = 106; cases.y = row1H + 8;
  for (const c of board.cases) cases.appendChild(text(c, { size: 14, weight: 700, width: 700 }));
  H.appendChild(cases);

  const sidLabel = text('Screen ID', { size: 14, weight: 700 });
  sidLabel.x = 1061; sidLabel.y = row1H + row2H / 2 - sidLabel.height / 2;
  H.appendChild(sidLabel);
  const sid = text(board.screenId, { size: 14, weight: 700, name: 'Screen ID 값' });
  sid.x = 1150; sid.y = sidLabel.y;
  H.appendChild(sid);

  // 행 구분선
  for (const y of [row1H, board.headerHeight]) {
    const ln = figma.createLine();
    ln.name = '구분선'; ln.x = 0; ln.y = y; ln.resize(L.designWidth, 0);
    ln.strokes = solid('#000000'); ln.strokeWeight = 1;
    H.appendChild(ln);
  }
  return H;
}

// ── 콜아웃 (영역 브래킷 + 원형 칩 / 요소 알약) ──────────────
function buildCallouts(board, C) {
  const G = frame('콜아웃', 0, 0, 1, 1);
  G.name = '콜아웃';
  for (const c of board.callouts) {
    if (c.kind === 'region') {
      const br = frame(`브래킷 ${c.no}`, c.x, c.y, 20, Math.max(4, c.height), null);
      br.strokes = solid(C['callout.region']);
      br.strokeWeight = 2;
      br.strokeRightWeight = 0;
      G.appendChild(br);
      const chip = figma.createEllipse();
      chip.name = `칩 ${c.no}`;
      chip.x = c.x - 13; chip.y = c.y + 12; chip.resize(26, 26);
      chip.fills = solid(C['callout.region']);
      G.appendChild(chip);
      const t = text(c.no, { size: 14, weight: 700, color: '#FFFFFF', width: 26, height: 26, align: 'CENTER', valign: 'CENTER' });
      t.x = c.x - 13; t.y = c.y + 12;
      G.appendChild(t);
    } else {
      const pill = frame(`알약 ${c.no}`, c.x, c.y, 49, 26, C['callout.item']);
      pill.cornerRadius = 13;
      const t = text(c.no, { size: 14, weight: 700, color: '#FFFFFF', width: 49, height: 26, align: 'CENTER', valign: 'CENTER' });
      pill.appendChild(t);
      G.appendChild(pill);
    }
  }
  return G;
}

// ── 디스크립션 패널 ────────────────────────────────────────
const FLAG_COLOR = (C) => ({ confirm: C['flag.confirm'], reference: C['flag.reference'], common: C['flag.common'] });

function cellRow(numContent, bodyNode, C, opts) {
  // 셀 높이를 서로 맞추는 것은 자식의 layoutAlign='STRETCH'로 한다
  // (counterAxisAlignItems는 MIN·CENTER·MAX·BASELINE만 받으며 STRETCH는 예외를 던진다)
  const row = hstack((opts && opts.name) || '행', {});
  setWidth(row, 420);
  row.strokes = solid(C['table.line']);
  row.strokeWeight = 1;
  row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;

  const num = vstack('Num', 49, { fill: (opts && opts.numFill) || null, padding: [8, 4, 8, 4] });
  num.counterAxisAlignItems = 'CENTER';
  num.primaryAxisAlignItems = 'CENTER';
  num.layoutAlign = 'STRETCH';
  num.strokes = solid(C['table.line']);
  num.strokeWeight = 1;
  num.strokeTopWeight = 0; num.strokeBottomWeight = 0; num.strokeLeftWeight = 0;
  num.appendChild(numContent);
  row.appendChild(num);

  const body = vstack('Description', 371, { fill: (opts && opts.bodyFill) || null, padding: [10, 8, 10, 8], gap: 2 });
  body.layoutAlign = 'STRETCH';
  body.appendChild(bodyNode);
  row.appendChild(body);
  return row;
}

function buildDescPanel(board, C, L) {
  const P = vstack('Description 패널', L.descriptionWidth, {});
  P.strokes = solid(C['table.line']);
  P.strokeWeight = 1;
  P.strokeTopWeight = 0; P.strokeRightWeight = 0; P.strokeBottomWeight = 0;

  // 헤더
  const head = hstack('표 헤더', { fill: '#000000', align: 'CENTER' });
  head.resize(420, 30);
  head.primaryAxisSizingMode = 'FIXED';
  head.counterAxisSizingMode = 'FIXED';
  const hNum = text('Num', { size: 14, weight: 700, color: '#FFFFFF', width: 49, align: 'CENTER' });
  const hDesc = text('Description', { size: 14, weight: 700, color: '#FFFFFF', width: 371, align: 'CENTER' });
  head.appendChild(hNum); head.appendChild(hDesc);
  P.appendChild(head);

  const d = board.descriptions;
  const FC = FLAG_COLOR(C);

  for (const fl of d.flags || []) {
    const mark = text('※', { size: 14, weight: 700, color: '#FFFFFF' });
    const body = text(fl.text, { size: 14, weight: 500, color: FC[fl.kind], width: 355 });
    P.appendChild(cellRow(mark, body, C, { name: `※ ${fl.kind}`, numFill: FC[fl.kind], bodyFill: C['table.stripe'] }));
  }

  if ((d.requirements || []).length) {
    const label = text('요구\n사항', { size: 12, weight: 700, align: 'CENTER', lineHeight: 1.25 });
    const box = vstack('요구사항 목록', 355, { gap: 2 });
    for (const q of d.requirements) box.appendChild(text(`${q.id} : ${q.text}`, { size: 14, width: 355 }));
    P.appendChild(cellRow(label, box, C, { name: '요구사항' }));
  }

  for (const r of d.rows || []) {
    const no = text(r.no, { size: 14, weight: 700, align: 'CENTER' });
    const box = vstack(`행 ${r.no}`, 355, { gap: 2 });
    box.appendChild(text(r.title, { size: 14, weight: 700, width: 355 }));
    for (const bl of r.bullets || []) {
      const ind = (bl.indent || 0) * 16;
      const t = text('• ' + bl.text, {
        size: 14, width: 355 - ind,
        color: bl.color === 'red' ? C['flag.confirm'] : (bl.color === 'green' ? C['flag.reference'] : '#000000'),
      });
      const wrap = hstack('불릿', {});
      setWidth(wrap, 355);
      wrap.paddingLeft = ind;
      wrap.appendChild(t);
      box.appendChild(wrap);
    }
    P.appendChild(cellRow(no, box, C, { name: `Num ${r.no}` }));
  }

  if (board.comment) {
    const cm = vstack('Comment', 420, { fill: '#000000', padding: [10, 12, 10, 12] });
    cm.appendChild(text(board.comment, { size: 14, color: '#FFFFFF', width: 396 }));
    P.appendChild(cm);
  }
  return P;
}

// ── General 보드 본문 (표·텍스트 전량 네이티브) ─────────────
function buildGeneralBody(board, C, L) {
  const W = L.designWidth - 68 * 2;
  const G = vstack('General 본문', L.designWidth, { gap: 22, padding: [24, 68, 40, 68] });

  for (const blk of (board.general && board.general.blocks) || []) {
    if (blk.type === 'table') {
      const sec = vstack('표 섹션', W, { gap: 8 });
      if (blk.caption) sec.appendChild(text(blk.caption, { size: 15, weight: 700, width: W }));
      if (blk.note) sec.appendChild(text(blk.note, { size: 12, color: '#4A5568', width: W }));

      const cols = blk.columns.length;
      // 열 너비는 번들이 내용 비례로 계산해 실어 보낸다 (없으면 균등 배분으로 폴백)
      const cw = blk.colWidths && blk.colWidths.length === cols
        ? blk.colWidths
        : blk.columns.map((_, i) => (i === cols - 1 ? W - Math.floor(W / cols) * (cols - 1) : Math.floor(W / cols)));
      const mkRow = (cells, isHead) => {
        const row = hstack(isHead ? '헤더' : '행', {});
        setWidth(row, W);
        cells.forEach((c, i) => {
          const cell = vstack('셀', cw[i], {
            fill: isHead ? '#F1F3F5' : null, padding: [7, 9, 7, 9],
          });
          cell.layoutAlign = 'STRETCH';
          cell.strokes = solid(isHead ? C['table.line'] : '#D5D8DC');
          cell.strokeWeight = 1;
          cell.appendChild(text(c, { size: 12.5, weight: isHead ? 700 : 400, width: cw[i] - 18 }));
          row.appendChild(cell);
        });
        return row;
      };
      const tbl = vstack('표', W, {});
      tbl.appendChild(mkRow(blk.columns, true));
      for (const r of blk.rows) tbl.appendChild(mkRow(r, false));
      sec.appendChild(tbl);
      G.appendChild(sec);
    } else {
      const sec = vstack('텍스트 섹션', W, { gap: 6 });
      if (blk.title) sec.appendChild(text(blk.title, { size: 15, weight: 700, width: W }));
      for (const p of blk.paragraphs || []) sec.appendChild(text(p, { size: 13, width: W, lineHeight: 1.65 }));
      for (const b of blk.bullets || []) sec.appendChild(text('• ' + b, { size: 13, width: W, lineHeight: 1.6 }));
      G.appendChild(sec);
    }
  }
  return G;
}

// ── 보드 1개 조립 ─────────────────────────────────────────
async function buildBoard(board, images, C, L, forceImage) {
  const B = frame(board.name, board.x, board.y, board.width, Math.max(board.height, L.minHeight), '#FFFFFF');
  B.clipsContent = false;

  const left = frame('디자인', 0, 0, L.designWidth, Math.max(board.height, L.minHeight), '#FFFFFF');
  left.strokes = solid(C['table.line']);
  left.strokeWeight = 1;
  left.strokeTopWeight = 0; left.strokeLeftWeight = 0; left.strokeBottomWeight = 0;
  left.appendChild(buildHeader(board, C, L));

  if (board.kind === 'general') {
    const body = buildGeneralBody(board, C, L);
    left.appendChild(body);
    body.x = 0; body.y = board.headerHeight; // 좌표는 부모에 붙인 뒤 지정한다
    left.resize(L.designWidth, Math.max(board.height, board.headerHeight + body.height));
  } else if (board.design && board.design.tree && !forceImage) {
    // 네이티브 : 렌더 트리를 노드로 만든다. PNG는 쓰지 않는다
    const root = renderNode(board.design.tree);
    root.name = '화면';
    left.appendChild(root);
    root.x = board.design.x; root.y = board.design.y; // 부모에 붙인 뒤 지정
    left.appendChild(buildCallouts(board, C));
  } else if (board.design) {
    // PNG 폴백 : 렌더 트리가 없거나(.main 부재) 사용자가 이미지 모드를 고른 경우
    const bytes = images[board.design.image];
    if (!bytes) throw new Error(`PNG 누락: ${board.design.image}`);
    const img = figma.createImage(bytes);
    const rect = figma.createRectangle();
    rect.name = board.design.image;
    rect.resize(board.design.width, board.design.height);
    rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: img.hash }];
    left.appendChild(rect);
    rect.x = board.design.x; rect.y = board.design.y; // 부모에 붙인 뒤 지정
    left.appendChild(buildCallouts(board, C));
  }
  B.appendChild(left);

  const panel = buildDescPanel(board, C, L);
  B.appendChild(panel);
  panel.x = L.designWidth; panel.y = 0; // 부모에 붙인 뒤 지정

  const h = Math.max(board.height, left.height, panel.height, L.minHeight);
  B.resize(board.width, h);
  left.resize(L.designWidth, h);
  return B;
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'close') { figma.closePlugin(); return; }
  if (msg.type !== 'build') return;

  let created = null; // 실패 시 빈 페이지를 남기지 않기 위해 추적
  try {
    F = await resolveFonts();
    const { bundle, images, newPage, forceImage } = msg;
    const C = bundle.colors, L = bundle.layout;

    let page = figma.currentPage;
    if (newPage) {
      page = figma.createPage();
      created = page;
      const name = (bundle.boards[0] && bundle.boards[0].name) || '';
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      // 화면군 이름은 번들의 naming에서 온다 (board-policy.json → naming.projectLabel)
      const projectLabel = (bundle.naming && bundle.naming.projectLabel) || 'UID';
      page.name = `UID ${name.startsWith('G-') ? 'General' : (name.split('_')[1] || projectLabel)} ${stamp}`;
      // dynamic-page 모드에서는 동기 할당이 금지된다
      await figma.setCurrentPageAsync(page);
    }

    // 좌표는 번들이 정한다 (merge_placements의 계위 배치 — 화면 오른쪽에 그 화면의 부속).
    // 그룹별로 나눠 실행하므로 이 번들의 좌상단이 (0,0)이 되도록 평행이동한다.
    const hasXY = bundle.boards.every((b) => typeof b.x === 'number' && typeof b.y === 'number');
    const ox = hasXY ? Math.min(...bundle.boards.map((b) => b.x)) : 0;
    const oy = hasXY ? Math.min(...bundle.boards.map((b) => b.y)) : 0;

    const made = [];
    let seqY = 0;   // 좌표가 없는 낡은 번들용 폴백
    for (let i = 0; i < bundle.boards.length; i++) {
      const b = bundle.boards[i];
      figma.ui.postMessage({ type: 'progress', text: `${i + 1}/${bundle.boards.length} ${b.name}` });
      const pos = hasXY ? { x: b.x - ox, y: b.y - oy } : { x: 0, y: seqY };
      const node = await buildBoard(Object.assign({}, b, pos), images, C, L, forceImage);
      page.appendChild(node);
      made.push(node);
      if (!hasXY) seqY += node.height + (bundle.gap || 120);
    }

    const w = Math.max.apply(null, made.map((n) => n.x + n.width));
    const h = Math.max.apply(null, made.map((n) => n.y + n.height));
    page.selection = made;
    figma.viewport.scrollAndZoomIntoView(made);
    figma.ui.postMessage({
      type: 'done',
      text: `완료: 보드 ${made.length}개\n페이지: ${page.name}\n폰트: ${F.family}${F.fallback ? ' (Pretendard 없음 — 폴백)' : ''}\n배치: ${hasXY ? '계위' : '순차(좌표 없음)'} ${Math.round(w)}×${Math.round(h)}px`,
    });
  } catch (e) {
    // 보드가 하나도 안 만들어졌으면 방금 만든 빈 페이지를 되돌린다
    if (created && created.children.length === 0) {
      try {
        const others = figma.root.children.filter((p) => p !== created);
        if (others.length) await figma.setCurrentPageAsync(others[0]);
        created.remove();
      } catch (e2) { /* 정리 실패는 무시 */ }
    }
    figma.ui.postMessage({ type: 'error', text: '실패: ' + (e && e.message ? e.message : String(e)) });
  }
};
