/* ============================================================
   reviews.js — GET /api/reviews 의 로직
   ------------------------------------------------------------
   가게 이름과 좌표를 받아 구글에서 그 가게를 찾고 별점·리뷰를 돌려준다.

   핵심은 **150m 재검사**다. 구글의 locationBias 는 제한이 아니라 편향이라,
   "성수동 좌표 + 영진돼지국밥" 을 물으면 부산 가게를 그대로 돌려준다.
   같은 이름의 가게가 전국에 여러 개인 상황이 바로 그것이라, 반경 검사를
   빼면 엉뚱한 도시의 리뷰를 그 가게 리뷰라고 보여주게 된다.

   못 찾은 것은 **오류가 아니다.** 200 에 found:false 로 돌려준다.
   ============================================================ */

import { BadRequest } from "./errors.js";
import { readOrigin } from "./params.js";
import { metersBetween } from "../../assets/geo.js";
import { nearestRegion } from "./normalize.js";
import {
  searchText, placeDetails, normalizePlace, placeCoords, REVIEW_RADIUS_M
} from "./places.js";

/**
 * 후보 중 기준점 150m 안에서 가장 가까운 하나. 없으면 null.
 * 좌표가 없는 후보는 거리를 알 수 없으므로 버린다 — 추측하지 않는다.
 */
function pickNearest(places, origin) {
  let best = null, bestD = Infinity;
  for (const p of places) {
    const c = placeCoords(p);
    if (!c) continue;
    const d = metersBetween(origin, c);
    if (d <= REVIEW_RADIUS_M && d < bestD) { bestD = d; best = p; }
  }
  return best ? { place: best, distance: Math.round(bestD) } : null;
}

function found(place, distance) {
  const normalized = normalizePlace(place);
  const coords = placeCoords(place);
  return {
    found: true,
    place: {
      ...normalized,
      distance,
      // 검색 결과 카드와 같은 규칙 — 8km 넘게 떨어지면 지역명을 붙이지 않는다.
      region: coords ? nearestRegion(coords.lat, coords.lng) : null
    }
  };
}

/** reason 을 둘로 나눈 이유: 이름이 안 맞는 것과 구글에 아예 없는 것은 다른 문제다. */
function notFound(reason) {
  return { found: false, place: null, reason };
}

export async function reviewsHandler(sp) {
  const placeId = (sp.get("placeId") || "").trim();

  // 1. place_id 를 이미 아는 경우 — 검색을 건너뛴다.
  //    이미 150m 검사를 통과해서 얻은 id 라 다시 잴 필요가 없다.
  if (placeId) {
    if (placeId.length > 300) throw new BadRequest("placeId 값이 너무 깁니다.");
    const data = await placeDetails(placeId);
    if (!data?.id) return notFound("NO_RESULT");
    return found(data, null);
  }

  // 2. 이름 + 좌표로 찾는다.
  const name = (sp.get("name") || "").trim();
  if (!name) throw new BadRequest("가게 이름(name)이 필요합니다.");
  if (name.length > 80) throw new BadRequest("가게 이름이 너무 깁니다.");

  // 좌표는 필수다. readLocation 처럼 성수동으로 폴백하면 부산 가게를 조회할 때
  // 엉뚱한 기준점으로 150m 검사가 돌아 "못 찾음"이라는 거짓 답이 나간다.
  const { origin } = readOrigin(sp);

  // 도로명을 같이 넘기면 체인점 구분이 붙는다 ("스타벅스" 하나로는 150m 안에서도 갈린다).
  const address = (sp.get("address") || "").trim().slice(0, 120);
  const textQuery = address ? `${name} ${address}` : name;

  const data = await searchText(textQuery, origin);
  const candidates = Array.isArray(data?.places) ? data.places : [];
  if (!candidates.length) return notFound("NO_RESULT");

  const hit = pickNearest(candidates, origin);
  if (!hit) return notFound("NO_MATCH_WITHIN_150M");

  return found(hit.place, hit.distance);
}
