# 적응 가이드 — 새 화면군에 붙이기

이 키트는 **범용 실행기가 아니다.** 파이프라인의 구조와 계약을 주고, 인풋 상황에 맞춰 AI가 변형해 쓰는 물건이다. 이 문서가 그 변형의 지침이다.

## 0. 순서

```
1. 프로브 실행       무엇을 가졌는지 기계로 확인
2. 진단표 채우기      §2 — 공란 금지, 모르면 '모름'으로 기재
3. 정책 작성         adapters/board-policy.template.json → board-policy.json
4. 원천 슬롯 배정      spec/policy-mapping.md §1
5. 진입 판정         workflow/entry-triage.md — 게이트별 방침 선언
6. 파일럿 1~3건       선언을 실측으로 검증
7. 확산              workflow/gates.md
```

**3번을 건너뛰면 admin-v3 기본값이 조용히 적용된다.** 어댑터는 값이 없으면 admin 값으로 동작하도록 만들어져 있다. 편의를 위한 것이지 승인이 아니다.

## 1. 프로브

```bash
node <키트>/engine/scripts/probe_inputs.mjs \
  --screens <화면 HTML 폴더> \
  --descriptions <기존 디스크립션 폴더 (있으면)> \
  --sample 3 --out output/reports/probe.md
```

정책 파일이 없어도 동작한다. 리포트가 §2 진단표의 재료를 항목별로 준다.

**리포트에 "읽을 수 없는 스타일시트" 경고가 있으면** CSS 통계는 과소 집계다. `01-static` 변환을 먼저 끝내고 다시 돌린다. 이 경고를 무시하면 "토큰이 없는 화면"으로 오독하게 된다.

## 2. 진단표

프로브 리포트를 보며 채운다. **공란을 남기지 않는다.** 모르면 `모름`이라고 쓰고 그것을 확인 과제로 남긴다.

| # | 진단 항목 | 확인처 | 바꾸는 것 |
|---|---|---|---|
| 1 | 편집 정본이 있나, 자산이 외부 참조인가 | 프로브 §7 | `01-static` 구현 (인라인 대상·사전 렌더 대상) |
| 2 | CSS 변수 체계 | 프로브 §2 | `tokens.groups` |
| 3 | 본문 컨테이너 셀렉터 | 프로브 §3 | `extraction.domContract.contentRoot` |
| 4 | 오버레이(모달·드로어) 패턴 | 프로브 §4 | `domContract.overlay*`, `extraction.auxFrameSelectors` |
| 5 | 기본 액션 버튼 클래스 | 프로브 §5 | `domContract.primaryActionSelectors`, `formSubmitSelectors` |
| 6 | 부속을 여는 트리거 | 화면 마크업 | `domContract.triggerGroups`, `namedTriggers` |
| 7 | 프로토타입 전용 블록 | 화면 마크업 | `extraction.boardStrip.selectors` |
| 8 | 반복 컴포넌트 후보 | 프로브 §6 | `componentPromotion.variantClasses`, `exclude` |
| 9 | 원격 호스트 | 프로브 §7 | `extraction.allowedRemoteHosts` |
| 10 | 정책 원천 문서 체계 | 사람에게 물음 | 원천 슬롯 배정표 (`spec/policy-mapping.md` §1) |
| 11 | IA·Screen ID 체계 | IA 문서 | `naming.screenIdScheme` |
| 12 | 애플리케이션 칩 문구 | 화면군 정의 | `board.application` |
| 13 | 화면 폭 → 디자인 영역 폭 | 프로브 §1·§3 | `board.designWidth`, `board.width` |
| 14 | 화면군 식별자 | 정하기 | `naming.projectLabel`, `variableCollection`, `component` |
| 15 | **뷰포트 수** | 프로브 §8 | **§5 참조 — 미설계 영역** |

### 진단표 기재 예 (사용자웹 프로브 실측)

이 키트를 만들며 `prototype/userweb-v2-responsive_codex`(52화면)에 프로브를 실제로 돌린 결과다. 형식 참고용.

| # | 관찰 | 결정 |
|---|---|---|
| 1 | `assets/userweb.css` 등 외부 CSS 3건 참조 | static 변환 필요 |
| 3 | `div.uw-main` 1203×996 / 별도 화면군에 `main.nu-main` | **셸 체계가 2종이다.** 단일 `contentRoot`로 안 잡힌다 — 확인 과제 |
| 4 | `div.uw-modal-backdrop`, `div.uw-modal` | `overlayFlexSelector: .uw-modal-backdrop` |
| 15 | 미디어쿼리 0건이나 외부 CSS 미판독으로 신뢰 불가 | static 변환 후 재측정 |

