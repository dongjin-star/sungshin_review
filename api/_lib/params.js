/* ============================================================
   params.js — 쿼리 검증
   ------------------------------------------------------------
   proxy.mjs 4절에서 그대로 옮겼다. readOrigin 만 새로 추가했다.
   ============================================================ */

import { REGIONS } from "../../assets/seed.js";
import { BadRequest } from "./errors.js";

export function num(value, name, { min, max, required = false, fallback = null }) {
  if (value == null || value === "") {
    if (required) throw new BadRequest(`${name} 값이 필요합니다.`);
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequest(`${name} 값이 숫자가 아닙니다.`);
  if (n < min || n > max) throw new BadRequest(`${name} 값이 허용 범위를 벗어났습니다.`);
  return n;
}

/** 문자열 파라미터. 길이 상한은 바깥 API 로 그대로 흘려보내지 않기 위한 것이다. */
export function text(value, name, { max, required = false }) {
  const s = String(value ?? "").trim();
  if (!s) {
    if (required) throw new BadRequest(`${name} 값이 필요합니다.`);
    return "";
  }
  if (s.length > max) throw new BadRequest(`${name} 값이 너무 깁니다.`);
  return s;
}

/**
 * 두 엔드포인트가 공유하는 위치 파라미터. 없으면 REGIONS[0] 기준점.
 *
 * radius 는 **기본값이 없다** (`null`). 두 엔드포인트가 반경을 다르게 다루기 때문이다.
 * 카테고리 검색은 "근처에 뭐 있지"라 반경이 본질이지만, 키워드 검색에 반경을 걸면
 * "부산 돼지국밥"이 성수동 1km 밖이라는 이유로 0건이 된다. search.js 참조.
 */
export function readLocation(sp) {
  const home = REGIONS[0];
  const x = num(sp.get("x"), "x", { min: -180, max: 180, fallback: home.lng });
  const y = num(sp.get("y"), "y", { min: -90,  max: 90,  fallback: home.lat });
  const rawRadius = num(sp.get("radius"), "radius", { min: 0, max: 20000, fallback: null });
  const radius = rawRadius == null ? null : Math.round(rawRadius);
  const page = Math.round(num(sp.get("page"), "page", { min: 1, max: 45, fallback: 1 }));
  return { x, y, radius, page, origin: { lat: y, lng: x } };
}

/**
 * 좌표를 **필수로** 읽는다. readLocation 과 갈라놓은 이유가 있다.
 *
 * readLocation 은 좌표가 없으면 조용히 성수동으로 되돌린다. 검색에서는
 * 합리적인 기본값이지만 /api/reviews 에서는 치명적이다 — 부산 가게를 조회하는데
 * 기준점이 성수동으로 잡히면 150m 근접 검사가 엉뚱한 도시에서 돌아
 * "구글에 그런 가게 없어요"라는 **거짓 응답**을 자신 있게 돌려준다.
 * 틀린 답보다 400 이 낫다.
 */
export function readOrigin(sp) {
  const x = num(sp.get("x"), "x", { min: -180, max: 180, required: true });
  const y = num(sp.get("y"), "y", { min: -90,  max: 90,  required: true });
  return { x, y, origin: { lat: y, lng: x } };
}
