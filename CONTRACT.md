# CONTRACT.md — 병렬 작업 계약

> 이 문서는 `design` 과 `logic` 두 작업자가 **서로의 파일을 열지 않고도** 같은 화면을 만들기 위한 유일한 접점이다.
> 여기 없는 클래스명·필드명을 임의로 만들지 않는다. 필요하면 코드를 고치지 말고 메인에게 보고한다.

---

## 0. 파일 소유권 — 자기 소유가 아닌 파일은 **읽기만** 한다

> **2026-08-21 개정.** 랜딩(`index.html` S1~S6)과 `assets/app.js` 가 삭제되고 `search.html` 이 `index.html` 로 올라갔다.
> `design` 소유 파일에서 HTML 이 빠졌다 — 남은 유일한 페이지는 `logic` 소유다. 상세는 PRD 4.2.

| 파일 | 소유자 |
|---|---|
| `assets/tokens.css` | **design** |
| `assets/components.css` | **design** |
| `review_design.md` | **design** |
| `index.html` (검색·담기) | **logic** |
| `assets/search.js` | **logic** |
| `api/` (서버리스 함수 + `_lib/`) | **logic** |
| `assets/search.css` (레이아웃 전용) | **logic** |
| `assets/seed.js` | **logic** |
| `assets/geo.js` | **logic** |
| `server/proxy.mjs` | **logic** |
| `CONTRACT.md` · `CLAUDE.md` · `review_prd.md` · `package.json` · `.env.example` · `.gitignore` | **메인** |

**둘 다 git 명령을 실행하지 않는다.** 커밋은 메인이 한다.

---

## 1. 검색 페이지 컴포넌트 클래스

`design` 이 `assets/components.css` 에 **미리** 정의한다. `logic` 은 `index.html` 에서 이 이름만 쓴다.

### 1.1 검색 바
```html
<form class="search-bar">
  <input class="search-input" type="search">
  <button class="search-submit" type="submit">찾기</button>
  <button class="search-geo" type="button">현재 위치로 찾기</button>
</form>
```

### 1.2 카테고리 필터
```html
<div class="filter-row" role="group">
  <button class="filter-chip" aria-pressed="false">한식</button>
</div>
```
- 선택 상태는 **`aria-pressed="true"`** 로만 표현한다. `.is-active` 같은 별도 클래스를 쓰지 않는다.

### 1.3 결과 카드 — `.card` 가 아니라 `.result-card` 다

> **왜 별도 컴포넌트인가:** DESIGN 6.3 과 PRD 10.5 는 `.card` 에 **작성자와 방문일 표기를 의무화**했다.
> "진짜 다녀온 사람의 기록"이라는 카피가 거기 걸려 있다.
> 카카오 로컬 결과에는 작성자도 방문일도 실촬영 사진도 없다. 정의상 다녀온 기록이 아니다.
> 그래서 **검색 결과를 `.card` 로 렌더하면 서비스의 신뢰 카피가 깨진다.** 반드시 `.result-card` 를 쓴다.

```html
<ul class="result-grid">
  <li class="result-card">
    <div class="result-card-photo"></div>          <!-- 사진 없음 → --line 단색 블록 -->
    <div class="result-card-body">
      <h3 class="result-card-title">가게 이름</h3>
      <p class="result-card-meta">한식 · 성수동 · 도보 4분</p>
      <p class="result-card-addr">서울 성동구 …</p>
      <p class="result-card-origin">아직 다녀오지 않은 곳 · 카카오 장소 정보</p>
      <div class="result-card-foot">
        <button class="btn-save" aria-pressed="false">담기</button>
        <a class="result-card-link" href="…" target="_blank" rel="noopener">카카오맵</a>
      </div>
    </div>
  </li>
</ul>
```

- `.result-card-origin` 은 **선택이 아니라 필수**다. 이 한 줄이 씨드 방문기록과 카카오 정보를 가르는 유일한 표시다.
- 담긴 상태는 `.btn-save[aria-pressed="true"]`.

### 1.4 담은 목록 (위시리스트)
```html
<section class="saved-panel">
  <h2 class="saved-title">담은 곳</h2>
  <ul class="saved-list">
    <li class="saved-item">
      <span class="saved-item-name">…</span>
      <span class="saved-item-meta">…</span>
      <button class="saved-item-remove" type="button">빼기</button>
    </li>
  </ul>
</section>
```

