/* ============================================================
   search.js — 검색 · 담기(위시리스트)
   ------------------------------------------------------------
   클래스명·데이터 형태는 전부 CONTRACT.md 를 따른다.
   여기서 새 클래스명을 만들지 않는다.

   알아둘 결정 (코드만 봐서는 이유가 안 보이는 것들):

   - 검색 결과는 .card 가 아니라 .result-card 다. 카카오 결과에는
     작성자도 방문일도 없어서 "진짜 다녀온 사람의 기록" 카피가 걸린
     .card 를 쓰면 그 카피가 그대로 거짓이 된다 (CONTRACT 1.3).
     .result-card-origin 한 줄이 씨드 기록과 카카오 정보를 가르는
     유일한 표시라 생략할 수 없다.

   - 첫 진입에 위치 권한을 요청하지 않는다 (PRD 7.3).
     .search-geo 를 "누른 순간"에만 geolocation 을 부른다.
     거부·실패는 조용히 지역 기준점으로 되돌린다. 에러 화면을 띄우지 않는다.

   - 키가 없어도(503 NO_KEY) 페이지는 전부 동작한다. seed.js 12곳으로
     폴백하고 .state-demo 를 띄운다. 폴백이 예외 경로가 아니라 기본 경로다.

   - 0건 화면을 빈 문구로 끝내지 않는다. PRD 5.2 가 명시적으로 경고한 지점이라
     선택된 칩 해제 · 반경 넓히기 · 검색어 지우기를 버튼으로 같이 준다.

   - 담기는 "가보고 싶다"이지 "다녀왔다"가 아니다. 저장 수를 남에게 보여주지
     않는다. 내가 담은 개수만 표시한다 (CONTRACT 5).
   ============================================================ */

import { CATEGORIES, REGIONS, PLACES } from "./seed.js";
import { metersBetween, walkMinutes, walkMinutesFromMeters, formatDate } from "./geo.js";

const WISHLIST_KEY = "bbaego:wishlist";
const DEBOUNCE_MS  = 300;

/* 반경은 단계로만 넓힌다. 0건일 때 "더 넓게 찾기"가 밟는 사다리다. */
const RADIUS_STEPS = [1000, 2000, 5000, 10000, 20000];

const HOME = REGIONS[0];

const state = {
  q: "",
  cats: new Set(),
  origin: { lat: HOME.lat, lng: HOME.lng },
  originLabel: HOME.label,
  radiusStep: 0,
  demo: false,
  seq: 0            // 늦게 도착한 응답이 최신 결과를 덮어쓰지 않게 하는 요청 번호
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const labelOf   = (code) => (CATEGORIES.find(c => c.code === code) || {}).label || "";
const regionOf  = (code) => (REGIONS.find(r => r.code === code) || {}).label || "";
const radius    = () => RADIUS_STEPS[state.radiusStep];
const radiusText = (m) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);

/* ------------------------------------------------------------
   담은 목록 — localStorage. app.js:submitEmail 과 같은 패턴이다.
   ------------------------------------------------------------ */
function loadWishlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(p => p && p.id) : [];
  } catch {
    return [];   // 손상된 값 하나로 페이지 전체가 멈추지 않게 한다
  }
}

function saveWishlist(list) {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
  } catch {
    /* 사파리 프라이빗 모드 등 — 저장은 실패해도 화면은 계속 돈다 */
  }
}

let wishlist = loadWishlist();
const isSaved = (id) => wishlist.some(p => p.id === id);

function toggleSave(place) {
  if (isSaved(place.id)) {
    wishlist = wishlist.filter(p => p.id !== place.id);
  } else {
    wishlist = [...wishlist, { ...place, savedAt: new Date().toISOString() }];
  }
  saveWishlist(wishlist);
  renderSaved();
  syncSaveButtons();
}

function removeSaved(id) {
  wishlist = wishlist.filter(p => p.id !== id);
  saveWishlist(wishlist);
  renderSaved();
  syncSaveButtons();
}

function syncSaveButtons() {
  document.querySelectorAll(".btn-save").forEach(btn => {
    const on = isSaved(btn.dataset.id);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "담음" : "담기";
  });
}

/* ------------------------------------------------------------
   씨드 폴백 — 키가 없을 때 쓰는 12곳.
   CONTRACT 2절 형태로 맞춰서 내보낸다. 카카오 결과와 같은 코드로 렌더된다.
   ------------------------------------------------------------ */
