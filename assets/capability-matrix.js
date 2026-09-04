/* ============================================================
   capability-matrix.js — 화면 × 모듈 × 레벨 단일 정본
   원본 스펙: planning/23_userweb_ia_capability_matrix.md §6
   규칙 (22 문서 §3):
   - 레벨 누적: L1 ⊂ L2 ⊂ L3 (예외는 levels 배열에 명시)
   - L1에서 제거되는 create/edit는 fallback:"agency-card" → 대체 카드 렌더
   - HTML은 data-module 속성만 갖는다. 노출 판단은 userweb.js가 이 파일로 수행.
   - 수정 권한: P2 확립 후 통합 세션 전용.
   ============================================================ */

window.UW_MATRIX = {
  "UW_HM_01": {
    file: "01_홈.html", title: "홈",
    modules: {
      M01: { name: "인사말·오늘 컨텍스트 헤더", type: "view",    levels: ["L1","L2","L3"] },
      M02: { name: "오늘 할 일 큐",             type: "approve", levels: ["L1","L2","L3"] },
      M03: { name: "이번 주 실행 결과 3타일",    type: "stat",    levels: ["L1","L2","L3"] },
      M04: { name: "상담 전환 현황",             type: "stat",    levels: ["L1","L2","L3"] },
      M05: { name: "최근 알림",                  type: "view",    levels: ["L1","L2","L3"] },
      M06: { name: "AI 마케팅 제안(미리보기)",   type: "preview", levels: ["L1","L2","L3"] },
      M07: { name: "제안 즉시 실행",             type: "create",  levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "제안 실행" },
      M08: { name: "마케팅 계획·리포트 바로가기", type: "view",    levels: ["L1","L2","L3"] },
      M09: { name: "다매장 오늘 할 일 집계",      type: "bulk",    levels: ["L3"] }
    }
  },



  /* ---- 갭 축 C (청구 전달분 2026-08-29) : 어드민 19 구독 현황 · 68 청구 계정 관리 ----
     L3 대행사가 담당 매장 전체의 구독을 청구 그룹(=대행사 명의 BA) 단위로 관리하는 화면.
     단일 매장 청구의 정본은 09_요금제비용(UW_BL_01)이고, 이 화면은 다매장 전용이다. */
  "UW_BL_05": { file: "09_담당매장청구.html", title: "담당 매장 구독·청구",
    modules: {
      M01: { name: "구독 KPI 4종(구독 중·만료 임박·연체·미개시)", type: "stat", levels: ["L3"] },
      M02: { name: "조회조건(요금제·청구 주체·갱신일·검색)", type: "view", levels: ["L3"] },
      M03: { name: "매장별 구독 목록(갱신일·상태·청구 그룹)", type: "view", levels: ["L3"] },
      M04: { name: "청구 그룹 관리(생성·선택 — 그룹 1개 = 청구서 1장)", type: "edit", levels: ["L3"] },
      M05: { name: "그룹별 합산 청구서 미리보기", type: "view", levels: ["L3"] },
      M06: { name: "세금계산서 발행 현황", type: "view", levels: ["L3"] },
      M07: { name: "요금제 변경·청구 그룹 이동(대행사 직접 실행)", type: "edit", levels: ["L3"] }
    } },

  /* 청구 그룹 상세. UW_BL_05 그룹 카드의 [상세]에서 ?g=BA-xxxx 로 들어온다.
     데이터는 assets/billing-store.js 를 UW_BL_05 와 공유한다(두 화면이 다른 답을 주지 않게). */
  "UW_BL_07": { file: "09_청구그룹상세.html", title: "청구 그룹 상세",
    modules: {
      M01: { name: "그룹 요약(매장 수·요금제 구성·월 합산) + 그룹 정보 수정", type: "view", levels: ["L3"] },
      M02: { name: "청구 정보(사업자·결제 방식·담당자 — 마스킹 G-08)", type: "view", levels: ["L3"] },
      M03: { name: "청구 그룹 매장 목록(요금제·시작일·갱신일·월 금액)", type: "view", levels: ["L3"] },
      M04: { name: "매장 일괄 옮기기(다른 청구 그룹으로)", type: "bulk", levels: ["L3"] },
      M05: { name: "이번 달 합산 청구서 미리보기", type: "view", levels: ["L3"] },
      M06: { name: "청구·세금계산서 이력", type: "view", levels: ["L3"] },
      M07: { name: "그룹 없애기(매장 0곳일 때만)", type: "edit", levels: ["L3"] }
    } },

  /* ---- 갭 축 D (청구 전달분 2026-08-29) : 어드민 54 수동 정산 원장 대응 ----
     대행사가 자기 수수료 명세를 받아보는 화면. **조회 전용**이다.
     수수료 산정·확정·지급은 전부 어드민 54의 운영자 수동 처리이고(자동 산정 도입 금지),
     확정된 귀속월은 재수정하지 않는다(회계 불변성). 이의는 차월 조정 라인으로만 반영되므로
     M07 도 '수정 요청'이 아니라 '문의'다. */
  "UW_BL_06": { file: "09_대행사정산.html", title: "정산·수수료",
    modules: {
      M01: { name: "귀속월 선택·귀속월 상태", type: "view", levels: ["L3"] },
      M02: { name: "정산 요약(순거래액·수수료·조정·정산금)", type: "stat", levels: ["L3"] },
      M03: { name: "산정 근거 메모(어드민 입력값 조회)", type: "view", levels: ["L3"] },
      M04: { name: "조정·반제 라인(6종·증빙·사유)", type: "view", levels: ["L3"] },
      M05: { name: "매장별 순거래액 내역(원장 스냅샷 분해)", type: "view", levels: ["L3"] },
      M06: { name: "지급 이력(지급일·이체 참조번호)", type: "view", levels: ["L3"] },
      M07: { name: "정산 문의(차월 조정으로 반영)", type: "create", levels: ["L3"] }
    } },

  /* ---- P-B·P-C 신규 화면 (27 문서 G8~G12, 잠정: U13 기간만료 해지 · U11 수신거부=BC 모듈) ---- */
  "UW_BL_02": { file: "25_요금제변경.html", title: "요금제 변경", ownerOnly: true,
    modules: {
      M01: { name: "요금제 비교(3종, 정본가)", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "변경 확정(다음 결제일 적용)", type: "edit", levels: ["L2","L3"], fallback: "tbd-card",
             fallbackName: "요금제 변경" },
      M03: { name: "구독 취소 시작·되돌리기(2026-08-28 09_요금제비용에서 이전)", type: "edit", levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "구독 취소",
             note: "매장구조_회원정책.md §6: L1 위탁은 셀프 취소 불가, 담당 대행사를 거쳐야 함" }
    } },
  "UW_BL_03": { file: "24_해지.html", title: "구독 취소", ownerOnly: true,
    modules: {
      M01: { name: "현재 이용 요약·잃게 되는 것 안내", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "구독 취소 사유 선택(코드화 — 어드민 66 리포트 원천)", type: "edit", levels: ["L2","L3"] },
      M03: { name: "기간 만료 취소 안내·되돌리기(OD-U13 잠정)", type: "view", levels: ["L1","L2","L3"] },
      M04: { name: "구독 취소 실행", type: "edit", levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "구독 취소",
             note: "매장구조_회원정책.md §6(2026-08-28): L1 위탁은 셀프 취소 불가, 담당 대행사를 거쳐야 함" }
    } },
  "UW_BL_04": { file: "26_결제문제.html", title: "결제 문제 안내", ownerOnly: true,
    modules: {
      M01: { name: "결제 실패 안내 배너", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "연체 단계 안내(dunning_stage — 08 부록 A 정본)", type: "view", levels: ["L1","L2","L3"] },
      M03: { name: "다시 결제하기", type: "edit", levels: ["L2","L3"], fallback: "tbd-card", fallbackName: "다시 결제" },
      M04: { name: "결제 수단 변경·도움 바로가기", type: "view", levels: ["L1","L2","L3"] }
    } },
  "UW_MY_05": { file: "27_대행사요청함.html", title: "대행사 요청함",
    // 2026-08-26 재설계: 요청 목록(여러 스레드)+새 요청 모달을 없애고 대행사와의 대화 하나로 통합.
    // L2는 대행사 자체가 없어 이 화면 기능을 아예 못 씀(이전엔 levels에 L2가 포함돼 있어서
    // L2에서도 대화 UI가 '지금은 직접 이용 중이에요' 카드와 함께 노출되는 버그가 있었음, 이번에 수정)
    modules: {
      M01: { name: "대행사와의 대화(챗 버블)", type: "view", levels: ["L1","L3"] },
      M02: { name: "메시지 보내기(사진 첨부)", type: "create", levels: ["L1","L3"],
             exception: "L1 핵심 기능(대체 카드의 목적지) — L1/L3 허용" }
    } },
  "UW_MY_06": { file: "28_오류.html", title: "오류·안내",
    modules: {
      M01: { name: "오류 상태 카드(404·권한 없음·세션 만료·점검)", type: "view", levels: ["L1","L2","L3"] }
    } },

  /* ---- P-A 신규 화면 (27 문서 G1~G7, 권한 매트릭스 §5 정본) ---- */
  "UW_ON_02": { file: "21_로그인.html", title: "로그인",
    modules: {
      M01: { name: "로그인 폼(휴대폰 인증·카카오·네이버)", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "비밀번호 재설정·계정 찾기", type: "view", levels: ["L1","L2","L3"] },
      M03: { name: "초대 가입 안내", type: "view", levels: ["L1","L2","L3"] }
    } },
  /* 청구 전달분 2026-08-29 정합 교정: HTML(21_회원가입.html · UW_ON_05)만 있고 매트릭스에 없어
     render()가 조기 반환 → 레벨 전환·data-bind·data-only-level 이 전부 죽어 있었다. */
  "UW_ON_05": { file: "21_회원가입.html", title: "회원가입",
    modules: {
      M01: { name: "역할 선택(사장님 / 직원·대행사)", type: "view", levels: ["L1","L2","L3"], exception: "가입 전 화면 — 전 레벨" },
      M02: { name: "본인 확인(이름·휴대폰 SMS·중복 차단)", type: "create", levels: ["L1","L2","L3"], exception: "가입 전 화면 — 전 레벨" },
      M03: { name: "사업자번호 확인·기존 매장 분기(v20)", type: "create", levels: ["L1","L2","L3"], exception: "가입 전 화면 — 전 레벨" },
      M04: { name: "약관 동의(필수 2·선택 1)", type: "view", levels: ["L1","L2","L3"] },
      M05: { name: "계정 설정(이메일·비밀번호)", type: "create", levels: ["L1","L2","L3"], exception: "가입 전 화면 — 전 레벨" },
      M06: { name: "가입 완료·온보딩 안내", type: "view", levels: ["L1","L2","L3"] },
      M07: { name: "직원·대행사 초대코드 안내(19로 유도)", type: "view", levels: ["L1","L2","L3"] }
    } },
  /* 청구 전달분 2026-08-29 정합 교정: HTML 은 있었으나 body data-screen 이 임시 ID(UW_TEST_REG)라
     매트릭스와 물리지 않았다. 파일 머리말이 선언한 UW_ST_08 로 정정하고 등재. */
  "UW_ST_08": { file: "98_매장설정.html", title: "매장 정보 설정",
    modules: {
      M01: { name: "스텝1 네이버 플레이스 불러오기", type: "create", levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "매장 정보 설정" },
      M02: { name: "스텝2 기본 정보·운영시간·매장 소개 확인", type: "create", levels: ["L2","L3"] },
      M03: { name: "스텝3 채널 연결", type: "create", levels: ["L2","L3"] },
      M04: { name: "스텝4 자료 올리기(선택)", type: "create", levels: ["L2","L3"] }
    } },
  "UW_ON_03": { file: "19_초대가입.html", title: "초대 가입",
    modules: {
      M01: { name: "초대 확인(초대자·역할 표시)", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "본인 인증(SMS)", type: "create", levels: ["L1","L2","L3"], exception: "가입 전 화면 — 전 레벨" },
      M03: { name: "약관·개인정보·마케팅 수신 동의", type: "view", levels: ["L1","L2","L3"] },
      M04: { name: "비밀번호 설정·가입 완료", type: "create", levels: ["L1","L2","L3"], exception: "가입 전 화면 — 전 레벨" }
    } },
  "UW_MY_04": { file: "22_약관정책.html", title: "약관·정책",
    modules: {
      M01: { name: "약관 문서 탭(이용약관·개인정보·마케팅 수신)", type: "view", levels: ["L1","L2","L3"] }
    } },
  "UW_MY_03": { file: "23_내계정.html", title: "내 계정",
    modules: {
      M01: { name: "프로필 조회", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "프로필 수정(이름·연락처)", type: "edit", levels: ["L1","L2","L3"], exception: "본인 계정 — 전 레벨 허용" },
      M03: { name: "비밀번호 변경", type: "edit", levels: ["L1","L2","L3"], exception: "본인 계정 — 전 레벨 허용" },
      M04: { name: "바로가기(알림 설정·요금제)", type: "view", levels: ["L1","L2","L3"] },
      M05: { name: "로그아웃", type: "view", levels: ["L1","L2","L3"] },
      M06: { name: "회원 탈퇴(매장 대표면 차단)", type: "edit", levels: ["L1","L2","L3"], exception: "본인 계정 — 전 레벨 허용. 2026-08-27 신설, 매장 해지(24_해지)와 별개 개념" }
    } },
  "UW_ST_07": { file: "20_함께쓰는사람.html", title: "함께 쓰는 사람", ownerOnly: true,
    modules: {
      M01: { name: "직원 목록(상태·역할·편집승인권한)", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "직원/사장님 초대(SMS, 역할+편집승인권한+번호 검증)", type: "create", levels: ["L1","L2","L3"], exception: "대표 고유 업무 — L1 허용",
             note: "대표가 아직 없는 매장(매니저만 있음)에 한해 역할 카드에 '사장님'이 추가로 노출" },
      M03: { name: "권한 편집(역할+편집승인권한 단일 토글)+직원 해지", type: "edit", levels: ["L1","L2","L3"], exception: "대표 고유 업무 — L1 허용" },
      M05: { name: "초대 취소(대기 중인 초대만)", type: "edit", levels: ["L1","L2","L3"], exception: "대표 고유 업무 — L1 허용" }
    },
    note: "2026-09-02: M04(직원 화면 미리보기) 삭제 — ownerOnly 화면이라 미리보기 진입 즉시 자기 자신의 사장님 전용 잠금에 걸려 제대로 동작하지 않던 오버스펙 기능이었음. 직원 해지(완전 삭제, 17_직원관리와 동일 방식)를 M03에 추가 — 이전엔 이미 합류한 직원을 내보낼 방법이 아예 없었음" },
  "UW_ST_09": { file: "99_매장자료관리.html", title: "매장 자료 관리",
    modules: {
      M01: { name: "사진 관리(플레이스 수집+직접 업로드 구분)", type: "edit", levels: ["L2","L3"] },
      M02: { name: "메뉴판 관리", type: "edit", levels: ["L2","L3"] },
      M03: { name: "소개 문서 관리", type: "edit", levels: ["L2","L3"] }
      /* M04 기타 자료 관리 — 2026-09-03 화면에서 섹션을 없애면서 함께 제거 */
    } },
  "UW_ST_10": { file: "06_우리매장정보_수정.html", title: "매장 정보 수정",
    modules: {},
    note: "2026-08-31 신설. 06_우리매장정보의 전용 수정 화면(단일 폼이라 data-module 미사용, LNB data-bind 정상 동작을 위해 등록만)" },

  /* ---- P3 예약 화면 (§6 매트릭스 요약 — 각 Wave에서 모듈 상세 구현) ---- */
  "UW_CR_01": { file: "02_콘텐츠검토.html",   title: "콘텐츠 검토",   planned: "W1",
    modules: {
      M01: { name: "검토 대기 리스트", type: "view", levels: ["L1","L2","L3"],
             note: "2026-09-02: content.view 권한 요건 삭제 — 조회는 직원 편집·승인 권한과 무관하게 항상 가능(20_함께쓰는사람 §개편)" },
      M02: { name: "본문 미리보기·검색 노출 점수", type: "preview", levels: ["L1","L2","L3"] },
      M03: { name: "승인·반려(사유)", type: "approve", levels: ["L1","L2","L3"], perm: "content.approve" },
      M04: { name: "처리 이력·발행 완료", type: "view", levels: ["L1","L2","L3"] },
      M05: { name: "직접 편집", type: "edit", levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "직접 편집·AI 다시 쓰기", perm: "content.create",
             note: "2026-09-03: 라벨 '문구 수정' → '직접 편집'. 실제 편집기는 아직 미구현(토스트만)" },
      M06: { name: "AI 다시 쓰기", type: "create", levels: ["L2","L3"], perm: "content.create" }, /* 대체 카드는 인접 M05에 통합 (24 §3) */
      M07: { name: "일괄 검수·발행 등록 큐(모드B 위임형 전용)", type: "bulk", levels: ["L3"] },
      M08: { name: "검수 방식 표시·설정 바로가기(06에서 설정)", type: "view", levels: ["L3"] },
      M09: { name: "등록·발행 완료 처리(URL 입력 후 확인)", type: "bulk", levels: ["L3"],
             note: "발행 API 없음: 검수 통과분을 채널에 직접 등록→URL 입력→완료. 2026-09-03: L2 제외(셀프는 '승인 완료'가 종착점이고 발행으로 간주) + 완료 처리 시 발행 URL 입력 모달 추가(네이버 블로그만 필수, 당근마켓은 URL 개념이 달라 생략)." }
    } },
  "UW_CR_02": { file: "02_발행이력.html",   title: "발행 이력",   planned: "W1",
    modules: {
      M01: { name: "발행·반려 전체 이력(필터·검색)", type: "view", levels: ["L1","L2","L3"] }
    } },
  "UW_CT_01": { file: "03_콘텐츠만들기.html", title: "콘텐츠 만들기", planned: "W1",
    modules: {
      M01: { name: "위저드 안내", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "AI 초안 미리보기", type: "preview", levels: ["L1","L2","L3"] },
      M03: { name: "스텝1 소식 유형", type: "create", levels: ["L2","L3"], fallback: "agency-card", fallbackName: "콘텐츠 만들기", perm: "content.create" },
      M04: { name: "스텝2 한 줄 입력", type: "create", levels: ["L2","L3"], perm: "content.create" },
      M05: { name: "스텝3 채널 선택·생성", type: "create", levels: ["L2","L3"], perm: "content.create" },
      M06: { name: "승인 완료(즉석)·다시 쓰기·직접 수정", type: "create", levels: ["L2","L3"], perm: "content.create",
             note: "2026-09-03: 여러 매장 동시 생성(구 M07) 제거. 즉석 생성은 07 마케팅계획의 스케줄 자동생성(→02 콘텐츠검토 큐)과 별개 경로 — 승인권자가 나 자신(L2, L3+검수모드B)이면 큐 없이 바로 승인 완료, 승인권자가 따로 있으면(L3+검수모드A=사장님) 승인 요청" },
      M08: { name: "생성 옵션(이번 글 한정 조정, 인라인)", type: "advanced", levels: ["L2","L3"],
             note: "2026-09-03: 모달 → ③ 채널 선택 카드 안 인라인으로 전환, L3 전용에서 L2도 포함하도록 확장. 말투·길이 정본은 16 마케팅전략상세 — 여기선 그 요약만 보여주고, '이번 글만 다르게' 체크했을 때만 가벼운 오버라이드(말투·길이·매장 소재 키워드 중 선택)를 받음. 정본 값을 다시 입력받는 게 아니라서 ①②③ 같은 번호는 안 붙임" }
    } },
  "UW_BC_01": { file: "04_비즈챗문자.html",   title: "비즈챗 문자",   planned: "W1",
    modules: {
      M01: { name: "이번 달 발송 현황", type: "stat", levels: ["L1","L2","L3"] },
      M02: { name: "AI 발송 제안 미리보기", type: "preview", levels: ["L1","L2","L3"] },
      M03: { name: "최근 발송 결과", type: "view", levels: ["L1","L2","L3"] },
      M04: { name: "승인하고 예약 / 다음에", type: "approve", levels: ["L1","L2","L3"], perm: "bizchat.approve" },
      M05: { name: "문구 수정", type: "edit", levels: ["L2","L3"], perm: "bizchat.register" }, /* 대체 카드는 M06에 통합 (24 §3) */
      M06: { name: "새 문자 만들기·직접 발송", type: "create", levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "새 문자 만들기·문구 수정", perm: "bizchat.register" },
      M07: { name: "문자 충전", type: "edit", levels: ["L2","L3"] },
      M08: { name: "다매장 일괄 발송", type: "bulk", levels: ["L3"] },
      M09: { name: "발송 대상 세그먼트 상세", type: "advanced", levels: ["L3"] },
      M10: { name: "수신거부 목록(자동 반영 안내)", type: "view", levels: ["L1","L2","L3"],
             note: "OD-U11 잠정: 자동 반영=시스템, 목록 조회=사용자웹" }
    } },
  "UW_CB_01": { file: "05_AI챗봇.html",       title: "AI 챗봇",       planned: "W1",
    modules: {
      M01: { name: "이번 주 챗봇이 한 일(KPI 4타일·전주 대비 증감)", type: "stat", levels: ["L1","L2","L3"] },
      M02: { name: "사장님 확인 필요 리스트", type: "view", levels: ["L1","L2","L3"] },
      M03: { name: "챗봇이 아직 모르는 질문 Top5", type: "view", levels: ["L1","L2","L3"],
             note: "OD-U10(2026-07-29): fallback 답변으로 넘어간 질문 모음. '답변 실패' 대신 긍정적으로 프레이밍. OD-U14(2026-08-02): CTA를 전 레벨 요청 기반으로 통일(L1=대행사에 알리기, L2·L3=지식 추가 요청하기) — 직접 편집 아님" },
      M04: { name: "전화하기·답변 보내기·직접 채팅", type: "create", levels: ["L1","L2","L3"],
             exception: "OD-U28(2026-08-08 확정): 손님과의 1:1 채팅(답변하기)은 대행사(L3) 불가 — 사장님(L1·L2)만 실제 응대. L3는 모듈 자체는 보되(모니터링) 버튼이 '🔔 사장님께 알림 보내기'로 자동 치환됨(화면 JS 분기, 매트릭스 레벨 노출과 별개)" },
      M05: { name: "챗봇 수정 요청하기(자유 텍스트 + 진행 중인 요청 현황)", type: "edit", levels: ["L1","L2","L3"], perm: "bot.config",
             note: "OD-U21(2026-08-06): 카테고리 열람 카드였던 걸 완전히 걷어내고 자유 텍스트 요청 입력창 + 진행 상황(구 M15)만 남김 — L1은 대행사 경유, L2는 관리자 직행, L3는 L1 요청 릴레이 또는 셀프 요청. 전 레벨 실접근(fallback 폐지) — 대행사뿐 아니라 사장님도 직접 요청을 남길 수 있어야 하므로. M15(관리자에게 요청한 수정 사항 현황)를 이 모듈로 흡수·삭제." },
      M06: { name: "참고 문서(읽기 전용)", type: "view", levels: ["L1","L2","L3"],
             note: "OD-U21에서 업로드 흐름 부재로 삭제됐다가 OD-U25(2026-08-08)로 부활 — '우리 매장 정보 > 매장 자료' 탭에서 '챗봇에서 활용' 체크·해제·삭제된 파일을 관리자가 '자료 반영' 미션(OD-U26)에서 RB Dialog에 실제로 반영해야 상태가 바뀜(MATERIAL_FILES.status: pending_add=신규 체크·아직 미노출 / reflected=반영 완료·노출 중 / pending_replace=파일 교체됨·관리자가 바꿔치기 전까지 옛 내용 그대로 노출 유지 / pending_remove=체크 해제·삭제됨·관리자가 RB에서 뺄 때까지 계속 노출). 체크·수정·해제는 매장 자료 탭 몫, 이 화면은 조회 전용." },
      M08: { name: "챗봇 개설·컨펌(수명주기)", type: "approve", levels: ["L1","L2","L3"],
             exception: "개설 요청·1차/2차 확인·발행은 사장님 고유 업무 — 전 레벨 표시 (L3는 제작 현황 카드). OD-U20(2026-08-05, 선임 매니저 회의 확정): RB Dialog 수동 등록·훈련·PRD 배포는 대행사가 아니라 SKP 관리자(비즈플래닛 어드민) 몫으로 확정 — L3도 L2와 동일하게 초안 제출 후 '관리자가 확인 중' 대기 화면만 보고, RB Dialog에 직접 반영하지 않음(기존 #cb-l3-rb-checklist·PRD 배포 버튼 삭제)" },
      M10: { name: "운영 중인 챗봇 링크", type: "view", levels: ["L1","L2","L3"] },
      M11: { name: "챗봇 제작(예상 질문·답변·웰컴메시지·웰컴버블)", type: "create", levels: ["L2","L3"],
             note: "OD-U9(2026-07-22, 선임 피드백): L2 셀프=사장님이 직접 전 과정 제작 / L3 대행사=L1 요청 건을 여기서 직접 제작(어드민 챗봇 설정 생성기 대체). L1은 완성본만 S2에서 확인. OD-U14(2026-08-02): Knowledge·Agent 직접 편집 폐지 — 우리 매장 정보를 바탕으로 백단에서 시스템 프롬프트를 자동 생성하고, 화면에는 예상 질문·답변(FAQ) 미리보기만 노출, 틀린 답변은 수정 요청만 가능. OD-U18(2026-08-03, 재변경): L2는 빌더 3단계를 L3와 동일하게 그대로 쓰되, 마지막 웰컴 버블 단계의 완료 버튼이 '제작 요청(관리자에게 요청)'으로 바뀜 — 관리자가 확인·완성한 뒤 다시 사장님에게 넘어와 S2 확인 단계로 이어짐(L3처럼 즉시 자기 완결되지 않음). OD-U20(2026-08-05): L3의 완료 버튼도 '초안 제출(관리자에게 요청)'으로 통일 — RB Dialog 반영은 더 이상 L3가 직접 하지 않음. 발행 후 재편집('관리' 진입, builderContext=manage)에서도 '훈련하기'/'배포하기' 버튼을 '수정 내용 확인하기'/'관리자에게 반영 요청하기'로 변경 — 실제 훈련·배포는 여전히 관리자 몫" },
      M12: { name: "챗봇 버전 배너", type: "view", levels: ["L1","L2","L3"],
             note: "OD-U14(2026-08-02): '마지막 훈련·마지막 배포' 문구 제거 — 사장님이 바로 이해할 수 있는 '챗봇은 O월 O일에 업데이트되었어요'로 단순화, 전 레벨(L1 포함). OD-U27(2026-08-08): '현재 LIVE 버전 + LIVE 배포일' + 업데이트 히스토리 모달로 확장 — deploy·livefix·material 완료 시 관리자가 입력한 버전명·수정 내용(UPDATE_HISTORY)이 쌓임. 문제 발생 시 '몇 버전에서 이슈가 있는지' 서로 짚기 쉽게 하려는 목적. S2/S4는 아직 배포 전이라 버전 비노출." },
      M13: { name: "고객들이 많이 물어본 질문 Top5(주별·월별)", type: "stat", levels: ["L1","L2","L3"],
             note: "OD-U12(2026-08-01): '아직 모르는 질문'(M03, 답변 실패 케이스)과 별개 — 실제로 잘 응답한 인기 질문 랭킹. 주별/월별 전환 가능" },
      M14: { name: "상담 이력 전체 조회(AI 자동응답·사장님 답변 구분)", type: "view", levels: ["L1","L2","L3"],
             note: "OD-U14(2026-08-02): 챗봇이 오픈한 뒤 지금까지의 모든 대화를 확인 — 대시보드 카드(최근 3건) + 전체보기 모달, AI 자동응답과 사장님 직접 답변을 뱃지로 구분" },
      M16: { name: "예약 확인(날짜·인원·연락처 확정/거절)", type: "approve", levels: ["L1","L2","L3"],
             note: "OD-U29(2026-08-11 신규): 예약 처리 방식이 '시나리오형'(RESERVATION_MODE)인 매장에만 노출 — 링크형(네이버 플레이스)·없음은 카드 자체가 안 뜸. 문의(M02)와 성격이 달라 카드를 분리했고, 연락처는 문의와 달리 필수(확정 결과를 전달해야 하므로). 대행사(L3)는 M04와 동일하게 직접 확정 불가 — 버튼이 '🔔 사장님께 알림 보내기'로 자동 치환(화면 JS 분기)" }
    } },
  "UW_ST_01": { file: "06_우리매장정보.html", title: "우리 매장 정보", planned: "W2",
    modules: {
      M01: { name: "AI 이해도 게이지", type: "stat", levels: ["L1","L2","L3"] },
      M02: { name: "기본 정보·영업 시간·메뉴 조회", type: "view", levels: ["L1","L2","L3"] },
      M03: { name: "우리 가게 말투·강조점 조회", type: "view", levels: ["L1","L2","L3"] },
      M04: { name: "정보 수정", type: "edit", levels: ["L2","L3"], fallback: "agency-card" },
      M05: { name: "채널 연결 관리(주소·연결하기)", type: "edit", levels: ["L2","L3"] },
      M06: { name: "매장 자료 요약(건수·최근 등록일)·사진 추가", type: "create", levels: ["L2","L3"],
             note: "2026-09-02: 실제 배점표와 안 맞던 '+8%' 배지 삭제, 자료 건수·최근 등록일 요약으로 교체" }, /* 대체 카드는 인접 M05에 통합 (24 §3) */
      M07: { name: "매장 정보 일괄 관리", type: "bulk", levels: ["L3"] },
      M08: { name: "마케팅 전략 상세 진입", type: "advanced", levels: ["L3"] },
      M09: { name: "AI 학습 현황 진입 + 마지막 학습일", type: "view", levels: ["L1","L2","L3"],
             note: "2026-09-02: 우측 사이드바 전용 카드였던 걸 게이지 배너(M01) 안 버튼으로 이동 — 별도 카드는 없앰" },
      M10: { name: "마케팅 전략 미리보기(말투·강점) + 마케팅 전략 상세 보기", type: "view", levels: ["L1","L2"] }
    } },
  "UW_PL_01": { file: "07_마케팅계획.html",   title: "마케팅 계획",   planned: "W2",
    modules: {
      M01: { name: "AI 월 계획 요약 배너", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "월 캘린더", type: "view", levels: ["L1","L2","L3"] },
      M03: { name: "일정 상세 미리보기", type: "preview", levels: ["L1","L2","L3"] },
      M05: { name: "조정하기(빼기·옮기기)", type: "edit", levels: ["L2","L3"], fallback: "agency-card" },
      M07: { name: "다매장 계획 일괄 적용", type: "bulk", levels: ["L3"] },
      M08: { name: "제안 주기 설정(주당 블로그·문자 월 제안 횟수)", type: "advanced", levels: ["L2","L3"],
             note: "2026-09-02: '계획 룰'에서 개명. AI 학습 주기 요약도 이 화면 캘린더 상단에 같이 노출되지만 그건 15_AI학습현황 소관 읽기전용이라 이 모듈 밖(별도 행)" }
    } },
  "UW_RP_01": { file: "08_실행결과리포트.html", title: "실행 결과 리포트", planned: "W2",
    modules: {
      M01: { name: "AI 한 줄 해석 배너", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "KPI 4타일", type: "stat", levels: ["L1","L2","L3"] },
      M03: { name: "주차별 차트", type: "stat", levels: ["L1","L2","L3"] },
      M04: { name: "반응 좋았던 콘텐츠", type: "view", levels: ["L1","L2","L3"] },
      M05: { name: "월 전환·리포트 저장", type: "view", levels: ["L1","L2","L3"] },
      M06: { name: "다매장 비교 리포트", type: "bulk", levels: ["L3"] },
      M07: { name: "원지표 상세", type: "advanced", levels: ["L3"] }
    } },
  /* 청구 전달분 2026-08-29 : L1·L2 의 청구 정본은 이 화면이다.
     UW_BL_05(담당 매장 구독·청구)는 L3 다매장 전용으로 두고, 단일 매장 청구는 여기로 모았다.
     진입 경로가 이미 6곳(23 내계정·07·08·24·25·26)이라 새로 뚫지 않아도 사장님이 도달한다. */
  "UW_BL_01": { file: "09_요금제비용.html",   title: "요금제·비용",   planned: "W2",
    modules: {
      M01: { name: "현재 요금제 카드", type: "view", levels: ["L1","L2","L3"] },
      M07: { name: "다음 청구 예정일·금액", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "이번 주기 사용량(G-12 표 6 — 캘린더 월 아닌 청구 주기)", type: "stat", levels: ["L1","L2","L3"] },
      M03: { name: "결제·영수 내역(영수일·금액·수단·영수증)", type: "view", levels: ["L1","L2","L3"] },
      M04: { name: "결제 수단 변경", type: "edit", levels: ["L2","L3"],
             note: "L1 위탁은 대행사가 대납해 바꿀 결제 수단이 없다. 2026-08-29 tbd-card 제거 — 안내는 M05 대체 카드 한 장으로 모음(24 §3 인접 통합)" },
      M05: { name: "요금제 변경·문자 충전", type: "edit", levels: ["L2","L3"], fallback: "agency-card",
             fallbackName: "요금제 조정",
             note: "OD-U2(2026-07-07)의 tbd-card 를 2026-08-29 agency-card 로 교체. L1 은 대행사에 요금제 조정을 요청하는 것이 실제 동선이고, TBD 배지는 사장님 화면에 노출할 문구가 아니다" },
      M08: { name: "이용 해지 안내(24 해지로 연결)", type: "edit", levels: ["L2"] },
      M06: { name: "다매장 청구 통합(UW_BL_05 진입)", type: "bulk", levels: ["L3"] }
    } },
  "UW_ON_01": { file: "10_온보딩.html",       title: "온보딩",        planned: "W2",
    modules: {
      M01: { name: "랜딩 가치 제안·로그인", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "스텝1 가게 정보", type: "create", levels: ["L2","L3"], note: "OD-U1: L1 확인형 온보딩" },
      M03: { name: "스텝2 채널 연결", type: "create", levels: ["L2","L3"] },
      M04: { name: "스텝3 AI 학습 시작", type: "create", levels: ["L2","L3"] },
      M05: { name: "학습 완료·홈 안내", type: "view", levels: ["L1","L2","L3"] },
      M06: { name: "확인형 온보딩(대행사 등록 정보 확인)", type: "view", levels: ["L1"],
             exception: "L1 전용 — 셀프가입 없음(02 정책), OD-U1 잠정안(a) 확인형 목업" }
    } },
  "UW_MY_01": { file: "11_도움말.html",       title: "도움말",        planned: "W3",
    modules: {
      M01: { name: "가이드·FAQ", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "문의하기", type: "create", levels: ["L1","L2","L3"], exception: "전 레벨 허용 (23 §6)" }
    } },
  "UW_MY_07": { file: "11_자주묻는질문.html", title: "자주 묻는 질문", planned: "W3",
    modules: {
      M01: { name: "카테고리 필터·검색·FAQ 목록", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "문의하기", type: "create", levels: ["L1","L2","L3"], exception: "전 레벨 허용 (23 §6, 11과 동일)" }
    } },
  "UW_ST_02": { file: "12_매장목록.html",     title: "매장 목록",     planned: "W3",
    modules: {
      M01: { name: "필터", type: "view", levels: ["L3"] },
      M02: { name: "매장 테이블", type: "view", levels: ["L3"] },
      M03: { name: "매장 컨텍스트 전환", type: "view", levels: ["L3"] },
      M04: { name: "일괄 작업", type: "bulk", levels: ["L3"] }
    } },
  /* UW_ST_03(13_업체관리)·UW_ST_04(14_직원관리): OD-U3 결정(2026-07-07)으로
     admin-v2(어드민)에 이관 — 사용자웹 13·14번 결번(재사용 금지). 상세: 23 §5.2·§9.4 */
  "UW_ST_05": { file: "15_AI학습현황.html", title: "AI 학습현황", planned: "W3",
    modules: {
      M09: { name: "학습 재료 요약(매장정보·매장자료·채널 콘텐츠)", type: "view", levels: ["L2","L3"],
             note: "2026-08-31: capability-matrix 미등록으로 화면에서 안 보이던 실제 버그였음(발견/수정). 2026-09-01: L1은 학습 자체를 대행사가 관리하므로(topbar.sub 참조) 학습 재료 타일도 노출 대상에서 제외" },
      M02: { name: "학습 현황(상태 기반 단일 뷰)", type: "view", levels: ["L1","L2","L3"] },
      M03: { name: "수집된 콘텐츠 보기", type: "preview", levels: ["L1","L2","L3"] },
      M04: { name: "다시 학습하기", type: "create", levels: ["L2","L3"], fallback: "agency-card", perm: "ai.run" },
      M06: { name: "학습 콘텐츠 선택·AI 작성 의심 관리", type: "advanced", levels: ["L3"] },
      M07: { name: "수집 범위·주기·다매장 일괄", type: "advanced", levels: ["L3"] }
    } },
  "UW_ST_06": { file: "16_마케팅전략상세.html", title: "마케팅 전략 상세", planned: "W3",
    modules: {
      M01: { name: "매장 분석", type: "advanced", levels: ["L3"] },
      M02: { name: "글쓰기 스타일", type: "advanced", levels: ["L3"] },
      M03: { name: "이미지 스타일", type: "advanced", levels: ["L3"] },
      M04: { name: "유사 업체 비교", type: "advanced", levels: ["L3"] },
      M05: { name: "재학습·이전 학습으로 되돌리기·근거 보기(학습일 포함)", type: "advanced", levels: ["L3"],
             note: "2026-09-03: '초기화'(최초 분석값 복귀)를 폐기하고 '재학습'(직접 수정 안 한 값만 최신 콘텐츠 기준 재분석)으로 교체, 1단계 되돌리기 버튼 추가. 전 탭 공통(헤더 고정)" }
    } },
  "UW_ST_11": { file: "16_유사업체비교.html", title: "유사업체 비교", planned: "W3",
    modules: {
      M01: { name: "비교할 업체 선택(AI 자동 추천)", type: "view", levels: ["L3"] },
      M02: { name: "발행 활동 비교표", type: "view", levels: ["L3"] },
      M03: { name: "콘텐츠 소재 비교", type: "view", levels: ["L3"] }
    } },
  "UW_HM_02": { file: "17_대행사홈.html",     title: "대행사 홈",     planned: "W3",
    modules: {
      M01: { name: "담당 매장 KPI", type: "stat", levels: ["L3"] },
      M02: { name: "오늘 처리할 일 큐", type: "view", levels: ["L3"] },
      M03: { name: "요주의 매장 카드", type: "view", levels: ["L3"] },
      M04: { name: "발행 예정 목록", type: "view", levels: ["L3"] }
    } },
  "UW_HM_03": { file: "17_요청관리.html", title: "요청 관리", planned: "W3",
    // 2026-08-26 재설계: 매장당 여러 요청 항목 → 매장당 대화 하나로 통합. 완료 처리 수동 버튼 삭제,
    // 답변 필요/답변함은 마지막 발화자로 자동 계산. 답장에 사진 첨부 추가
    modules: {
      M01: { name: "담당 매장별 대화 목록(필터·검색)", type: "view", levels: ["L3"] },
      M02: { name: "매장 대화 조회(대행사 관점)", type: "view", levels: ["L3"] },
      M03: { name: "답장 보내기(사진 첨부)", type: "edit", levels: ["L3"] }
    } },
  "UW_HM_04": { file: "17_직원관리.html", title: "직원 관리", planned: "W3",
    modules: {
      M01: { name: "소속 직원 목록·검색·초대", type: "view", levels: ["L3"] },
      M02: { name: "선택 직원 상세·담당 매장·승인권한 토글", type: "view", levels: ["L3"] },
      M03: { name: "배정 변경 이력", type: "view", levels: ["L3"] }
    } },
  "UW_HM_05": { file: "01_홈_미결제.html", title: "홈 (미결제)", planned: "W1",
    modules: {},
    note: "2026-08-28: data-screen이 UW_TEST_PAY로 남아 매트릭스 미등록 상태였던 걸 발견/수정 — data-bind(ownerName/persona)가 항상 플레이스홀더로만 보이던 실제 버그였음. 화면 자체는 data-module을 안 써서(레벨 분기는 .pay-pane 전용 스크립트가 직접 처리) modules 없음" },
  "UW_MY_02": { file: "18_알림센터.html",     title: "알림 센터",     planned: "W3",
    modules: {
      M01: { name: "알림 리스트", type: "view", levels: ["L1","L2","L3"] },
      M02: { name: "알림 설정", type: "edit", levels: ["L2","L3"], fallback: "agency-card" }
    } }
};

