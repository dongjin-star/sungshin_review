/* ============================================================
   랜딩페이지 로직 — 원본 index.html 인라인 스크립트에서 추출
   동작은 원본과 동일하다. 데이터는 seed.js, 거리·날짜는 geo.js.
   ============================================================ */
import { SERVICE_NAME, CATEGORIES, REGIONS, PLACES } from "./seed.js";
import { walkMinutes, formatDate } from "./geo.js";

const MAX_PICKS   = 3;   // PRD 7.2 — 복수 선택 최대 3개
const MAX_RESULTS = 5;   // PRD S3  — 많이 주는 게 아니라 좁혀주는 게 목적
const NO_MEMORY   = "__nomemory__";

const state = {
  categories: new Set(),
  region: REGIONS[0].code
};

const $  = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls)  n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const labelOf = (code) => (CATEGORIES.find(c => c.code === code) || {}).label || code;
const regionOf = (code) => REGIONS.find(r => r.code === code) || REGIONS[0];

/* ------------------------------------------------------------
   STEP 1 — 카테고리 칩 (DESIGN 6.2)
   ------------------------------------------------------------ */
function buildCategoryChips() {
  const box = $("#categoryChips");
  CATEGORIES.forEach(cat => {
    const b = el("button", "chip", cat.label);
    b.type = "button";
    b.dataset.code = cat.code;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => toggleCategory(cat.code, b));
    box.appendChild(b);
  });

  // PRD 7.2 — 회피 경로. 없으면 여기서 막힌다
  const escape = el("button", "chip chip-escape", "기억 안 나요");
  escape.type = "button";
  escape.dataset.code = NO_MEMORY;
  escape.setAttribute("aria-pressed", "false");
  escape.addEventListener("click", () => toggleCategory(NO_MEMORY, escape));
  box.appendChild(escape);
}

function toggleCategory(code, btn) {
  const chips = [...document.querySelectorAll("#categoryChips .chip")];

  if (code === NO_MEMORY) {
    const turningOn = !state.categories.has(NO_MEMORY);
    state.categories.clear();
    if (turningOn) state.categories.add(NO_MEMORY);
  } else {
    state.categories.delete(NO_MEMORY);   // 배타 선택
    if (state.categories.has(code)) {
      state.categories.delete(code);
    } else if (state.categories.size < MAX_PICKS) {
      state.categories.add(code);
    }
  }

  chips.forEach(c => c.setAttribute("aria-pressed", String(state.categories.has(c.dataset.code))));
  syncStep1();
}

function syncStep1() {
  const picked = state.categories.size;
  const real = [...state.categories].filter(c => c !== NO_MEMORY).length;
  $("#toStep2").disabled = picked === 0;
  $("#step1Hint").textContent =
    picked === 0            ? "하나 이상 골라주세요."
    : state.categories.has(NO_MEMORY) ? "괜찮아요. 성수에서 골라드릴게요."
    : real >= MAX_PICKS     ? "최대 3개까지 고를 수 있어요."
    : `${real}개 선택했어요.`;
}

/* ------------------------------------------------------------
   STEP 2 — 지역 칩 (PRD 7.3 — 씨드가 있는 지역만 노출)
   ------------------------------------------------------------ */
function buildRegionChips() {
  const box = $("#regionChips");
  REGIONS.forEach(r => {
    const b = el("button", "chip", r.label);
    b.type = "button";
    b.dataset.code = r.code;
    b.setAttribute("aria-pressed", String(state.region === r.code));
    b.addEventListener("click", () => {
      state.region = r.code;
      [...box.children].forEach(c => c.setAttribute("aria-pressed", String(c.dataset.code === r.code)));
    });
    box.appendChild(b);
  });
}

/* ------------------------------------------------------------
   제외 로직 (F1) — 완전 제외가 아니라 하단 배치
   PRD 7.2 / 10.3 — 완전히 빼면 결과가 0건이 되기 쉽다
   ------------------------------------------------------------ */
function pickResults() {
  const excluded = new Set([...state.categories].filter(c => c !== NO_MEMORY));
  const pool = PLACES.filter(p => p.region === state.region);

  const keep   = pool.filter(p => !excluded.has(p.category));
  const demote = pool.filter(p =>  excluded.has(p.category));

  return [...keep, ...demote]
    .slice(0, MAX_RESULTS)
    .map(p => ({ ...p, demoted: excluded.has(p.category) }));
}

