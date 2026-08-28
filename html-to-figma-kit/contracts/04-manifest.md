# 04. 매니페스트 계약

**구현은 작업자가 쓴다.** 참고 구현: `examples/admin-v3/scripts/build_manifest.mjs`

매니페스트 하나가 보드 순서·헤더 메타·원천 연결을 정의한다. **배열 순서 = Figma 배치 순서.**

## 최상위

| 필드 | 필수 | 의미 |
|---|---|---|
| `title` | ✔ | 문서 제목 (보드 HTML `<title>`) |
| `viewportWidth` | | 보드 폭. 정책의 `board.width`와 일치해야 한다 |
| `gap` | | 보드 간격·Figma Y 간격. 기본 `120` |
| `sourceDir` | ✔ | static HTML 폴더 (읽기 전용) |
| `policyDir` | ✔ | 정책 문서 폴더 (읽기 전용) |
| `boards[]` | ✔ | 보드 정의 |
| `allowedRemoteHosts` | | 기본 `[]` |

## 보드 필드

| 필드 | 필수 | 의미 |
|---|---|---|
| `label` | ✔ | **고유** 라벨. 파일명·레이어명에 쓰임 (예: `01_회원현황`) |
| `screenId` | ✔ | IA의 Screen ID. 없으면 가안 채번 + 빨강 ※ 기록 |
| `chapter` | ✔ | 헤더 1행 텍스트 |
| `cases[]` | ✔ | Screen Path 줄들 |
| `application` | | 헤더 칩. 생략 시 정책의 `board.application` |
| `sourceFile` | ✔ | static HTML 파일명 |
| `frame` | | `main`(기본) \| `main-crop` \| `general` \| 부속 셀렉터/auxId |
| `ir` | ✔* | IR JSON 경로 (`frame: general`이면 불필요) |
| `general` | ✔* | General 블록 JSON 경로 (`frame: general`일 때만) |
| `descriptions` | ✔ | 디스크립션 JSON 경로 |
| `minHeight` | | 최소 보드 높이 |
| `comment` | | 하단 코멘트 블록 텍스트 |

**경로 기준** — `ir`·`descriptions`·`general`은 **매니페스트 파일 위치 기준** 상대경로. 절대경로도 통과.

## frame 값

| 값 | 디자인 영역에 그리는 것 |
|---|---|
| `main` (기본) | 화면 전체 스크린샷 |
| `main-crop` | `contentRoot` 크롭본 (사이드바·상단바 제외) |
| `general` | 스크린샷 없이 표·텍스트 블록 직접 렌더 |
| 부속 셀렉터/auxId | 해당 부속 프레임 스크린샷 |

## 조립 시 결정해야 할 것

구현이 프로젝트마다 다른 이유가 여기 있다. 각 항목을 어디서 얻을지 정해야 한다.

| 항목 | admin의 방법 | 새 화면군에서 물을 것 |
|---|---|---|
| `chapter` | 화면 HTML의 `<title>`이 정본 | 챕터 정보가 화면 안에 있나, IA에만 있나 |
| `cases` (Screen Path) | 사이드바 활성 항목 + 컨텍스트 부모 매핑 | 내비 구조가 경로를 알려주나. SPA면 라우트 정의를 봐야 할 수도 |
| `screenId` | 가안 채번 (`{접두}-PG-{번호3}`) | IA에 ID 열이 있나 |
| 보드 순서 | IA 챕터 순 | 무엇이 순서의 정본인가 |
| 부속 보드 등재 | IR의 `auxFrames`에서 제외 규칙 적용 후 전량 | 같음 |

## 제외 규칙

정책의 `extraction.auxExclude`가 세 단계로 나뉜다. **차이를 혼동하면 산출물이 틀어진다.**

| 키 | IR에 남나 | 보드가 생기나 | 용도 |
|---|---|---|---|
| `ids` | ❌ 추출 안 함 | ❌ | 프로토타입 헬퍼·템플릿 자동 생성물 |
| `patterns` | ✔ 남음 | ❌ | 화면 내 공통 팝업 인스턴스 (초록 참조로 대체) |
| `manifestOnlyPatterns` | ✔ 남음 | ❌ (단, 별도로 1개 보드) | 여러 화면에 동일 주입되는 공통 팝업. **원천 IR을 지우면 그 1개 보드도 못 만든다** |

`boardExcludeFiles.files`는 화면이 아닌 문서·인덱스 파일을 보드화 대상에서 뺀다.

## 통과 조건

```
□ label 중복 0
□ screenId 중복 0
□ 모든 ir·descriptions·general 경로가 실제 파일을 가리킴
□ viewportWidth = 정책 board.width
□ boards 순서가 의도한 Figma 배치 순서와 일치
□ 제외 규칙 적용 후 남은 보드 수 = 의도한 화면 수 + 부속 수
```

## 증분 작업 시

기존 보드 전량을 재조립하지 않는다. **메타(Chapter/Path/ScreenID)는 기존 매니페스트를 정본으로 재사용**하고 신규분만 새로 채운다. 디스크립션도 신규분에 있으면 신규 경로, 없으면 기존 경로를 그대로 가리켜 **불변 보드를 복제하지 않는다.**
