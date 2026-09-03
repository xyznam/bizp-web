/* ============================================================
   billing-store.js — 청구 데이터 공용 스토어 (UW_BL_05 · UW_BL_07 공유)

   왜 따로 두나
     09_담당매장청구(목록)와 09_청구그룹상세(상세)가 같은 그룹·구독을 다룬다.
     화면마다 목데이터를 따로 두면 두 화면이 다른 답을 준다 — 2026-08-29 에
     09_요금제비용 ↔ 09_담당매장청구 가 다음 결제일을 다르게 보여준 사고가 그것이다.
     그래서 기준값은 여기 한 곳에만 둔다.

   세션 보존
     목록에서 매장을 옮기고 상세로 들어가면 그 결과가 보여야 한다.
     프로토타입이라 서버가 없으므로 sessionStorage 에 변경분을 덮어 둔다.
     탭을 닫으면 기준값으로 돌아간다 (데모용).

   어드민 정본 (G-04 표 3 · G-12 · 어드민 68)
     - 청구 그룹 = 대행사 명의 청구 계정(BA). 새 개념이 아니다.
       그룹 1개 = 청구서 1장. 그룹을 나눈다 = BA 를 여러 개 두고 구독을 그중 하나에 연결한다
     - 정본은 '각 구독이 가리키는 청구 계정'이다. 그룹이 구독을 소유하는 구조가 아니다
     - 결제 ≠ 접근 : 청구 계정은 매장 접근 권한을 만들지 않는다
     - own:true 인 그룹(대행사 명의)만 대행사가 만들고 매장을 옮길 수 있다.
       본사 통합·점주 본인 카드는 지불 주체가 달라 운영팀 소관 (G-12 표 8)
   ============================================================ */
