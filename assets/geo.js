/* ============================================================
   거리 · 날짜 유틸 — index.html 에서 추출 (동작 변경 없음)

   랜딩(app.js)과 검색(search.js)이 함께 쓴다.
   원본은 walkMinutes(place) 였지만, 검색 결과는 REGIONS 를 거치지 않고
   카카오 좌표를 그대로 들고 오므로 기준점을 인자로 받도록 바꿨다.
   계산식은 원본과 동일하다.

   사용자 위치를 요구하지 않는다 (PRD 7.3 — 첫 방문에 권한 팝업 금지).
   기준점은 호출하는 쪽이 정한다.
   ============================================================ */

/** 두 좌표 사이 직선 거리(m). 등거리원통 근사 — 동네 규모에서는 충분하다. */
export function metersBetween(origin, target) {
  const dLat = (target.lat - origin.lat) * 111320;
  const dLng = (target.lng - origin.lng) * 111320 * Math.cos(origin.lat * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

/** 미터 → 도보 분. 도보 약 67m/분. */
export function walkMinutesFromMeters(meters) {
  return Math.max(1, Math.round(Number(meters) / 67));
}

/** 기준점에서 도보 몇 분인지. 계산식은 원본과 동일하다. */
export function walkMinutes(origin, target) {
  return walkMinutesFromMeters(metersBetween(origin, target));
}

export const formatDate = (iso) => iso.replaceAll("-", ".");