/* ============================================================
   UW_MOCK — 프로토타입 목데이터
   정본 규칙: 엔티티(매장·업체·대행사·요금제)는
   prototype/admin-v2/assets/mock-entities.json 값과 일치해야 한다.
   ⚠ 시안의 ₩99,000은 mock-entities Basic ₩39,000과 충돌 → mock 우선 (OD-U8).
   ⚠ 사용자웹 신규 지표(검토 대기 수 등)는 08 부록 A 선등재 대상 (OD-U4).
   ============================================================ */
/* ============================================================
   UW_COPY — 레벨별 카피 매트릭스 (단일 정본)
   지침 (23 §10.3 승격): 같은 화면이라도 "수행 주체"가 레벨마다 다르므로
   문구가 달라야 한다.
   - L1 위탁 사장님: 승인자. 실행(등록·발송)은 대행사가 한다 → "승인하면 대행사가 ~해드려요"
   - L2 셀프 사장님: 승인자+시스템 자동 실행 → "승인하면 자동으로 ~돼요"
   - L3 대행사 직원: 검수·등록 실무자. 최종단에서 직접 등록하고 확인 후 완료 처리
     → "검수 후 사장님에게 승인을 요청하세요", "등록 확인 후 완료 처리하세요"
   사용: HTML에 data-copy="키" → userweb.js가 레벨에 맞는 문구로 치환.
   {ownerName} {persona} {agencyName} 플레이스홀더 지원. 키 누락 레벨은 L2 폴백.
   ============================================================ */