function seedPlaces() {
  const q = state.q.trim();
  return PLACES
    .filter(p => !q || p.name.includes(q) || (p.note || "").includes(q) || labelOf(p.category).includes(q))
    .map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      categoryLabel: labelOf(p.category),
      region: p.region,
      lat: p.lat, lng: p.lng,
      author: p.author,
      visitedAt: p.visitedAt,
      note: p.note || "",
      photo: "",
      priceRange: p.priceRange ?? null,
      situationTags: p.situationTags || [],
      source: "seed",
      placeUrl: "",
      phone: "",
      roadAddress: "",
      distance: Math.round(metersBetween(state.origin, { lat: p.lat, lng: p.lng }))
    }));
}

/* ------------------------------------------------------------
   서버 호출 — 카카오 원본 필드는 여기까지 오지 않는다 (proxy 가 정규화한다)
   ------------------------------------------------------------ */
async function requestPlaces() {
  const params = new URLSearchParams({
    x: String(state.origin.lng),
    y: String(state.origin.lat),
    radius: String(radius()),
    page: "1"
  });

  let url;
  if (state.q) {
    params.set("q", state.q);
    url = `/api/search?${params}`;
  } else {
    params.set("group", "FD6");
    url = `/api/category?${params}`;
  }

  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw Object.assign(new Error("연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요."), { code: "NETWORK" });
  }

  let body = null;
  try { body = await res.json(); } catch { /* 아래에서 상태 코드로 처리한다 */ }

  if (!res.ok || body?.error) {
    const code = body?.error || (res.status === 503 ? "NO_KEY" : "UPSTREAM");
    // 헤드라인(ERROR_HEAD)은 showError 가 이미 찍는다. 여기 기본값은 "그래서 뭘 하면
    // 되는지"를 말하는 두 번째 줄이다. 같은 문장을 넣으면 화면에 두 번 보인다.
    const message = body?.message || "잠시 뒤에 다시 시도해 주세요.";
    throw Object.assign(new Error(message), { code });
  }
  return Array.isArray(body?.places) ? body.places : [];
}

/* ------------------------------------------------------------
   상태 화면 — .state-loading / .state-empty / .state-error / .state-demo
   ------------------------------------------------------------ */
function clearState() { $("#stateBox").replaceChildren(); }

/* 상태 상자 안에는 t-* 를 쓰지 않는다 — 크기·색은 components.css 의
   .state-* 규칙이 이미 잡아 뒀고, 겹쳐 쓰면 design 의 값을 덮는다. */
function showLoading() {
  const box = el("div", "state-loading");
  box.append(el("p", null, "찾는 중이에요."));
  $("#stateBox").replaceChildren(box);
}

/** 실패 화면의 첫 줄. 두 번째 줄이 이것과 같으면 안 찍는다. */
const ERROR_HEAD = "장소 정보를 불러오지 못했어요.";

function showError(message) {
  const box = el("div", "state-error");
  box.setAttribute("role", "alert");
  box.append(el("p", null, ERROR_HEAD));

  // 서버가 우연히 헤드라인과 같은 문장을 보내도 같은 말이 두 줄로 보이지 않게 한다.
  const detail = String(message || "").trim();
  if (detail && detail !== ERROR_HEAD) box.append(el("p", null, detail));

  const retry = el("button", "btn btn-secondary", "다시 시도");
  retry.type = "button";
  retry.addEventListener("click", () => run());
  box.append(retry);
  $("#stateBox").replaceChildren(box);
}

/**
 * 0건 화면. 빈 문구로 끝내지 않는다 — PRD 5.2 가 경고한 지점이다.
 * 지금 걸려 있는 조건을 하나씩 빼는 버튼을 그대로 붙인다.
 */