/** 마지막 글자의 받침 유무로 조사를 고른다. "고기은" 같은 문장이 나오면 안 된다. */
function particle(word, withBatchim, withoutBatchim) {
  const last = word.trim().at(-1) ?? "";
  const code = last.charCodeAt(0);
  const isHangulSyllable = code >= 0xAC00 && code <= 0xD7A3;
  if (!isHangulSyllable) return withBatchim;          // 영문·숫자는 보수적으로
  return (code - 0xAC00) % 28 !== 0 ? withBatchim : withoutBatchim;
}

function exclusionSentence() {
  const picked = [...state.categories].filter(c => c !== NO_MEMORY);
  const region = regionOf(state.region).label;
  if (picked.length === 0) return `${region}에서 골라봤어요.`;
  const list = picked.map(labelOf).join("·");
  return `어제 드신 ${list}${particle(list, "은", "는")} 빼고 골랐어요.`;
}

/* ------------------------------------------------------------
   결과 지도 (F2) — API 없이 SVG 투영
   결과 단계에서만 생성한다 (PRD 9장 — 첫 화면에 지도를 올리지 않는다)
   모션 없음 (DESIGN 5장)
   ------------------------------------------------------------ */
function buildMap(results) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 800, H = 440, PAD = 0.12;

  const lats = results.map(p => p.lat);
  const lngs = results.map(p => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  // 결과가 한 점에 몰려도 0으로 나누지 않도록
  const spanLat = Math.max(maxLat - minLat, 0.0008);
  const spanLng = Math.max(maxLng - minLng, 0.0008);
  const midLat = (minLat + maxLat) / 2, midLng = (minLng + maxLng) / 2;
  minLat = midLat - spanLat / 2; maxLat = midLat + spanLat / 2;
  minLng = midLng - spanLng / 2; maxLng = midLng + spanLng / 2;

  const px = (lng) => PAD * W + ((lng - minLng) / spanLng) * W * (1 - 2 * PAD);
  const py = (lat) => PAD * H + ((maxLat - lat) / spanLat) * H * (1 - 2 * PAD);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-hidden", "true");   // 텍스트 대체는 아래 카드 리스트 (DESIGN 5.2)
  svg.setAttribute("focusable", "false");

  // 격자 — 지도처럼 읽히되 실제 도로를 흉내 내지 않는다
  const grid = document.createElementNS(NS, "g");
  grid.setAttribute("stroke", "var(--line)");
  grid.setAttribute("stroke-width", "1");
  for (let x = 0; x <= W; x += 80) {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", x); l.setAttribute("y1", 0);
    l.setAttribute("x2", x); l.setAttribute("y2", H);
    grid.appendChild(l);
  }
  for (let y = 0; y <= H; y += 80) {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", 0); l.setAttribute("y1", y);
    l.setAttribute("x2", W); l.setAttribute("y2", y);
    grid.appendChild(l);
  }
  svg.appendChild(grid);

  results.forEach((p, i) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("transform", `translate(${px(p.lng).toFixed(1)}, ${py(p.lat).toFixed(1)})`);

    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", "18");
    c.setAttribute("fill", "var(--ink)");
    g.appendChild(c);

    const t = document.createElementNS(NS, "text");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("y", "5");
    t.setAttribute("fill", "var(--on-ink)");
    t.setAttribute("font-size", "15");
    t.setAttribute("font-weight", "600");
    t.setAttribute("font-family", "var(--font-body)");
    t.textContent = String(i + 1);
    g.appendChild(t);

    svg.appendChild(g);
  });

  const frame = el("div", "map-frame");
  frame.appendChild(svg);
  const cap = el("p", "map-caption t-caption",
    `${regionOf(state.region).label} 일대 · 번호는 아래 목록과 같아요`);
  frame.appendChild(cap);
  return frame;
}

/* ------------------------------------------------------------
   결과 카드 (DESIGN 6.3)
   작성자·방문일은 필수. 정량 지표(별점·리뷰 수)는 넣지 않는다 (DESIGN 7.1)
   ------------------------------------------------------------ */
function buildCard(place, index) {
  const li = el("li", "card");

  const photo = el("div", "card-photo");
  if (place.photo) {
    const img = el("img");
    img.src = place.photo;
    img.alt = `${place.name} 방문 사진`;
    img.loading = "lazy";
    img.decoding = "async";
    photo.appendChild(img);
  }
  // photo 가 없으면 --line 톤 단색 블록 그대로 (DESIGN 7.2)
  li.appendChild(photo);

  const body = el("div", "card-body");

  const titleRow = el("div", "card-title-row");
  titleRow.appendChild(el("span", "card-num", String(index + 1)));
  titleRow.appendChild(el("h3", "card-title", place.name));
  body.appendChild(titleRow);

  body.appendChild(el("p", "card-meta t-caption",
    `${labelOf(place.category)} · ${regionOf(place.region).label} 도보 ${walkMinutes(regionOf(place.region), place)}분`));

  body.appendChild(el("p", "card-note t-note", place.note));

  if (place.demoted) {
    body.appendChild(el("p", "card-demoted t-caption", "어제 드신 종류예요"));
  }

  body.appendChild(el("p", "card-foot t-caption",
    `${place.author} · ${formatDate(place.visitedAt)}`));

  li.appendChild(body);
  return li;
}

