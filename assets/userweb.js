/* ============================================================
   userweb.js — v2-responsive: 레벨 렌더러 · 대체 카드 · 반응형 셸(하단 탭바·L3 모바일 가드)
   의존: capability-matrix.js (UW_MATRIX, UW_MOCK) 선로드 필수
   계약 (planning/24 템플릿 계약 문서):
   - <body data-screen="UW_HM_01"> 로 화면 ID 선언
   - 기능 블록은 data-module="M0x" 속성만 부여 (레벨 하드코딩 금지)
   - 렌더 규칙: 레벨 ∈ module.levels → 표시
                / 미포함 & fallback="agency-card" & 현재 레벨 L1 → 대체 카드
                / 그 외 → 숨김
   - 미구현(P3 예약) 화면으로의 이동은 .is-planned + data-planned-file
     → 클릭 시 안내 토스트 (죽은 링크 금지: As-Is 교훈)
   수정 권한: P2 확립 후 통합 세션 전용.
   ============================================================ */
(function () {
  "use strict";

  var LS_KEY = "uw_level";
  var LEVELS = ["L1", "L2", "L3"];

  function currentLevel() {
    var v = null;
    try { v = localStorage.getItem(LS_KEY); } catch (e) { /* file:// 등 */ }
    return LEVELS.indexOf(v) >= 0 ? v : "L2";
  }
  function setLevel(lv) {
    if (LEVELS.indexOf(lv) < 0) return;   /* 레벨 아닌 값이 들어오면 무시 (청구 전달분 2026-08-29) */
    try { localStorage.setItem(LS_KEY, lv); } catch (e) {}
    render();
  }

  /* ---------- 콘텐츠 검수 모드 (매장별 정책 — 06 우리 매장 정보에서 설정) ----------
     A: 사장님 검수형 (AI 생성 → 사장님 승인/반려)
     B: 대행사 위임형 (AI 생성 → 대행사 검수 → 바로 발행, 사장님 승인 생략)
     * 셀프(L2)는 대행사가 없어 항상 A. 실효 모드는 각 화면에서 레벨과 함께 판단한다. */
  var RM_KEY = "uw_review_mode";
  function reviewMode() {
    var v = null;
    try { v = localStorage.getItem(RM_KEY); } catch (e) {}
    return v === "B" ? "B" : "A";
  }
  function setReviewMode(m) {
    try { localStorage.setItem(RM_KEY, m === "B" ? "B" : "A"); } catch (e) {}
    render();
  }

  /* ---------- 구독 취소 예약 상태 (2026-08-28 신설) ----------
     09_요금제비용/25_요금제변경/24_해지 세 화면이 공유하는 단순 플래그. 프로토타입 범위라 매장별로
     안 나뉘고 브라우저 하나에 하나만 저장(레벨/검수모드와 같은 방식) — 실사용에선 매장 단위 데이터. */
  var CANCEL_KEY = "uw_cancel_pending";
  function cancelPending() {
    try { return localStorage.getItem(CANCEL_KEY) === "1"; } catch (e) { return false; }
  }
  function setCancelPending(v) {
    try { if (v) localStorage.setItem(CANCEL_KEY, "1"); else localStorage.removeItem(CANCEL_KEY); } catch (e) {}
  }

  /* ---------- 조사 자동 선택 ----------
     받침 유무에 따라 은/는, 이/가, 을/를, 과/와 같은 조사를 골라준다(완성형 한글 유니코드 코드포인트로 판별).
     "OO은(는)" 식으로 괄호 표기를 그대로 노출하던 문제 수정용(2026-08-28).
     한글이 아닌 문자(영문·숫자 등)로 끝나면 받침 있는 쪽을 기본값으로 씀. */
  function josa(word, withBatchim, withoutBatchim) {
    var s = String(word == null ? "" : word);
    var ch = s.charCodeAt(s.length - 1);
    if (ch >= 0xAC00 && ch <= 0xD7A3) {
      return (ch - 0xAC00) % 28 === 0 ? withoutBatchim : withBatchim;
    }
    return withBatchim;
  }

  /* ---------- 대체 카드 (L1 fallback) ----------
     agency-card: 대행사가 대신 수행하는 기능 자리
     tbd-card   : 대행사별 요금제·결제 방식에 따라 제공 (TBD) — OD-U2 결정(2026-07-07) */
  function buildFallback(modId, mod, mock) {
    var agency = mock.agencyName || "대행사";
    var name = mod.fallbackName || mod.name;
    var el = document.createElement("div");
    el.className = "uw-fallback";
    el.setAttribute("data-fallback-for", modId);
    if (mod.fallback === "tbd-card") {
      el.innerHTML =
        '<div class="uw-fallback-chip">💳</div>' +
        '<div><div class="uw-fallback-title">' + name + " — 대행사별 상이한 요금제·결제 방식에 따라 제공됩니다 <span class=\"uw-badge b-gray\">TBD</span></div>" +
        '<div class="uw-fallback-desc">자세한 내용은 담당 대행사 ' + agency + "에 문의해 주세요.</div></div>" +
        '<button class="btn btn-ghost btn-sm" data-action="contact-agency">대행사 문의</button>';
      return el;
    }
    el.innerHTML =
      '<div class="uw-fallback-chip">🤝</div>' +
      '<div><div class="uw-fallback-title">' + name + josa(name, "은", "는") + " 대행사 " + agency + josa(agency, "이", "가") + " 관리하고 있어요</div>" +
      '<div class="uw-fallback-desc">원하는 내용이 있으면 편하게 요청해 주세요. 보통 하루 안에 답을 드려요.</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="request-agency">대행사에 요청하기</button>';
    return el;
  }



  /* ---------- 역할(owner/staff) — 27 §5 권한 매트릭스 ---------- */
  function currentRole() {
    var r = null;
    try { r = localStorage.getItem("uw_role"); } catch (e) {}
    return r === "staff" ? "staff" : "owner";
  }
  function staffGrants() {
    try { return JSON.parse(localStorage.getItem("uw_grants") || "[]"); } catch (e) { return []; }
  }
  function setRole(role, grants, staffName) {
    try {
      localStorage.setItem("uw_role", role);
      localStorage.setItem("uw_grants", JSON.stringify(grants || []));
      localStorage.setItem("uw_staff_name", staffName || "직원");
    } catch (e) {}
    render();
  }
  function buildPermCard(modId, mod) {
    var name = window.UW_PERMS.catalog[mod.perm] || mod.name;
    var el = document.createElement("div");
    el.className = "uw-fallback";
    el.setAttribute("data-fallback-for", modId);
    el.innerHTML =
      '<div class="uw-fallback-chip">🔒</div>' +
      '<div><div class="uw-fallback-title">' + name + josa(name, "은", "는") + " 사장님이 권한을 주면 쓸 수 있어요</div>" +
      '<div class="uw-fallback-desc">필요하면 사장님께 요청해 보세요.</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="request-perm">권한 요청하기</button>';
    return el;
  }


  /* 직원 모드 셸: ownerOnly 화면 가드 + 상단 배너 (27 §5.4) */
  function applyStaffShell(screen) {
    var role = currentRole(), body = document.body, main = document.querySelector(".uw-body");
    var banner = document.querySelector(".uw-staff-banner");
    if (role === "staff" && document.querySelector(".uw-lnb")) {
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "uw-staff-banner";
        var nm = "직원"; try { nm = localStorage.getItem("uw_staff_name") || "직원"; } catch (e) {}
        banner.innerHTML = '👤 <b>' + nm + '</b> 계정으로 보는 중이에요' +
          '<button class="btn btn-ghost btn-sm" data-action="exit-staff">사장님 화면으로 돌아가기</button>';
        var tb = document.querySelector(".uw-topbar");
        if (tb) tb.parentNode.insertBefore(banner, tb.nextSibling);
      }
    } else if (banner) { banner.remove(); }

    var need = role === "staff" && screen.ownerOnly && main;
    body.classList.toggle("uw-owner-guarded", !!need);
    if (need && !main.querySelector(".uw-owner-guard")) {
      var g = document.createElement("div");
      g.className = "uw-l3-guard uw-owner-guard";
      g.innerHTML = '<div class="g-icon">🔒</div>' +
        '<div class="g-title">사장님만 볼 수 있는 화면이에요</div>' +
        '<div class="g-desc">직원 초대와 권한은 사장님이 관리해요.</div>' +
        '<button class="btn btn-secondary btn-sm" data-action="exit-staff">사장님 화면으로 돌아가기</button>';
      main.appendChild(g);
    }
  }

  /* ---------- 반응형 셸 (26 문서 R0) ---------- */
  function isMobileViewport() {
    return window.matchMedia && window.matchMedia("(max-width:767px)").matches;
  }

  /* 하단 탭바 — 가이드 07 정보 구조의 5탭 (26 §3 매핑) */
  var TABS = [
    { icon: "🏠", label: "홈",     href: "01_홈.html",         screens: ["UW_HM_01","UW_PL_01","UW_RP_01","UW_MY_02"] },
    { icon: "📣", label: "마케팅", href: "02_콘텐츠검토.html", screens: ["UW_CR_01","UW_CT_01"], badge: 3 },
    { icon: "💬", label: "비즈챗", href: "04_비즈챗문자.html", screens: ["UW_BC_01"] },
    { icon: "🤖", label: "챗봇",   href: "05_AI챗봇.html",     screens: ["UW_CB_01"] },
    { icon: "👤", label: "MY",     href: "06_우리매장정보.html", screens: ["UW_ST_01","UW_ST_05","UW_ST_06","UW_BL_01","UW_MY_01"] }
  ];
  function ensureTabbar(screenId) {
    if (!document.querySelector(".uw-lnb")) return; // 셸 없는 화면(10 온보딩) 제외
    var bar = document.querySelector(".uw-tabbar");
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "uw-tabbar";
      bar.innerHTML = TABS.map(function (t) {
        return '<a href="' + t.href + '" data-tab-screens="' + t.screens.join(",") + '">' +
          '<span class="t-icon">' + t.icon + (t.badge ? '<span class="t-badge">' + t.badge + "</span>" : "") + "</span>" + t.label + "</a>";
      }).join("");
      document.body.appendChild(bar);
    }
    bar.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("is-on", a.getAttribute("data-tab-screens").split(",").indexOf(screenId) >= 0);
    });
  }

  /* L3 모바일 가드 (26 §7 OQ-1 잠정: 전면 가드) */
  function applyL3Guard(lv) {
    var body = document.body, main = document.querySelector(".uw-body");
    var need = lv === "L3" && isMobileViewport() && !!document.querySelector(".uw-lnb");
    body.classList.toggle("uw-l3-guarded", need);
    if (need && main && !main.querySelector(".uw-l3-guard")) {
      var g = document.createElement("div");
      g.className = "uw-l3-guard";
      g.innerHTML = '<div class="g-icon">🖥️</div>' +
        '<div class="g-title">대행사 화면은 PC에서 써주세요</div>' +
        '<div class="g-desc">다매장 관리·검수 작업은 넓은 화면에 맞춰져 있어요.<br>사장님 화면은 휴대폰에서도 볼 수 있어요.</div>' +
        '<button class="btn btn-secondary btn-sm" data-action="set-level" data-level-btn="L2">사장님 화면(L2)으로 보기</button>';
      main.appendChild(g);
    }
  }

  /* ---------- 레벨 렌더 ---------- */
  function render() {
    var screenId = document.body.getAttribute("data-screen");
    var screen = window.UW_MATRIX && window.UW_MATRIX[screenId];
    if (!screen) { console.warn("[userweb] 매트릭스에 없는 화면:", screenId); return; }

    var lv = currentLevel();
    var mock = (window.UW_MOCK && window.UW_MOCK.levels[lv]) || {};

    document.body.setAttribute("data-level", lv);

    // 모듈 노출/숨김/대체
    document.querySelectorAll("[data-module]").forEach(function (el) {
      var id = el.getAttribute("data-module");
      var mod = screen.modules[id];
      // 기존 대체 카드 제거
      var old = el.parentNode && el.parentNode.querySelector('[data-fallback-for="' + id + '"]');
      if (old) old.remove();

      if (!mod) { console.warn("[userweb] 매트릭스 미등재 모듈:", screenId, id); el.setAttribute("data-hidden", "true"); return; }

      var role = currentRole();
      if (mod.levels.indexOf(lv) >= 0) {
        /* 레벨 통과 → 직원 권한 검사 (27 §5: perm 미부여 시 권한 필요 카드) */
        if (role === "staff" && mod.perm && staffGrants().indexOf(mod.perm) < 0) {
          el.setAttribute("data-hidden", "true");
          el.parentNode.insertBefore(buildPermCard(id, mod), el);
        } else {
          el.setAttribute("data-hidden", "false");
        }
      } else {
        el.setAttribute("data-hidden", "true");
        if ((mod.fallback === "agency-card" || mod.fallback === "tbd-card") && lv === "L1") {
          el.parentNode.insertBefore(buildFallback(id, mod, mock), el);
        }
      }
    });

    // L1 대행사 상시 필 (셸 공통 주입) — 담당 대행사명 상시 노출 + 문의 버튼
    var pill = document.querySelector(".uw-agency-pill");
    if (lv === "L1" && mock.agencyName) {
      if (!pill) {
        pill = document.createElement("div");
        pill.className = "uw-agency-pill";
        pill.innerHTML = "🤝 <span><b>" + mock.agencyName + "</b>가 함께 관리하고 있어요</span>" +
          '<button class="btn btn-primary" data-action="contact-agency">대행사 문의</button>';
        var right = document.querySelector(".uw-topbar-right");
        if (right) right.insertBefore(pill, right.firstChild);
      }
    } else if (pill) {
      pill.remove();
    }

    // 페르소나 치환: data-bind="ownerName|persona|plan|agencyName"
    document.querySelectorAll("[data-bind]").forEach(function (el) {
      var k = el.getAttribute("data-bind");
      if (mock[k] != null) el.textContent = mock[k];
    });

    // 레벨별 카피 치환 (UW_COPY 카피 매트릭스 — 23 §10.3 지침)
    var copies = (window.UW_COPY || {})[screenId] || {};
    document.querySelectorAll("[data-copy]").forEach(function (el) {
      var c = copies[el.getAttribute("data-copy")];
      if (!c) { console.warn("[userweb] 카피 매트릭스 미등재 키:", screenId, el.getAttribute("data-copy")); return; }
      var s = c[lv] || c.L2 || c.L1 || c.L3;
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return mock[k] != null ? mock[k] : m; });
      el.innerHTML = s;
    });

    /* 레벨 스위처 상태 — .uw-lvl-switch 는 세그먼트 컨트롤 공용 스타일로도 쓰인다
       (약관 탭·학습 상태 데모 등). data-level-btn 이 붙은 버튼만 건드린다. 청구 전달분 2026-08-29 */
    document.querySelectorAll(".uw-lvl-switch button[data-level-btn]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-level-btn") === lv);
    });

    // 레벨별 표시 요소 (data-only-level="L3" 등 — 모듈보다 작은 장식 단위)
    // 2026-09-03: 콤마로 여러 레벨 허용(data-only-level="L2,L3"). 기존 단일값은 그대로 동작.
    // LNB에서 "L1만 빼고 노출"처럼 여집합을 표현할 방법이 없어서 확장함(03 콘텐츠 만들기 메뉴).
    document.querySelectorAll("[data-only-level]").forEach(function (el) {
      var allow = el.getAttribute("data-only-level").split(",").map(function (s) { return s.trim(); });
      el.style.display = allow.indexOf(lv) >= 0 ? "" : "none";
    });

    ensureTabbar(screenId);
    applyL3Guard(lv);
    applyStaffShell(screen);

    document.dispatchEvent(new CustomEvent("uw:levelchange", { detail: { level: lv, mock: mock } }));
  }

  /* ---------- 토스트 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = document.querySelector(".uw-toast");
    if (!t) { t = document.createElement("div"); t.className = "uw-toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("is-show"); }, 2600);
  }

  /* ---------- 모달 ---------- */
  function openModal(id) { var m = document.getElementById(id); if (m) m.classList.add("is-open"); }
  function closeModal(el) { var b = el.closest(".uw-modal-backdrop"); if (b) b.classList.remove("is-open"); }

  /* ---------- 전역 클릭 위임 ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-action], .is-planned, .uw-modal-backdrop");
    if (!t) return;

    if (t.classList && t.classList.contains("is-planned")) {
      e.preventDefault();
      var f = t.getAttribute("data-planned-file") || "다음 웨이브";
      toast("이 화면은 P3에서 만들어져요 (" + f + ")");
      return;
    }
    if (t.classList && t.classList.contains("uw-modal-backdrop") && e.target === t) {
      t.classList.remove("is-open"); return;
    }

    var action = t.getAttribute("data-action");
    switch (action) {
      case "set-level":
        setLevel(t.getAttribute("data-level-btn")); break;
      case "open-modal":
        e.preventDefault(); openModal(t.getAttribute("data-modal")); break;
      case "close-modal":
        closeModal(t); break;
      case "enter-staff": {
        var preset = (window.UW_PERMS.presets[t.getAttribute("data-preset")] || window.UW_PERMS.presets.view_only);
        setRole("staff", preset.grants, t.getAttribute("data-staff-name"));
        toast("직원 화면으로 전환했어요. 권한: " + preset.label);
        break;
      }
      case "exit-staff":
        setRole("owner", []); toast("사장님 화면으로 돌아왔어요."); break;
      case "request-perm":
        toast("사장님에게 권한을 요청했어요. 승인되면 알림으로 알려드릴게요."); break;
      case "request-agency":
      case "contact-agency":
        /* G11(27 문서): 토스트 종결 → 요청함으로 실이동 */
        location.href = "27_대행사요청함.html?new=1"; break;
      case "run-proposal":
        toast("좋아요! 제안대로 준비해서 검토함에 넣어둘게요."); closeModal(t); break;
      case "toast":
        toast(t.getAttribute("data-toast-msg") || "준비 중이에요."); break;
    }
  });

  /* ---------- 레벨 스위처 버튼 바인딩 ---------- */
  function initSwitcher() {
    /* 같은 이유로 data-level-btn 버튼에만 set-level 을 심는다.
       예전에는 .uw-lvl-switch 안의 모든 버튼에 심어서, 약관 탭을 누르면
       setLevel(null) 이 돌아 uw_level 이 "null" 로 덮이고 레벨이 L2 로 튕겼다. 청구 전달분 2026-08-29 */
    document.querySelectorAll(".uw-lvl-switch button[data-level-btn]").forEach(function (b) {
      b.setAttribute("data-action", "set-level");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initSwitcher();
    render();
  });

  if (window.matchMedia) {
    var mq = window.matchMedia("(max-width:767px)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(function () { render(); });
  }

  window.UW = { render: render, setLevel: setLevel, currentLevel: currentLevel, reviewMode: reviewMode, setReviewMode: setReviewMode, currentRole: currentRole, setRole: setRole, staffGrants: staffGrants, toast: toast, josa: josa, cancelPending: cancelPending, setCancelPending: setCancelPending };
})();