window.UW_COPY = {
  "UW_HM_01": {
    "greeting.title": {
      L1: "{ownerName}, 안녕하세요",
      L2: "{ownerName}, 안녕하세요",
      L3: "{persona}" },
    "greeting.caption": {
      L1: "2026년 7월 7일 화요일 · 오늘도 가게가 잘 되도록 도와드릴게요",
      L2: "2026년 7월 7일 화요일 · 오늘도 가게가 잘 되도록 도와드릴게요",
      L3: "2026년 7월 7일 화요일 · {ownerName}님이 담당하는 매장이에요 (78곳 중)" },
    "hero.title": {
      L2: "검토를 기다리는 콘텐츠가 3건 있어요",
      L3: "검수할 콘텐츠가 3건 있어요" },
    "hero.cta": { L2: "지금 검토하기 →", L3: "지금 검수하기 →" },
    "hero.foot": {
      L1: "승인하시면 대행사 {agencyName}가 확인 후 올려드려요",
      L2: "승인하면 채널에 직접 올릴 수 있는 등록 대기로 이동해요",
      L3: "검수를 마치면 다음 단계로 진행돼요" },
    "plan.desc": {
      L1: "이번 달 예정 9건 · 그대로 두시면 대행사가 일정에 맞춰 진행해요",
      L2: "이번 달 예정 9건 · 그대로 두면 일정에 맞춰 자동 진행돼요",
      L3: "이번 달 예정 9건 · 일정에 따라 자동 생성됩니다. 검수 후 승인 요청해주세요" }
  },
  "UW_CT_01": {
    /* 2026-09-03: submit.btn·submit.toast 삭제 — 이제 승인권자(레벨+검수모드)에 따라 갈리는 값이라
       data-copy(레벨만 구분)로는 표현이 안 돼서 화면 스크립트의 selfApproves()/refreshSubmitButton()로 이동함 */
    "topbar.sub": {
      L2: "고르기만 하면 AI가 글을 써드려요",
      L3: "만든 콘텐츠는 검수 후 사장님에게 승인 요청돼요" }
  },
  "UW_BC_01": {
    "topbar.sub": {
      L1: "AI 발송 제안이 <b style=\"color:var(--blue)\">1건</b> 도착했어요",
      L2: "AI 발송 제안이 <b style=\"color:var(--blue)\">1건</b> 도착했어요",
      L3: "AI 발송 제안 <b style=\"color:var(--blue)\">1건</b> 검수 후 승인 요청이 필요해요" },
    "approve.btn": {
      L1: "✓ 승인하고 예약",
      L2: "✓ 승인하고 예약",
      L3: "✓ 검수 완료 · 사장님에게 승인 요청" },
    "approve.toast": {
      L1: "승인했어요. 토요일 오전 11시에 발송되고, 대행사 {agencyName}가 결과까지 챙겨드려요.",
      L2: "승인했어요. 토요일 오전 11시에 자동 발송돼요.",
      L3: "사장님에게 승인을 요청했어요. 승인되면 예정일에 자동 발송돼요." }
  },
  "UW_ST_01": {
    "gauge.caption": {
      L1: "바뀐 정보가 있으면 대행사 {agencyName}에 알려주세요 — 확인 후 반영해 드려요",
      L2: "메뉴 사진을 추가하면 더 좋은 글이 나와요",
      L3: "정보가 최신인지 확인하고, 빈 곳을 채워주세요" }
  },
  "UW_PL_01": {
    "banner.desc": {
      L1: "대행사가 대신 관리해요. 조정 없이 이 일정 그대로 진행돼요. 구체적인 글 주제는 발행 며칠 전에 정해져요",
      L2: "조정하지 않으면 이 일정 그대로 진행돼요. 구체적인 글 주제는 발행 며칠 전에 AI가 정해요",
      L3: "조정하지 않으면 이 일정 그대로 진행돼요. 사장님도 같은 화면을 보고 있어요" }
  },
  "UW_BL_01": {
    "topbar.sub": {
      L1: "대행사가 어떤 요금제로 얼마를 내고 있는지 확인하세요",
      L2: "언제든 바꾸거나 해지할 수 있어요",
      L3: "이 매장의 요금·사용량 현황이에요" }
  },
  "UW_ST_05": {
    "topbar.sub": {
      L1: "채널과 학습은 대행사가 관리해요 — 현황을 보여드려요",
      L2: "AI가 우리 가게를 계속 배우고 있어요",
      L3: "채널 상태를 점검하고, 필요하면 다시 학습시키세요" }
  },
  "UW_CB_01": {
    "escalation.caption": {
      L1: "\"사장님께 문의하기\"로 들어온 손님이에요",
      L2: "\"사장님께 문의하기\"로 들어온 손님이에요",
      L3: "손님이 직접 요청한 상담이에요 — 사장님이 바로 답할 수 있게 확인해 주세요" },
    "setup.foot": {
      L1: "요청하시면 담당 대행사 {agencyName}가 사장님 가게에 맞는 챗봇을 만들어드려요",
      L2: "이름만 정하면 우리 매장 정보로 AI가 알아서 만들어드려요. 확인 후 관리자에게 제작을 요청하세요",
      L3: "사장님이 아직 요청 전이라면, 대신 챗봇 만들기를 시작할 수도 있어요" },
    "s1.desc": {
      L1: "{agencyName}가 우리 매장 정보를 바탕으로 챗봇을 만들고 있어요. 보통 2~3일 걸려요.",
      L2: "관리자가 확인하고 있어요. 완료되면 알려드릴게요.",
      L3: "요청을 확인했다면 아래에서 챗봇 개설을 시작해 주세요." }
  },
  "UW_CR_01": {
    /* topbar.sub·approve.btn 은 02 화면 스크립트에서 레벨+검수모드에 따라 동적으로 세팅한다
       (자동/예약 발행 표현 제거 — 네이버 블로그·당근 모두 승인 후 직접 등록 방식). */
  }
};