3번 관찰이 이 키트가 프로브를 두는 이유를 보여준다. **화면군 안에 셸 체계가 둘 있다는 것은 문서를 읽어서는 안 나오고, 화면군을 둘로 나눠 각각 정책을 둘지 하나로 통일할지가 작업 초반의 갈림길이다.**

## 3. 정책 작성

```bash
cp <키트>/adapters/board-policy.template.json ./board-policy.json
```

`TODO` 표시를 전량 해소한다. 채워진 실례는 `examples/admin-v3/board-policy.json`.

**바꾸지 않는 것** — `colors` 전량, `board.descriptionWidth`(420), 헤더 규격. UID 보드 템플릿 자체는 화면군과 무관하다([spec/board-template.md](spec/board-template.md)).

## 4. 어댑터를 포크해야 하는 경우

`adapters/extract_ir.mjs`는 설정으로 조정하는 것이 원칙이다. 아래에 해당하면 설정으로 안 되고 포크가 필요하다.

| 상황 | 왜 설정으로 안 되나 |
|---|---|
| Shadow DOM | `document.querySelectorAll`이 뚫지 못한다 |
| 라우팅형 SPA (화면 = URL) | 화면당 파일 1개 전제가 깨진다 |
| `:root` 밖의 스코프 CSS 변수 | 토큰 카탈로그 수집 범위를 넓혀야 한다 |
| Canvas·WebGL 렌더 영역 | DOM 트리로 표현되지 않는다 |
| 셸 체계가 여러 종 | `contentRoot` 하나로 안 잡힌다. 화면군을 나누거나 셀렉터 배열로 확장 |

포크할 때는 **`adapters/` 안에서 파일명을 바꿔 복사**하고, 무엇을 왜 바꿨는지 파일 상단 주석에 남긴다.

## 5. 다중 뷰포트 — 미설계 영역

**이 키트는 단일 뷰포트를 전제로 만들어졌다.** admin은 데스크톱 하나뿐이라 문제가 없었다. 반응형 화면군에 적용하려면 **보드 규격 결정이 선행 과제**이고, 그 결정은 이 키트에 없다.

결정해야 할 4가지는 [spec/board-template.md](spec/board-template.md) §7에 정리돼 있다. 요약하면:

1. 뷰포트별 보드 분리 vs 한 보드 병치
2. 콜아웃 번호를 뷰포트 간 공유할 것인가
3. 뷰포트 간 차이를 어디에 적을 것인가
4. IR을 뷰포트별로 뽑을 것인가 (매니페스트가 그것을 가리켜야 한다)

**권고** — 1번을 먼저 정하고 **파일럿 1화면으로 실물을 만들어 본 뒤** 나머지를 정한다. 문서상으로 결정하면 반드시 어긋난다.

영향을 받는 지점:

| 대상 | 어떻게 |
|---|---|
| `board.designWidth`·`width` | 병치면 뷰포트 폭 합계 + 여백 |
| `naming.screenIdScheme` | 분리면 뷰포트 축이 ID에 들어가야 한다 |
| `extract_ir.mjs` | 뷰포트마다 실행 → IR 파일이 뷰포트 수만큼 |
| 매니페스트 | 보드 1개가 IR 여러 개를 가리키거나, 보드가 뷰포트 수만큼 늘어난다 |
| 디스크립션 | 공유면 1벌, 분리면 뷰포트 수만큼 |

## 6. 자주 하는 실수

| 실수 | 결과 |
|---|---|
| 정책 없이 어댑터 실행 | admin 기본값이 적용돼 조용히 잘못된 IR이 나온다 |
| static 변환 전에 IR 추출 | 토큰 매핑률 0에 가깝게 나오고 원인을 못 찾는다 |
| 매핑률 게이트를 낮춰서 통과 | Figma Variables 바인딩이 비어 색 하나 바꿔 전 화면 반영이 안 된다 |
| `auxExclude`의 세 키를 혼동 | 공통 팝업 보드가 통째로 사라지거나 화면마다 중복 생성된다 |
| 콜아웃 셀렉터를 나중에 | 보드가 안 나온다. G3에서 전량 되돌아온다 |
| 사용자 수정본의 모든 손질을 디스크립션 규칙으로 해석 | 화면 원본·캡처 설정 문제를 엉뚱한 곳에서 고친다 |

## 7. 비파괴 경계

**읽기만 하는 것** — 원본 화면 HTML, 정책 문서, IA, `.fig`/`.pdf`, 이 키트 자체
**쓰는 곳** — 작업자의 `output/` 아래

원본을 고쳐야 하면(예: `#태그` 지시로 버튼 추가) **사본을 만들어 고친다.** 사본이 그 화면의 최신본이 되고 원본은 이전 상태 기록으로 남는다.
