/* ============================================================
   proxy.mjs — 정적 서버 + 카카오 로컬 API 프록시
   ------------------------------------------------------------
   의존성 0. Node 24 내장(node:http, node:fs, 전역 fetch)만 쓴다.

   존재 이유는 하나다: 카카오 REST 키를 브라우저로 내보내지 않는 것.
   키는 이 파일 안에서만 읽히고, 응답 본문·헤더·로그 어디에도 나가지 않는다.

   두 번째 이유는 계약이다. 클라이언트는 카카오 원본 필드명
   (place_name / road_address_name / x / y / category_name …)을 알지 못한다.
   정규화는 전부 여기서 끝낸다 (CONTRACT.md 2절).
   카카오를 다른 소스로 갈아끼워도 클라이언트는 그대로 돈다.

   실행:  npm run dev   (기본 포트 5173)
   ============================================================ */

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CATEGORIES, REGIONS } from "../assets/seed.js";
import { metersBetween } from "../assets/geo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");          // 저장소 루트를 그대로 서빙한다
const PORT = Number(process.env.PORT) || 5173;

const KAKAO_KEYWORD  = "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_CATEGORY = "https://dapi.kakao.com/v2/local/search/category.json";
const UPSTREAM_TIMEOUT_MS = 8000;

/* 계약이 인정하는 그룹 코드만 통과시킨다 (CONTRACT.md 3절). */
const GROUP_CODES = new Set(["FD6", "CE7"]);

/* ============================================================
   1. 정적 파일
   ============================================================ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8"
  // .md 는 일부러 없다. 저장소 문서(PRD·CONTRACT)를 정적으로 뿌릴 이유가 없다.
  // 목록에 없는 확장자는 415 로 막힌다 — .env 도 여기서 걸린다.
};

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: "BAD_REQUEST", message: "경로를 읽을 수 없습니다." });
  }
  if (rel === "/" || rel === "") rel = "/index.html";

  // 디렉터리 탈출 차단 — 정규화한 절대경로가 ROOT 밖이면 거부한다.
  const abs = path.resolve(ROOT, "." + path.posix.normalize(rel));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    return sendText(res, 403, "Forbidden");
  }

  let info;
  try {
    info = await stat(abs);
  } catch {
    return sendText(res, 404, "Not Found");
  }
  if (info.isDirectory()) return serveStatic(req, res, path.posix.join(rel, "index.html"));

  const ext = path.extname(abs).toLowerCase();
  const type = MIME[ext];
  if (!type) return sendText(res, 415, "Unsupported Media Type");

  const body = await readFile(abs);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": body.length,
    "Cache-Control": "no-cache"
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

/* ============================================================
   2. 카테고리 매핑 — 카카오 category_name → seed.js CATEGORIES 코드
   ------------------------------------------------------------
   카카오는 "음식점 > 한식 > 백반" 처럼 준다.
   못 찾으면 code 는 null 이고 원문은 categoryLabel 에 남긴다.
   억지로 끼워 맞추지 않는다 — 틀린 분류는 필터를 조용히 망가뜨린다.
   ============================================================ */

const VALID_CODES = new Set(CATEGORIES.map(c => c.code));

/** 카카오 분류 토큰 → 우리 코드. 값은 전부 CATEGORIES 안에 있어야 한다. */
const TOKEN_MAP = new Map(Object.entries({
  "한식": "korean", "백반": "korean", "국밥": "korean", "해장국": "korean",
  "찌개": "korean", "전골": "korean", "국수": "korean", "죽": "korean",
  "돼지고기구이": "meat", "소고기구이": "meat", "육류": "meat",
  "육류,고기": "meat", "곱창": "meat", "삼겹살": "meat", "갈비": "meat",
  "중식": "chinese", "중국요리": "chinese",
  "일식": "japanese", "초밥": "japanese", "롤": "japanese",
  "돈까스": "japanese", "우동": "japanese", "라멘": "japanese",
  "양식": "western", "이탈리안": "western", "프랑스음식": "western",
  "피자": "western", "스테이크": "western", "패밀리레스토랑": "western",
  "분식": "snack", "떡볶이": "snack", "김밥": "snack",
  "아시아음식": "asian", "베트남음식": "asian", "태국음식": "asian",
  "인도음식": "asian", "동남아음식": "asian",
  "패스트푸드": "fastfood", "햄버거": "fastfood", "샌드위치": "fastfood"
}));

/** 토큰 매칭이 실패했을 때만 쓰는 부분 문자열 스캔. 긴 것부터 본다. */
const SUBSTRING_RULES = [
  ["아시아음식", "asian"], ["패스트푸드", "fastfood"],
  ["돼지고기", "meat"], ["소고기", "meat"], ["육류", "meat"],
  ["한식", "korean"], ["중식", "chinese"], ["일식", "japanese"],
  ["양식", "western"], ["분식", "snack"]
];

/**
 * @param {string} raw 카카오 category_name
 * @returns {{ code: string|null, label: string }}
 */
