/* ============================================================
   거리 · 날짜 유틸 — 삭제된 랜딩의 인라인 스크립트에서 추출 (동작 변경 없음)

   지금은 search.js 만 쓴다. 랜딩(app.js)과 공유하던 유틸이었고,
   2026-08-21 랜딩 삭제로 소비자가 하나 남았다.
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

/**
 * 표시용 거리 문구.
 *
 * 도보 분은 **걸어갈 만한 거리에서만** 쓴다. 검색이 전국으로 넓어진 뒤로
 * 기준점에서 300km 떨어진 부산 가게가 결과에 들어오는데, 거기에 도보 분을
 * 그대로 붙이면 "도보 4850분" 이 찍힌다. 숫자는 맞지만 문장이 거짓말이 된다.
 */
export function distanceText(meters) {
  // Number(null) 도 Number("") 도 0 이다. 먼저 걸러내지 않으면
  // 거리를 모르는 결과에 "도보 1분" 이 붙는다.
  if (meters == null || meters === "") return "";
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return "";
  if (m <= 2000) return `도보 ${walkMinutesFromMeters(m)}분`;
  if (m < 10000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m / 1000).toLocaleString("ko-KR")}km`;
}

export const formatDate = (iso) => iso.replaceAll("-", ".");
