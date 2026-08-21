/* ============================================================
   normalize.js — 카카오 응답 → CONTRACT 2절 형태
   ------------------------------------------------------------
   proxy.mjs 2·3절에서 그대로 옮겼다. 클라이언트는 카카오 원본 필드명
   (place_name / road_address_name / x / y / category_name …)을 알지 못한다.
   정규화는 전부 여기서 끝낸다. 카카오를 다른 소스로 갈아끼워도
   클라이언트는 그대로 돈다.
   ============================================================ */

import { CATEGORIES, REGIONS } from "../../assets/seed.js";
import { metersBetween } from "../../assets/geo.js";

/* ------------------------------------------------------------
   카테고리 매핑 — 카카오 category_name → seed.js CATEGORIES 코드

   카카오는 "음식점 > 한식 > 백반" 처럼 준다.
   못 찾으면 code 는 null 이고 원문은 categoryLabel 에 남긴다.
   억지로 끼워 맞추지 않는다 — 틀린 분류는 필터를 조용히 망가뜨린다.
   ------------------------------------------------------------ */

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
export function nearestRegion(lat, lng) {
  let best = null, bestD = Infinity;
  for (const r of REGIONS) {
    const d = metersBetween({ lat: r.lat, lng: r.lng }, { lat, lng });
    if (d < bestD) { bestD = d; best = r; }
  }
  return best && bestD <= REGION_RADIUS_M ? best.code : null;
}

/* ------------------------------------------------------------
   정규화 — CONTRACT.md 2절

   author / visitedAt 이 항상 null 인 것은 실수가 아니다.
   카카오 결과는 정의상 "다녀온 기록"이 아니므로 .card 로 렌더할 수 없고,
   클라이언트는 이 null 을 보고 .result-card 를 고른다.
   ------------------------------------------------------------ */
export function normalize(doc, origin) {
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

export function toPayload(data, origin, page) {
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
