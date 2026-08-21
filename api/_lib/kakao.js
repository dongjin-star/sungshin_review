/* ============================================================
   kakao.js — 카카오 로컬 API 호출
   ------------------------------------------------------------
   키는 이 파일 안에서만 읽힌다. 응답 본문·헤더·로그 어디에도 나가지 않는다
   (PRD 12장 이슈 8). readKey 를 export 하지 않는 것이 그 장치다.
   ============================================================ */

import { noKey } from "./errors.js";
import { fetchUpstreamJson } from "./upstream.js";

export const KAKAO_KEYWORD  = "https://dapi.kakao.com/v2/local/search/keyword.json";
export const KAKAO_CATEGORY = "https://dapi.kakao.com/v2/local/search/category.json";

/** 여기서만 키를 읽는다. 아래로 흘려보내지 않는다. */
function readKey() {
  const key = (process.env.KAKAO_REST_KEY || "").trim();
  return key.length ? key : null;
}

/** 부팅 배너용. 키 존재 여부만 알려주고 값은 주지 않는다. */
export function hasKakaoKey() {
  return readKey() !== null;
}

export async function callKakao(endpoint, params) {
  const key = readKey();
  if (!key) throw noKey("KAKAO_REST_KEY 가 설정되지 않았습니다.");

  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }

  return fetchUpstreamJson(
    url,
    { headers: { Authorization: `KakaoAK ${key}` } },
    { label: endpoint, deniedMessage: "카카오 API 키가 거부됐습니다." }
  );
}