export function mapCategory(raw) {
  const text = String(raw || "").trim();
  if (!text) return { code: null, label: "" };

  const parts = text.split(">").map(s => s.trim()).filter(Boolean);
  // "음식점" 같은 최상위 분류는 표시용 라벨에서 뺀다 (CONTRACT 예시: "한식 > 백반")
  const label = (parts[0] === "음식점" || parts[0] === "카페" ? parts.slice(1) : parts).join(" > ") || text;

  // 구체적인 쪽(뒤)부터 본다. "음식점 > 한식 > 백반" 이면 백반 → 한식 순.
  for (let i = parts.length - 1; i >= 0; i--) {
    const hit = TOKEN_MAP.get(parts[i]);
    if (hit && VALID_CODES.has(hit)) return { code: hit, label };
  }
  for (const [needle, code] of SUBSTRING_RULES) {
    if (text.includes(needle) && VALID_CODES.has(code)) return { code, label };
  }
  return { code: null, label };
}

/**
 * 좌표가 어느 지역 씨드에 속하는지. 멀면 null 이다.
 * 거짓 지역명을 붙이면 결과 카드의 "성수동" 표기가 그대로 거짓말이 된다.
 */
const REGION_RADIUS_M = 8000;
function nearestRegion(lat, lng) {
  let best = null, bestD = Infinity;
  for (const r of REGIONS) {
    const d = metersBetween({ lat: r.lat, lng: r.lng }, { lat, lng });
    if (d < bestD) { bestD = d; best = r; }
  }
  return best && bestD <= REGION_RADIUS_M ? best.code : null;
}

/* ============================================================
   3. 정규화 — CONTRACT.md 2절
   ------------------------------------------------------------
   author / visitedAt 이 항상 null 인 것은 실수가 아니다.
   카카오 결과는 정의상 "다녀온 기록"이 아니므로 .card 로 렌더할 수 없고,
   클라이언트는 이 null 을 보고 .result-card 를 고른다.
   ============================================================ */
function normalize(doc, origin) {
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  const { code, label } = mapCategory(doc.category_name);
  const raw = Number(doc.distance);

  return {
    id:            `kakao-${doc.id}`,
    name:          String(doc.place_name || "").trim(),
    category:      code,
    categoryLabel: label,
    region:        Number.isFinite(lat) && Number.isFinite(lng) ? nearestRegion(lat, lng) : null,
    lat, lng,

    author:    null,
    visitedAt: null,
    note:      "",
    photo:     "",            // 항상 빈 문자열. 스톡·홍보 사진 금지 (DESIGN 7.2)
    priceRange:    null,
    situationTags: [],

    source: "kakao",

    placeUrl:    String(doc.place_url || ""),
    phone:       String(doc.phone || ""),
    roadAddress: String(doc.road_address_name || doc.address_name || ""),
    distance:    Number.isFinite(raw)
      ? Math.round(raw)
      : (Number.isFinite(lat) && Number.isFinite(lng) ? Math.round(metersBetween(origin, { lat, lng })) : null)
  };
}

/* ============================================================
   4. 쿼리 검증
   ============================================================ */

class BadRequest extends Error {}