### 1.5 상태 화면
```html
<div class="state-loading">…</div>
<div class="state-empty">…</div>
<div class="state-error">…</div>
<div class="state-demo">…</div>   <!-- 카카오 키 없이 시드 폴백 중일 때 -->
```

전체 클래스 목록 (이 밖의 이름 금지):
```
search-bar  search-input  search-submit  search-geo
filter-row  filter-chip
result-grid  result-card  result-card-photo  result-card-body
result-card-title  result-card-meta  result-card-addr
result-card-origin  result-card-foot  result-card-link
btn-save
saved-panel  saved-title  saved-list  saved-item
saved-item-name  saved-item-meta  saved-item-remove
state-loading  state-empty  state-error  state-demo
```
추가 승인 (2026-08-20): `result-card-note` — 시드 폴백일 때 도로명 대신 방문 메모를 담는다. `.result-card-addr` 한 클래스가 두 의미를 갖지 않도록 분리.

**추가 승인 (2026-08-21) — 구글 리뷰 패널 (1.6):**
```
result-card-toggle  result-card-toggle-mark
review-panel  review-panel-status  review-panel-note  review-panel-link
review-rating
review-list  review-item  review-item-head  review-item-author
review-item-text  review-item-link
```

### 1.6 구글 리뷰 패널

가게 이름이 열기 버튼이다. 카드 전체를 클릭 대상으로 삼지 않는다 — 안에 `.btn-save` 와 `.result-card-link` 가 이미 있어 중첩 클릭이 된다.

```html
<h3 class="result-card-title">
  <button class="result-card-toggle" type="button"
          aria-expanded="false" aria-controls="rv-kakao-123">
    가게 이름<span class="result-card-toggle-mark" aria-hidden="true">▾</span>
  </button>
</h3>
...
<div class="review-panel" id="rv-kakao-123" hidden>
  <p class="review-rating">⭐ 4.3 · 리뷰 128</p>
  <ul class="review-list">
    <li class="review-item">
      <p class="review-item-head"><span class="review-item-author">홍길동</span> · ⭐ 5 · 3개월 전</p>
      <p class="review-item-text">…</p>
      <a class="review-item-link" href="…" target="_blank" rel="noopener">이 리뷰 원문</a>
    </li>
  </ul>
  <p class="review-panel-note">구글이 정한 순서로 보여주는 리뷰예요.</p>
  <a class="review-panel-link" href="…" target="_blank" rel="noopener">Google Maps에서 전체 리뷰 보기</a>
</div>
```

- 열림 상태는 **`aria-expanded`** 로만 표현한다. `.is-open` 을 만들지 않는다 (1.2 칩과 같은 규칙).
- 로딩·못 찾음·실패는 전부 `.review-panel-status` 한 클래스로 낸다. `.state-*` 를 재사용하지 않는다 — 그쪽은 결과 영역 전체용이라 padding 이 48px 이다.
- **`.review-item-author` · `.review-item-link` · `.review-panel-note` 는 선택이 아니다.** 구글 정책이 작성자 표기·원본 리뷰 접근·정렬 방식 고지를 요구한다. 지우면 정책 위반이다.
- **리뷰 본문을 자르지 않는다.** `line-clamp` 금지 — 구글이 원문의 변형·절단을 금지한다.
- `Google Maps` 는 이 대소문자 그대로 둔다. 지도 없이 데이터만 쓸 때 요구되는 귀속 표기다.

기존 클래스 중 재사용 가능: `wrap` `section` `section-head` `eyebrow` `btn` `btn-primary` `btn-secondary` `t-h1` `t-h2` `t-body` `t-note` `t-caption` `t-label` `muted` `sr-only`
**+ 추가 승인 (2026-08-20)**: `masthead` `wordmark` `footer` `footer-rows` — 두 페이지가 같은 서비스로 보여야 하므로 `search.html` 도 같은 헤더·푸터 크롬을 썼다. 2026-08-21 랜딩 삭제 후에도 이 크롬은 그대로 남는다 (`masthead-link` 는 랜딩→검색 진입점이었으므로 쓰이지 않는다).

랜딩 전용이던 `.card` `.hero` `.quiz` `.chips` `.cta-form` `.roadmap` `.exclusion-banner` 등은 **더 이상 어떤 페이지도 쓰지 않는다.** `components.css` 에는 규칙이 남아 있지만 계약 대상이 아니다.

---

## 2. 데이터 형태