/* ------------------------------------------------------------
   결과 렌더
   ------------------------------------------------------------ */
function renderResults() {
  const results = pickResults();
  const box = $("#resultsBody");
  box.replaceChildren();

  $("#exclusionText").textContent = exclusionSentence();

  // PRD S3 — 빈 화면 금지
  if (results.length === 0) {
    const empty = el("div", "empty-state");
    empty.appendChild(el("p", "t-h2", "이 동네는 아직 기록이 적어요"));
    empty.appendChild(el("p", "t-body muted", "가까운 연남·망원은 기록을 모으는 중이에요. 열리면 알려드릴게요."));
    empty.appendChild(el("p", "t-body muted", "이 동네의 첫 기록을 남겨주실래요?"));
    box.appendChild(empty);
  } else {
    box.appendChild(buildMap(results));
    const ul = el("ul", "card-grid");
    results.forEach((p, i) => ul.appendChild(buildCard(p, i)));
    box.appendChild(ul);
  }

  $("#results").hidden = false;
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------
   단계 전환
   ------------------------------------------------------------ */
function goStep(n) {
  $("#step1").hidden = n !== 1;
  $("#step2").hidden = n !== 2;
  $("#progressLabel").textContent = `${n} / 2 단계`;
  $("#quiz").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------
   이메일 수집 (S4)
   ------------------------------------------------------------ */
/**
 * ⚠️ 배포 전 교체 지점.
 * 지금은 브라우저 localStorage 에만 저장하므로 운영자에게 전달되지 않는다.
 * Formspree / Google Form / 자체 엔드포인트로 이 함수 본문만 바꾸면 된다.
 */
async function submitEmail(email) {
  const key = "bbaego:subscribers";
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.push({ email, at: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(list));
  return true;
}

function wireEmailForm() {
  const form  = $("#emailForm");
  const input = $("#email");
  const error = $("#emailError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

    if (!valid) {
      // 색만으로 오류를 전달하지 않는다 — 텍스트 병기 (DESIGN 2.3)
      error.textContent = "이메일 주소를 다시 확인해 주세요.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }

    error.textContent = "";
    input.removeAttribute("aria-invalid");
    await submitEmail(value);

    form.hidden = true;
    $("#privacyNote").hidden = true;
    $("#ctaDone").hidden = false;   // role="status" 라 포커스 이동 없이 안내된다
  });

  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") {
      error.textContent = "";
      input.removeAttribute("aria-invalid");
    }
  });
}

/* ------------------------------------------------------------
   스크롤 진입 모션 (F3 / DESIGN 5.1)
   S1·S2·S5 에만. 결과(S3)·CTA(S4) 에는 쓰지 않는다.
   한 번만 실행하고 관찰을 해제한다.
   ------------------------------------------------------------ */
function wireReveal() {
  const targets = [...document.querySelectorAll("[data-reveal]")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach(t => t.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    let staggered = 0;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      // stagger 최대 3개 × 60ms (DESIGN 5.1)
      entry.target.style.transitionDelay = `${Math.min(staggered++, 2) * 60}ms`;
      entry.target.classList.add("is-in");
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  targets.forEach(t => io.observe(t));
}

/* ------------------------------------------------------------
   init
   ------------------------------------------------------------ */
function init() {
  document.title = `${SERVICE_NAME} — 오늘 뭐 먹지?`;

  buildCategoryChips();
  buildRegionChips();
  syncStep1();
  wireReveal();
  wireEmailForm();

  $("#startBtn").addEventListener("click", () => {
    goStep(1);
    document.querySelector("#categoryChips .chip")?.focus();
  });
  $("#toStep2").addEventListener("click", () => {
    goStep(2);
    document.querySelector("#regionChips .chip")?.focus();
  });
  $("#backToStep1").addEventListener("click", () => goStep(1));
  $("#showResults").addEventListener("click", renderResults);

  $("#restartBtn").addEventListener("click", () => {
    $("#results").hidden = true;
    goStep(1);
    document.querySelector("#categoryChips .chip")?.focus();
  });
}

init();