(function () {
  "use strict";

  var KEY = "uw_billing_v1";

  var PLANS = {
    Basic:   { price: 39000,  desc: "문자 1,000건 · AI 글 20건 · 챗봇 미포함" },
    Pro:     { price: 89000,  desc: "문자 5,000건 · AI 글 50건 · 챗봇 100건" },
    Premium: { price: 189000, desc: "문자 20,000건 · AI 글 무제한 · 챗봇 무제한" }
  };

  /* 기준값 — 담당 78곳 중 구독 74곳(대행사 대납 72 · 본사 통합 1 · 점주 본인 카드 1) + 미개시 4곳.
     목록에 실제로 그리는 건 아래 14행이고, 나머지는 그룹의 stores/mix 합계에만 들어간다. */
  function baseline() {
    return {
      groups: [
        { id: "BA-0102-01", name: "강남·서초 권역", kind: "대행사 대납", own: true, method: "세금계산서",
          stores: 30, mix: { Basic: 16, Pro: 11, Premium: 3 },
          biz: { corp: "마케팅파트너스", bizNo: "2**-**-*7841", ceo: "정*훈",
                 addr: "서울 강남구 테헤란로 **길 12, 8층", mgr: "김마케 (010-****-2211)" },
          tax: [ { ym: "2026-08", supply: 2170000, state: "발행 대기", no: null },
                 { ym: "2026-07", supply: 2151000, state: "발행 완료", no: "20260801-24817533" },
                 { ym: "2026-06", supply: 2132000, state: "발행 완료", no: "20260701-24102998" } ] },
        { id: "BA-0102-02", name: "분당·판교 권역", kind: "대행사 대납", own: true, method: "세금계산서",
          stores: 26, mix: { Basic: 15, Pro: 9, Premium: 2 },
          biz: { corp: "마케팅파트너스", bizNo: "2**-**-*7841", ceo: "정*훈",
                 addr: "서울 강남구 테헤란로 **길 12, 8층", mgr: "이경기 (010-****-3402)" },
          tax: [ { ym: "2026-08", supply: 1764000, state: "발행 대기", no: null },
                 { ym: "2026-07", supply: 1748000, state: "발행 완료", no: "20260801-24817612" },
                 { ym: "2026-06", supply: 1732000, state: "발행 완료", no: "20260701-24103077" } ] },
        { id: "BA-0102-03", name: "병의원 전담", kind: "대행사 대납", own: true, method: "카드 자동결제",
          stores: 16, mix: { Basic: 9, Pro: 6, Premium: 1 },
          biz: { corp: "마케팅파트너스", bizNo: "2**-**-*7841", ceo: "정*훈",
                 addr: "서울 강남구 테헤란로 **길 12, 8층", mgr: "박의료 (010-****-5590)" },
          tax: [ { ym: "2026-08", supply: 1074000, state: "카드 결제", no: null },
                 { ym: "2026-07", supply: 1061000, state: "카드 결제", no: null },
                 { ym: "2026-06", supply: 1048000, state: "카드 결제", no: null } ] },
        { id: "BA-0210-03", name: "(주)스시오마카세", kind: "본사 통합", own: false, method: "카드 자동결제",
          stores: 1, mix: { Basic: 0, Pro: 0, Premium: 1 },
          biz: { corp: "(주)스시오마카세", bizNo: "1**-**-*2093", ceo: "최*수",
                 addr: "서울 송파구 올림픽로 ***", mgr: "본사 재무팀 (02-****-1200)" },
          tax: null },
        { id: "BA-0332-02", name: "점주 본인 카드", kind: "점주 본인 카드", own: false, method: "카드 자동결제",
          stores: 1, mix: { Basic: 1, Pro: 0, Premium: 0 },
          biz: { corp: "스몰빌커피", bizNo: "3**-**-*0117", ceo: "한*진",
                 addr: "서울 마포구 와우산로 **", mgr: "사장님 본인 (010-****-7788)" },
          tax: null }
      ],
      subs: [
        { store: "스시오마카세 강남점", plan: "Pro",     ba: "BA-0102-01", renew: "2026-09-20", since: "2025-09-20" },
        { store: "스시오마카세 판교점", plan: "Basic",   ba: "BA-0102-02", renew: "2026-09-03", since: "2025-12-03" },
        { store: "카페봄봄 신촌점",     plan: "Basic",   ba: "BA-0102-01", renew: "2026-09-02", since: "2026-03-02" },
        { store: "테라스의원",          plan: "Premium", ba: "BA-0102-03", renew: "2026-08-25", since: "2025-08-25" },
        { store: "청담라인의원",        plan: "Premium", ba: "BA-0210-03", renew: "2026-09-15", since: "2025-11-15" },
        { store: "우리동네정형외과",    plan: "Pro",     ba: "BA-0102-03", renew: "2026-09-11", since: "2026-01-11" },
        { store: "스몰빌커피",          plan: "Basic",   ba: "BA-0332-02", renew: "2026-08-21", since: "2026-02-21" },
        { store: "청춘분식",            plan: "Basic",   ba: "BA-0102-01", renew: "2026-09-28", since: "2026-04-28" },
        { store: "김마케 김밥집",       plan: "Pro",     ba: "BA-0102-02", renew: "2026-09-06", since: "2025-10-06" },
        { store: "라라네일 홍대점",     plan: "Pro",     ba: "BA-0102-01", renew: "2026-09-01", since: "2026-05-01" },
        { store: "하나로약국",          plan: "Basic",   ba: "BA-0102-02", renew: "2026-08-13", since: "2025-07-13" },
        { store: "브레드하우스 성수점", plan: "Premium", ba: "BA-0102-01", renew: "2026-09-04", since: "2026-06-04" },
        { store: "굿모닝세탁소",        plan: null,      ba: null,         renew: null,         since: null },
        { store: "별빛사진관",          plan: null,      ba: null,         renew: null,         since: null }
      ]
    };
  }

  var state = null;
  function load() {
    if (state) return state;
    try {
      var raw = sessionStorage.getItem(KEY);
      if (raw) { state = JSON.parse(raw); return state; }
    } catch (e) { /* 시크릿 모드 등 */ }
    state = baseline();
    return state;
  }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function groups() { return load().groups; }
  function subs()   { return load().subs; }
  function group(id) { return groups().filter(function (g) { return g.id === id; })[0] || null; }
  function sub(store) { return subs().filter(function (s) { return s.store === store; })[0] || null; }
  /* 그룹의 월 합산 예상액 — 요금제 구성에서 파생시킨다(따로 적어두면 목록과 어긋난다) */
  function total(g) {
    return g.mix.Basic * PLANS.Basic.price + g.mix.Pro * PLANS.Pro.price + g.mix.Premium * PLANS.Premium.price;
  }
  /* 목록에 그리는 목업 매장 (그룹 stores 합계 중 일부) */
  function storesOf(id) { return subs().filter(function (s) { return s.ba === id; }); }
  /* 목업에 없는 나머지 — 상세에서 "그 외 N곳"으로 한 줄 표시 */
  function restOf(id) {
    var g = group(id); if (!g) return { n: 0, amt: 0 };
    var shown = storesOf(id);
    var amt = shown.reduce(function (a, s) { return a + PLANS[s.plan].price; }, 0);
    return { n: g.stores - shown.length, amt: total(g) - amt };
  }

  /* 매장을 다른 청구 그룹으로 옮긴다. 요금제 구성도 같이 옮겨야 금액이 맞는다.
     적용 시점은 다음 청구 주기부터 (G-12 표 8) — 프로토타입은 즉시 반영해 보여준다. */
  function move(store, toId) {
    var s = sub(store), to = group(toId);
    if (!s || !to || !s.plan || s.ba === toId) return false;
    var from = group(s.ba);
    if (from) { from.stores--; from.mix[s.plan]--; }
    to.stores++; to.mix[s.plan]++;
    s.ba = toId; save(); return true;
  }
  function setPlan(store, plan) {
    var s = sub(store); if (!s || !PLANS[plan]) return false;
    var g = s.ba ? group(s.ba) : null;
    if (g) { if (s.plan) g.mix[s.plan]--; else g.stores++; g.mix[plan]++; }
    s.plan = plan; save(); return true;
  }
  function addGroup(name, method) {
    var n = groups().filter(function (g) { return g.own; }).length + 1;
    var g = {
      id: "BA-0102-" + ("0" + n).slice(-2), name: name, kind: "대행사 대납", own: true, method: method,
      stores: 0, mix: { Basic: 0, Pro: 0, Premium: 0 },
      biz: { corp: "마케팅파트너스", bizNo: "2**-**-*7841", ceo: "정*훈",
             addr: "서울 강남구 테헤란로 **길 12, 8층", mgr: "김마케 (010-****-2211)" },
      tax: [ { ym: "2026-08", supply: 0, state: method === "세금계산서" ? "발행 대기" : "카드 결제", no: null } ]
    };
    var own = groups().filter(function (x) { return x.own; }).length;
    groups().splice(own, 0, g); save(); return g;
  }
  function updateGroup(id, patch) {
    var g = group(id); if (!g || !g.own) return false;
    if (patch.name) g.name = patch.name;
    if (patch.method) {
      g.method = patch.method;
      if (g.tax && g.tax[0]) g.tax[0].state = patch.method === "세금계산서" ? "발행 대기" : "카드 결제";
    }
    save(); return true;
  }
  function removeGroup(id) {
    var g = group(id);
    if (!g || !g.own || g.stores > 0) return false;          // 매장이 남아 있으면 지울 수 없다
    if (groups().filter(function (x) { return x.own; }).length <= 1) return false;  // 마지막 그룹 가드
    load().groups = groups().filter(function (x) { return x.id !== id; });
    save(); return true;
  }
  function reset() { state = baseline(); save(); }

  window.UWB = {
    PLANS: PLANS,
    groups: groups, subs: subs, group: group, sub: sub,
    total: total, storesOf: storesOf, restOf: restOf,
    move: move, setPlan: setPlan,
    addGroup: addGroup, updateGroup: updateGroup, removeGroup: removeGroup,
    reset: reset, save: save
  };
})();