function showEmpty() {
  const box = el("div", "state-empty");
  // .state-empty strong 은 design 이 블록 제목으로 잡아 뒀다
  box.append(
    el("strong", null, "이 조건에 맞는 곳이 없어요."),
    el("p", null, "조건을 하나 빼보시겠어요?")
  );

  const action = (text, onClick) => {
    const b = el("button", "btn btn-secondary", text);
    b.type = "button";
    b.addEventListener("click", onClick);
    box.append(b);
    return b;
  };

  [...state.cats].forEach(code => {
    action(`${labelOf(code)} 빼기`, () => {
      state.cats.delete(code);
      syncChips();
      run();
    });
  });

  if (state.q) {
    action("검색어 지우기", () => {
      state.q = "";
      $("#searchInput").value = "";
      run();
    });
  }

  if (state.radiusStep < RADIUS_STEPS.length - 1) {
    const next = RADIUS_STEPS[state.radiusStep + 1];
    action(`${radiusText(next)}까지 넓혀서 찾기`, () => {
      state.radiusStep += 1;
      renderOriginNote();
      run();
    });
  }

  $("#stateBox").replaceChildren(box);
}

/* ------------------------------------------------------------
   결과 카드 — .card 를 절대 재사용하지 않는다 (CONTRACT 1.3)
   ------------------------------------------------------------ */
function metaLine(place) {
  const parts = [];
  const cat = place.category ? labelOf(place.category) : (place.categoryLabel || "");
  if (cat) parts.push(cat);

  const region = regionOf(place.region);
  if (region) parts.push(region);

  // 카카오가 distance 를 주면 그 값을 우선 쓰고, 도보 분 환산만 geo.js 로 한다.
  const minutes = Number.isFinite(place.distance)
    ? walkMinutesFromMeters(place.distance)
    : walkMinutes(state.origin, { lat: place.lat, lng: place.lng });
  if (Number.isFinite(minutes)) parts.push(`도보 ${minutes}분`);

  return parts.join(" · ");
}

/** 씨드 기록과 카카오 정보를 가르는 유일한 한 줄. 선택이 아니라 필수다. */
function originLine(place) {
  if (place.source === "seed" && place.author && place.visitedAt) {
    return `${place.author}의 기록 · ${formatDate(place.visitedAt)}`;
  }
  return "아직 다녀오지 않은 곳 · 카카오 장소 정보";
}

function buildCard(place) {
  const li = el("li", "result-card");

  // 사진이 없으면 스톡 이미지를 넣지 않는다. --line 톤 단색 블록이다 (DESIGN 7.2)
  li.append(el("div", "result-card-photo"));

  const body = el("div", "result-card-body");
  body.append(el("h3", "result-card-title", place.name));
  body.append(el("p", "result-card-meta", metaLine(place)));

  // 주소와 메모를 한 클래스에 섞지 않는다. 한쪽은 기계가 준 위치 정보고,
  // 한쪽은 사람이 쓴 문장이다 (design 이 .result-card-note 를 따로 냈다).
  if (place.roadAddress) body.append(el("p", "result-card-addr", place.roadAddress));
  if (place.note)        body.append(el("p", "result-card-note", place.note));

  body.append(el("p", "result-card-origin", originLine(place)));

  const foot = el("div", "result-card-foot");
  const save = el("button", "btn-save", isSaved(place.id) ? "담음" : "담기");
  save.type = "button";
  save.dataset.id = place.id;
  save.setAttribute("aria-pressed", String(isSaved(place.id)));
  save.setAttribute("aria-label", `${place.name} 담기`);
  save.addEventListener("click", () => toggleSave(place));
  foot.append(save);

  if (place.placeUrl) {
    const link = el("a", "result-card-link", "카카오맵");
    link.href = place.placeUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `${place.name} 카카오맵에서 보기`);
    foot.append(link);
  }

  body.append(foot);
  li.append(body);
  return li;
}

function renderResults(places) {
  const grid = $("#resultGrid");
  if (!places.length) {
    grid.replaceChildren();
    showEmpty();
    $("#resultStatus").textContent = "결과가 없어요.";
    return;
  }
  clearState();
  grid.replaceChildren(...places.map(buildCard));
  $("#resultStatus").textContent = `${places.length}곳 찾았어요.`;
}

/* ------------------------------------------------------------
   담은 목록 패널
   ------------------------------------------------------------ */