`server/proxy.mjs` 가 카카오 응답을 **서버에서** 아래 형태로 정규화해 내보낸다.
클라이언트는 카카오 원본 필드명(`place_name`, `road_address_name`, `x`, `y` …)을 알지 못한다.

```js
{
  id:            "kakao-1234567",
  name:          "성수동 백반집",
  category:      "korean",      // CATEGORIES 코드로 매핑, 못 찾으면 null
  categoryLabel: "한식 > 백반",  // 카카오 원문 (표시용)
  region:        "seongsu",
  lat:  37.5443, lng: 127.0551,

  // 카카오 결과는 "다녀온 기록"이 아니다 → 항상 null
  author:    null,
  visitedAt: null,
  note:      "",
  photo:     "",                 // 항상 빈 문자열. 스톡/홍보 사진 금지 (DESIGN 7.2)
  priceRange:    null,
  situationTags: [],

  source: "kakao",               // "kakao" | "seed"  — PRD 8장이 이 용도로 만든 구분자

  // 카카오 전용
  placeUrl:    "http://place.map.kakao.com/1234567",
  phone:       "02-000-0000",
  roadAddress: "서울 성동구 …",
  distance:    320               // m, 기준점에서. 카카오가 주면 그 값
}
```

**규칙: `author` 또는 `visitedAt` 이 `null` 인 객체는 절대 `.card` 로 렌더하지 않는다.** `.result-card` 전용이다.

### 2.1 승인된 계약 변경 (2026-08-20)

| 변경 | 사유 | 승인 |
|---|---|---|
| `region` 이 `null` 일 수 있다 | 기준점이 `REGIONS` 에서 8km 넘게 떨어지면 `null`. "현재 위치로 찾기"로 부산에서 검색한 결과에 "성수동"이 찍히면 메타 줄이 거짓말이 된다. `null` 이면 클라이언트가 지역을 메타 줄에서 뺀다 | ✅ |
| `/api/search` 가 카카오에 `category_group_code=FD6` 를 함께 보낸다 | 안 보내면 "김밥"에 학원·부동산이 섞여 온다. 계약 쿼리 파라미터는 그대로 | ✅ |
| 위시리스트 객체에 `savedAt` 추가 | localStorage 전용, API 응답과 무관 | ✅ |
| 정적 서빙에서 `.md` 제외 | PRD·CONTRACT 를 dev 서버로 뿌릴 이유가 없다 | ✅ |

`assets/seed.js` 의 `PLACES` 는 `source: "seed"` 이고 `author`/`visitedAt` 이 채워져 있다. 폴백으로 쓸 때도 같은 형태로 취급한다.

---

## 3. 프록시 API 계약

| 엔드포인트 | 쿼리 | 응답 |
|---|---|---|
| `GET /api/search` | `q` (필수), `x`, `y`, `radius`(선택), `page` | `{ places: [...], meta: { total, isEnd, page } }` |
| `GET /api/category` | `group` (기본 `FD6`), `x`, `y`, `radius`(기본 1000), `page` | 동일 |
| `GET /api/reviews` | `name`+`x`+`y` (**셋 다 필수**), `address`(선택) · 또는 `placeId` 단독 | 아래 |

**엔드포인트는 로컬과 배포에서 같은 코드다.** 로직은 `api/_lib/` 에 있고, `api/*.js` 가 Vercel 함수 진입점이며, `server/proxy.mjs` 는 개발용으로 그 **같은 함수 객체**를 import 해서 부른다. 한쪽에만 있는 코드 경로를 만들지 않는다.

#### `/api/reviews` — 찾음 (200)
```js
{ found: true,
  place: {
    placeId: "ChIJ…", name: "성수족발",
    rating: 4.3,          // 없으면 null
    reviewCount: 128,     // 없으면 null
    googleMapsUri: "https://…",
    distance: 38,         // m. placeId 로 조회하면 null
    region: "seongsu",    // 8km 밖이면 null (검색 결과와 같은 규칙)
    reviews: [ { id, rating, text, author, authorUri,
                 relativeTime, publishTime, googleMapsUri } ]   // 최대 5
  } }
```

#### `/api/reviews` — 못 찾음 (**200**, 오류가 아니다)
```js
{ found: false, place: null, reason: "NO_MATCH_WITHIN_150M" | "NO_RESULT" }
```

`NO_MATCH_WITHIN_150M` 은 구글이 후보를 줬지만 전부 150m 밖인 경우, `NO_RESULT` 는 후보 자체가 없는 경우다. **둘을 합치지 않는다** — 이름이 안 맞는 것과 구글에 없는 것은 다른 제품 문제다.