function num(value, name, { min, max, required = false, fallback = null }) {
  if (value == null || value === "") {
    if (required) throw new BadRequest(`${name} 값이 필요합니다.`);
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequest(`${name} 값이 숫자가 아닙니다.`);
  if (n < min || n > max) throw new BadRequest(`${name} 값이 허용 범위를 벗어났습니다.`);
  return n;
}

/**
 * 두 엔드포인트가 공유하는 위치 파라미터. 없으면 REGIONS[0] 기준점.
 *
 * radius 는 **기본값이 없다** (`null`). 두 엔드포인트가 반경을 다르게 다루기 때문이다.
 * 카테고리 검색은 "근처에 뭐 있지"라 반경이 본질이지만, 키워드 검색에 반경을 걸면
 * "부산 돼지국밥"이 성수동 1km 밖이라는 이유로 0건이 된다. 아래 handleSearch 참조.
 */
function readLocation(sp) {
  const home = REGIONS[0];
  const x = num(sp.get("x"), "x", { min: -180, max: 180, fallback: home.lng });
  const y = num(sp.get("y"), "y", { min: -90,  max: 90,  fallback: home.lat });
  const rawRadius = num(sp.get("radius"), "radius", { min: 0, max: 20000, fallback: null });
  const radius = rawRadius == null ? null : Math.round(rawRadius);
  const page = Math.round(num(sp.get("page"), "page", { min: 1, max: 45, fallback: 1 }));
  return { x, y, radius, page, origin: { lat: y, lng: x } };
}

/* ============================================================
   5. 카카오 호출
   ============================================================ */

function readKey() {
  const key = (process.env.KAKAO_REST_KEY || "").trim();
  return key.length ? key : null;
}

async function callKakao(endpoint, params) {
  const key = readKey();
  // 여기서만 키를 읽는다. 아래로 흘려보내지 않는다.
  if (!key) {
    const e = new Error("KAKAO_REST_KEY 가 설정되지 않았습니다.");
    e.status = 503; e.code = "NO_KEY";
    throw e;
  }

  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch (cause) {
    const e = new Error("장소 정보를 불러오지 못했습니다.");
    e.status = 502; e.code = "UPSTREAM";
    // cause.message 만 남긴다. url 에는 키가 없지만 헤더 로그는 절대 찍지 않는다.
    console.error(`[upstream] ${endpoint} 요청 실패: ${cause?.name || "Error"}`);
    throw e;
  }

  if (!res.ok) {
    console.error(`[upstream] ${endpoint} → HTTP ${res.status}`);
    const e = new Error(
      res.status === 401 || res.status === 403
        ? "카카오 API 키가 거부됐습니다."
        : "장소 정보를 불러오지 못했습니다."
    );
    e.status = 502; e.code = "UPSTREAM";
    throw e;
  }

  try {
    return await res.json();
  } catch {
    const e = new Error("장소 정보를 해석하지 못했습니다.");
    e.status = 502; e.code = "UPSTREAM";
    throw e;
  }
}

function toPayload(data, origin, page) {
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  const meta = data?.meta || {};
  return {
    places: docs.map(d => normalize(d, origin)),
    meta: {
      total:  Number(meta.pageable_count ?? meta.total_count ?? docs.length),
      isEnd:  meta.is_end !== false,
      page
    }
  };
}

/* ============================================================
   6. 라우팅
   ============================================================ */

async function handleSearch(res, sp) {
  const q = (sp.get("q") || "").trim();
  if (!q) throw new BadRequest("검색어(q)가 필요합니다.");
  if (q.length > 80) throw new BadRequest("검색어가 너무 깁니다.");

  const { x, y, radius, page, origin } = readLocation(sp);

  // 반경은 클라이언트가 명시적으로 보낼 때만 건다. 기본은 "전국"이다.
  //
  // x/y 는 그대로 보낸다 — 버리면 안 된다. 카카오는 좌표만 있고 반경이 없으면
  // 지역어가 없는 질의("파스타")는 좌표에서 가까운 순으로, 지역어가 있는 질의
  // ("부산 돼지국밥")는 그 지역으로 알아서 넘긴다. 실측:
  //   파스타 + 성수동 x/y, 반경 없음        → 성수동 결과
  //   부산 돼지국밥 + 성수동 x/y, 반경 없음 → 부산 결과
  //   부산 돼지국밥 + 성수동 x/y, 반경 1km  → 0건   ← 반경을 걸면 이렇게 된다
  const data = await callKakao(KAKAO_KEYWORD, {
    query: q, x, y, radius: radius || null, page, size: 15, category_group_code: "FD6"
  });
  sendJson(res, 200, toPayload(data, origin, page));
}

async function handleCategory(res, sp) {
  const group = (sp.get("group") || "FD6").trim().toUpperCase();
  if (!GROUP_CODES.has(group)) throw new BadRequest("지원하지 않는 카테고리 그룹입니다.");

  const { x, y, radius, page, origin } = readLocation(sp);
  // 카카오 카테고리 검색은 반경이 0이면 결과를 주지 않는다.
  const data = await callKakao(KAKAO_CATEGORY, {
    category_group_code: group, x, y, radius: radius || 1000, page, size: 15
  });
  sendJson(res, 200, toPayload(data, origin, page));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "BAD_REQUEST", message: "GET 만 지원합니다." });
  }

  if (pathname.startsWith("/api/")) {
    try {
      if (pathname === "/api/search")   return await handleSearch(res, searchParams);
      if (pathname === "/api/category") return await handleCategory(res, searchParams);
      return sendJson(res, 404, { error: "BAD_REQUEST", message: "없는 엔드포인트입니다." });
    } catch (err) {
      if (err instanceof BadRequest) {
        return sendJson(res, 400, { error: "BAD_REQUEST", message: err.message });
      }
      if (err?.code === "NO_KEY") {
        return sendJson(res, 503, { error: "NO_KEY", message: err.message });
      }
      if (err?.code === "UPSTREAM") {
        return sendJson(res, 502, { error: "UPSTREAM", message: err.message });
      }
      console.error("[server]", err?.message || err);
      return sendJson(res, 502, { error: "UPSTREAM", message: "알 수 없는 오류입니다." });
    }
  }

  try {
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error("[static]", err?.message || err);
    sendText(res, 500, "Internal Server Error");
  }
});

/* ============================================================
   7. 응답 헬퍼
   ============================================================ */

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, text) {
  const body = Buffer.from(text, "utf8");
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length
  });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`빼고 dev server → http://localhost:${PORT}/`);
  console.log(readKey()
    ? "  카카오 키 감지됨 — /api/* 가 실서비스 데이터를 씁니다."
    : "  카카오 키 없음 — /api/* 는 503 NO_KEY 를 돌려주고, 화면은 씨드 12곳으로 동작합니다.");
});