/* ============================================================
   UW_PERMS — 직원(소호 유저) 권한 모델 (27 §5 권한 매트릭스 정본)
   기본 O(부여 불필요, 권한 무관하게 항상 가능): AI 학습 조회 · 콘텐츠 조회 · 비즈챗 캠페인 조회 ·
     챗봇 내역 조회 · 챗봇 응대(CB M04)
   "권한시" 항목만 카탈로그화. 2026-09-02: 8항목 개별 토글 + 프리셋 3종(응대만/검토+응대/전체)을
     "편집·승인 권한" 단일 토글로 축소(20_함께쓰는사람 §개편) — 문자·챗봇·콘텐츠 전 영역에서
     "권한 있으면 편집·승인 가능, 없으면 조회만" 한 가지 규칙으로 통일. content.view는 이 개편을
     계기로 조회 자체를 막을 수 없는 항목이라 판단해 카탈로그에서 빼고 기본 O로 이동.
     bot.material은 실제로 연결된 화면이 없던 죽은 항목이라 같이 삭제.
   렌더 규칙: role=staff이고 모듈 perm이 미부여면 "권한 필요" 카드 (userweb.js)
   ※ 역할(매니저/운영자)은 이 권한 모델과 별도 축 — 매장구조_회원정책.md §3, 함께쓰는사람_정책.md 참조
   ============================================================ */