**150m 재검사는 서버가 한다.** 구글의 `locationBias` 는 제한이 아니라 편향이라 근처에 없으면 수 km 밖 결과를 그대로 준다. 검사를 빼면 "성수동 좌표 + 영진돼지국밥" 에 부산 가게의 리뷰가 붙는다.

**`radius` 는 두 엔드포인트에서 뜻이 다르다 (2026-08-21 개정).**

- `/api/search` — **안 보내는 게 기본이고, 그러면 전국이다.** 보내면 그 반경으로 좁힌다.
  클라이언트는 보내지 않는다. `x`/`y` 는 계속 보낸다 — 카카오가 지역어 없는 질의는
  기준점 근처로, `"부산 돼지국밥"` 같은 질의는 그 지역으로 알아서 넘긴다.
- `/api/category` — **반경이 본질이다.** "근처에 뭐 있지"를 답하는 엔드포인트이고,
  카카오 카테고리 검색은 반경이 0이면 결과를 주지 않는다. 안 보내면 1000m 로 본다.

에러 응답:

| 상태 | 본문 | 클라이언트 동작 |
|---|---|---|
| `503` | `{ error: "NO_KEY", message: "…" }` | `assets/seed.js` 로 폴백 + `.state-demo` 배너 |
| `400` | `{ error: "BAD_REQUEST", message }` | `.state-error` |
| `502` | `{ error: "UPSTREAM", message }` | `.state-error` |

카테고리 그룹 코드: `FD6` 음식점, `CE7` 카페.

---

## 4. CSS 경계

- `logic` 의 `assets/search.css` 는 **레이아웃 선언만** 쓴다 — `display` `grid-*` `flex-*` `gap` `padding` `margin` `order` `position` `overflow` `width` `height` `aspect-ratio`.
- **금지**: `color` `background*` `border*` `font-*` `letter-spacing` `line-height` `box-shadow` `outline`. 전부 `design` 의 `components.css` 소관이다.
- 값은 반드시 토큰으로 — `var(--space-4)` 를 쓰고 `16px` 를 직접 쓰지 않는다. 색은 `var(--ink)` `var(--ink-muted)` `var(--line)` `var(--surface)` `var(--bg)`.

---

## 5. 어기면 안 되는 규칙 (양쪽 공통)

`review_design.md` 7장 — 권고가 아니라 규칙이다.

- **UI에 유채색 금지.** 예외는 **둘뿐** — 폼 에러용 `--error: #8C4A3F`, 그리고 구글 리뷰 패널 안의 `⭐` 글리프 (2026-08-21, DESIGN 7.3). 카테고리별 색상 부여 금지
- **정량 지표 표시 금지 — 우리 데이터에 한해** (2026-08-21 개정, DESIGN 7.1). 별점 · 리뷰 수 · 방문자 수 · **타인의 저장 수** · 순위. `distance` 를 순위처럼 쓰지 않는다
  - 예외 ①: *내가 담은 목록의 개수* 는 사회적 증거가 아니므로 표시 가능
  - 예외 ②: **구글 리뷰 패널(1.6) 안의 구글 별점·리뷰 수.** 출처가 화면에 드러나는 자리에서만. 카드 메타 줄로 끌어내거나 **정렬·순위 기준으로 쓰는 것은 여전히 금지**
- **`box-shadow` 금지.** 예외는 모달 딤 배경뿐. 계층은 1px `--line` 보더로 낸다
- **명조(`--font-serif`)는 28px 이상에서만.** 버튼·칩·본문·캡션에 쓰지 않는다
- **`font-weight` 는 400 과 600 만**
- **스톡 이미지·홍보 사진 금지.** 사진이 없으면 `--line` 톤 단색 블록
- **커머스 관용구 금지.** 할인·인기·추천 뱃지, "N명이 보는 중" 류 금지
- **결과 영역에 모션 금지.** 정보를 읽고 결정하는 화면이다
- 스크롤 진입 모션은 한 번만, 발동 후 `unobserve`
- 포커스 링을 없애지 않는다. `outline: none` 금지

---

## 6. 브레이크포인트

**375 / 768 / 1440** 으로 통일한다 (CLAUDE.md 지정). 하한 320px 에서 레이아웃이 깨지지 않아야 한다 (PRD 9장).

기존 코드에 남아 있는 599/600/900/1200 은 `design` 이 정리한다.