function renderSaved() {
  const list = $("#savedList");
  const empty = $("#savedEmpty");
  const count = $("#savedCount");

  list.replaceChildren();
  empty.hidden = wishlist.length > 0;

  // 내가 담은 개수는 사회적 증거가 아니므로 표시해도 된다 (CONTRACT 5 예외)
  count.textContent = wishlist.length ? `${wishlist.length}곳 담았어요.` : "";

  wishlist.forEach(place => {
    const li = el("li", "saved-item");
    li.append(el("span", "saved-item-name", place.name));
    li.append(el("span", "saved-item-meta", metaLine(place)));

    const remove = el("button", "saved-item-remove", "빼기");
    remove.type = "button";
    remove.setAttribute("aria-label", `${place.name} 빼기`);
    remove.addEventListener("click", () => removeSaved(place.id));
    li.append(remove);

    list.append(li);
  });
}

/* ------------------------------------------------------------
   카테고리 칩 — 선택 상태는 aria-pressed 로만 표현한다 (CONTRACT 1.2)
   ------------------------------------------------------------ */
function buildChips() {
  const row = $("#filterRow");
  CATEGORIES.forEach(cat => {
    const b = el("button", "filter-chip", cat.label);
    b.type = "button";                       // 버튼이라 Tab/Enter/Space 가 그대로 동작한다
    b.dataset.code = cat.code;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      if (state.cats.has(cat.code)) state.cats.delete(cat.code);
      else state.cats.add(cat.code);
      syncChips();
      run();
    });
    row.append(b);
  });
}

function syncChips() {
  document.querySelectorAll(".filter-chip").forEach(b => {
    b.setAttribute("aria-pressed", String(state.cats.has(b.dataset.code)));
  });
}

function applyChipFilter(places) {
  if (!state.cats.size) return places;
  return places.filter(p => p.category && state.cats.has(p.category));
}

/* ------------------------------------------------------------
   실행
   ------------------------------------------------------------ */
function setBusy(on) {
  $("#resultsRegion").setAttribute("aria-busy", String(on));
}

function renderOriginNote() {
  $("#originNote").textContent = `${state.originLabel} 기준 · 반경 ${radiusText(radius())}`;
}

async function run() {
  const seq = ++state.seq;
  setBusy(true);
  showLoading();

  try {
    const places = await requestPlaces();
    if (seq !== state.seq) return;             // 더 최신 요청이 이미 떠 있다
    state.demo = false;
    $("#demoBanner").hidden = true;
    renderResults(applyChipFilter(places));
  } catch (err) {
    if (seq !== state.seq) return;

    if (err.code === "NO_KEY") {
      // 키가 없어도 페이지 전체가 동작해야 한다. 폴백은 예외가 아니라 기본 경로다.
      state.demo = true;
      $("#demoBanner").hidden = false;
      renderResults(applyChipFilter(seedPlaces()));
    } else {
      // 실패 화면에 "샘플로 둘러보는 중" 배너가 같이 남으면 둘 다 거짓말이 된다
      state.demo = false;
      $("#demoBanner").hidden = true;
      $("#resultGrid").replaceChildren();
      showError(err.message);
      $("#resultStatus").textContent = "불러오지 못했어요.";
    }
  } finally {
    if (seq === state.seq) setBusy(false);
  }
}

let debounceTimer = 0;
function scheduleRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, DEBOUNCE_MS);
}

/* ------------------------------------------------------------
   위치 — 누른 순간에만 요청한다 (PRD 7.3)
   ------------------------------------------------------------ */
function resetOriginToRegion() {
  state.origin = { lat: HOME.lat, lng: HOME.lng };
  state.originLabel = HOME.label;
  renderOriginNote();
}

function wireGeo() {
  const btn = $("#geoBtn");
  btn.addEventListener("click", () => {
    if (!navigator.geolocation) { resetOriginToRegion(); return; }

    btn.disabled = true;
    $("#originNote").textContent = "위치를 확인하는 중이에요.";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.disabled = false;
        state.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.originLabel = "현재 위치";
        renderOriginNote();
        run();
      },
      () => {
        // 거부·실패는 조용히 되돌린다. 에러 화면을 띄우지 않는다.
        btn.disabled = false;
        resetOriginToRegion();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

function wireSearchBar() {
  const form  = $("#searchBar");
  const input = $("#searchInput");

  input.addEventListener("input", () => {
    state.q = input.value.trim();
    scheduleRun();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(debounceTimer);
    state.q = input.value.trim();
    run();
  });
}

function init() {
  buildChips();
  wireSearchBar();
  wireGeo();
  renderOriginNote();
  renderSaved();
  run();
}

init();
