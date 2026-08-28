# 03. 디스크립션 계약

**구현은 작업자/AI가 쓴다.** 작성 규칙은 [../spec/description-rules.md](../spec/description-rules.md), 도출 절차는 [../spec/policy-mapping.md](../spec/policy-mapping.md), 완성 실례는 `examples/admin-v3/gold/`.

파이프라인에서 **가장 비싼 산출물**이다. 재생성 비용이 높으므로 진입 판정에서 살릴지 말지가 갈린다([../workflow/entry-triage.md](../workflow/entry-triage.md)).

## 스키마

`output/descriptions/<라벨>.json`

```jsonc
{
  "flags": [                       // ※행 — 순서 고정: confirm → reference → common
    { "kind": "confirm",  "text": "휴면 자동 전환 기준 미확정 (OP-12)" },
    { "kind": "reference","text": "업체 정보 수정은 51 업체 상세가 단일 정본" },
    { "kind": "common",   "text": "개인정보 마스킹은 37 정책서 §7 적용" }
  ],
  "requirements": [                // 요구사항 행 (없으면 생략)
    { "id": "R1", "text": "문의한 회원을 즉시 찾는다" }
  ],
  "rows": [
    {
      "no": "1",                   // "1" | "1-1" | "etc"
      "title": "조회조건",          // 굵은 제목 — 컴포넌트/영역명
      "bullets": [
        { "text": "역할 : OWNER | MANAGER | STAFF (default : 선택안함)" },
        { "text": "검색 버튼 : 조회 조건 and 검색", "indent": 1 },
        { "text": "미결 : 검색 이력 보존 여부 (OP-31)", "color": "red" },
        { "text": "엑셀 양식은 회원목록_샘플.xlsx 참조", "color": "green" }
      ],
      "callout": {                 // 디자인 영역 콜아웃 대상
        "type": "region",          // region(⌀26 칩+브래킷) | item(알약 칩)
        "selector": ".filter-bar", // static HTML 기준 셀렉터
        "side": "right",           // (선택) 알약 위치 강제
        "dx": 0, "dy": 0           // (선택) 미세 조정
      }
    },
    {
      "no": "5", "title": "단계 전환", "nocallout": true,
      "bullets": [ { "text": "…" } ]     // 캡처 화면에 없는 상태 서술
    }
  ]
}
```

## 필드 규칙

| 필드 | 필수 | 규칙 |
|---|---|---|
| `flags[].kind` | ✔ | `confirm` \| `reference` \| `common`. 해당 없는 종류는 **행 자체를 생략** |
| `requirements` | | 없으면 키를 빼거나 빈 배열. 요구사항 원천이 없는 프로젝트는 생략 |
| `rows[].no` | ✔ | 빈 값 불가 |
| `rows[].title` | ✔ | 빈 값 불가. 문장 금지, 컴포넌트/영역명 |
| `rows[].bullets` | ✔ | 빈 배열 불가 |
| `bullets[].color` | | `red` \| `green`. 없으면 검정 |
| `bullets[].indent` | | 0~2. 3단 이상은 행을 쪼갠다 |
| `rows[].callout` | ✔* | `nocallout: true`가 없으면 필수 |
| `callout.selector` | ✔ | **IR 트리에 실제로 존재해야 한다.** 없으면 보드 빌드가 경고를 내고 콜아웃이 누락된다 |

**셀렉터 지원 형태** — `#id`, `.a.b`(클래스 AND), `tag.a`. CSS 조합자(`>`, 공백, `:nth-child`)는 지원하지 않는다. 복잡한 위치는 화면에 `id`를 붙이거나 `callout.bbox`로 좌표를 직접 준다.

## 검증

```bash
node <키트>/engine/scripts/lint_descriptions.mjs \
  --dir output/descriptions --report output/reports/lint.md
```

린트가 잡는 것: 문장부호 금칙(`·` `—`), 빈 `no`/`title`/`bullets`, 구조 위반. **린트는 표기만 본다. 내용의 정확성은 잡지 못한다.**

## 통과 조건

```
□ lint_descriptions 통과 (위반 0)
□ 빈 행 0
□ 콜아웃 번호 ↔ 디자인 영역 콜아웃 1:1 (보드 빌드 시 '콜아웃 대상 미발견' 경고 0)
□ 미결 대장의 해당 화면 항목이 빨강 ※행에 누락 없이 반영
□ 화면에 없는 컨트롤을 서술하지 않음 (표본 대조)
```

마지막 항목은 기계로 못 잡는다. 파일럿에서는 전량, 확산 후에는 표본으로 사람이 대조한다.

## 기존 디스크립션이 다른 형식으로 있을 때

변환할지 새로 쓸지는 [../workflow/entry-triage.md](../workflow/entry-triage.md)의 결손 종류 판정을 따른다. 요약:

| 기존 형태 | 결손 종류 | 판정 |
|---|---|---|
| 다른 JSON 스키마 (행·콜아웃은 있음) | 표기 | 변환기 작성 → 이행 |
| 엑셀·마크다운 표 (행 단위는 있으나 콜아웃 대상 없음) | 구조 | 콜아웃 매핑 비용을 파일럿으로 실측 후 판정 |
| 산문 서술 (영역 분해 없음) | 구조 | 재작성 |
| 근거를 추적할 수 없음 | 원천 | 원천 확보 선행 후 재작성 |