window.UW_PERMS = {
  catalog: {
    "ai.run":          "AI 다시 학습시키기",
    "content.create":  "콘텐츠 만들기",
    "content.approve": "콘텐츠 승인·반려",
    "bizchat.register":"문자 만들기·수정",
    "bizchat.approve": "문자 발송 승인",
    "bot.config":      "챗봇 응대 설정"
  },
  presets: {
    view_only:    { label: "읽기 전용", grants: [] },
    edit_approve: { label: "편집·승인", grants: ["ai.run","content.create","content.approve","bizchat.register","bizchat.approve","bot.config"] }
  }
};

window.UW_MOCK = {
  levels: {
    L1: {
      label: "L1 위탁",
      persona: "카페봄봄 신촌점",           // mock-entities STR-0008
      ownerName: "카페봄봄 사장님",
      realName: "박서연",                   // 23 내계정 전용 — 실명(2026-08-26 추가, 그 외 화면은 ownerName 유지)
      avatarInitial: "박",
      email: "seoyeon.park@gmail.com",
      affiliations: [ { name: "카페봄봄 신촌점", type: "store", role: "대표", status: "이용중" } ], // status: 매장구조_회원정책.md §1 활성 상태(2026-08-28 추가 — §5 탈퇴 차단이 활성 매장 대표에게만 적용되도록)
      plan: "Basic",                        // STR-0008.plan
      planPrice: "39,000",                  // mock-entities plans.Basic (정본 — OD-U8 결정: 시안 99,000 아님)
      subStatus: "만료 임박",                // STR-0008.sub_status
      renewal: "2026-09-02",                // STR-0008.renewal (청구 전달분 2026-08-29 기준 정본화. UW_BL_05 L3 목록의 카페봄봄 신촌점과 같은 날짜)
      billingNote: "업체 통합 결제 · 대행사 경유", // CO-0088.billing_type
      agencyName: "마케팅파트너스",          // CO-0088.agency (AGN-002)
      stores: ["카페봄봄 신촌점"]
    },
    L2: {
      label: "L2 셀프",
      persona: "피자나라 홍대점",           // mock-entities STR-0044 (대행사 없음 = 직접 이용)
      ownerName: "피자나라 사장님",
      realName: "김도윤",
      avatarInitial: "김",
      email: "doyoon.kim@gmail.com",
      affiliations: [ { name: "피자나라 홍대점", type: "store", role: "대표", status: "이용중" } ],
      plan: "Pro",                          // STR-0044.plan
      planPrice: "89,000",                  // plans.Pro (정본)
      subStatus: "정상",
      renewal: "2026-09-12",                // 청구 전달분 2026-08-29 기준 정본화
      billingNote: "매장 개별 결제",
      agencyName: null,
      stores: ["피자나라 홍대점"]
    },
    L3: {
      label: "L3 대행사",
      persona: "스시오마카세 강남점",        // 현재 선택된 매장 컨텍스트 (STR-0001) — L3 화면은 항상 "어느 매장인지" 명시
      ownerName: "김마케",                   // AGN-002 직원 페르소나(2026-08-31: 직함이 이름에 섞여있던 걸 분리 — 역할은 realName과 별개로 각 화면에서 배지로 노출)
      realName: "김마케",
      avatarInitial: "김",
      email: "kim.market@partners.co.kr",
      // 회원정책(매장구조_회원정책.md) 1:N 매핑 예시 — 대행사 직원이면서 동시에 별도 매장의 대표일 수 있음
      affiliations: [
        { name: "마케팅파트너스", type: "agency", role: "매니저" },
        { name: "김마케 김밥집", type: "store", role: "대표", status: "이용중" }
      ],
      plan: "Pro",                          // STR-0001.plan
      planPrice: "89,000",                  // plans.Pro (정본)
      subStatus: "정상",                     // STR-0001.sub_status
      renewal: "2026-09-20",                // STR-0001.renewal (청구 전달분 2026-08-29 기준 정본화. UW_BL_05 L3 목록의 스시오마카세 강남점과 같은 날짜)
      billingNote: "업체 통합 결제 (BA-0102-01)", // CO-0102.billing_type
      agencyName: "마케팅파트너스",          // AGN-002
      stores: ["스시오마카세 강남점", "스시오마카세 판교점", "카페봄봄 신촌점"], // AGN-002 산하 (CO-0102, CO-0088)
      storeTotal: 78                        // AGN-002.stores
    }
  },
  staff: [
    // 2026-09-02: preset(응대만/검토+응대/전체) → role(매니저/운영자) + canEdit(편집·승인 권한)로 개편.
    // 이름에 직함을 섞지 않음(17_직원관리와 동일 정리 — 역할은 이름 옆 배지로만 표시)
    // phone은 실제 번호(초대 검증 매칭용)로 저장 — 화면(20_함께쓰는사람)에서 표시할 때만 가운데 4자리를 마스킹
    { name: "김하나", phone: "01055551234", role: "매니저", canEdit: true,  since: "2026-05-02", status: "이용 중" },
    { name: "박지훈", phone: "01055565678", role: "운영자", canEdit: false, since: "2026-06-20", status: "이용 중" }
  ],
  home: {
    reviewPending: 3,
    week: { blogPublished: 8, blogDelta: "+2", bizchatSent: 480, bizchatLimit: 1000, chatbotConsults: 18, chatbotReserved: 6, chatbotContact: 4 },
    conversion: { rate: "33.7%", reserved: 6, unhandled: 1 },
    proposals: [
      { icon: "👥", title: "여름 단골 재방문 쿠폰 문자", desc: "최근 2개월 방문한 단골 320명에게 · 예상 발송 320건",
        preview: "사장님의 단골 손님께 — 무더운 여름, 시원한 신메뉴로 다시 모실게요! 이 문자를 보여주시면 여름 세트를 할인해 드려요. (7/31까지)" },
      { icon: "✏️", title: "여름 신메뉴 소개 블로그 글 초안", desc: "제철 재료 신메뉴 출시 소식 · 네이버 블로그용",
        preview: "무더운 여름이 찾아왔습니다. 이번 시즌 새롭게 선보이는 여름 한정 메뉴를 소개해 드리려고 해요. 제철 재료의 풍미를 그대로 담았습니다…" }
    ],
    alerts: [
      { color: "var(--red)",     text: "블로그 콘텐츠 3건이 검토를 기다려요",            time: "방금 전" },
      { color: "var(--blue)",    text: "여름 재방문 문자 제안이 도착했어요",              time: "1시간 전" },
      { color: "var(--green)",   text: "블로그 글 발행이 완료됐어요",                     time: "어제" },
      { color: "var(--ink-300)", text: "비즈챗 문자 480건 발송 완료 (성공률 96%)",        time: "3일 전" }
    ],
    l3Todo: { total: 12, byStore: [ { store: "스시오마카세 강남점", n: 5, warn: false },
                                    { store: "스시오마카세 판교점", n: 3, warn: false },
                                    { store: "카페봄봄 신촌점", n: 4, warn: true } ] }
  }
};
