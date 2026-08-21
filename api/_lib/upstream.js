/* ============================================================
   upstream.js — 바깥 API 호출의 공통 얼개
   ------------------------------------------------------------
   원래 callKakao 안에 있던 네트워크·상태코드·파싱 처리를 꺼냈다.
   구글도 같은 분류를 그대로 쓰게 하려는 것이다 — 실패 경로가 두 벌이면
   한쪽만 고쳐지고 다른 쪽은 조용히 다르게 동작한다.

   **로그에 헤더를 찍지 않는다.** 카카오는 Authorization, 구글은
   X-Goog-Api-Key 에 키가 들어 있다. label 과 오류 이름·상태코드만 남긴다.
   ============================================================ */

import { upstream } from "./errors.js";

export const UPSTREAM_TIMEOUT_MS = 8000;

/**
 * @param {string|URL} url
 * @param {RequestInit} init
 * @param {{ label: string, deniedMessage: string, failMessage?: string }} opts
 */
export async function fetchUpstreamJson(url, init, { label, deniedMessage, failMessage }) {
  const fail = failMessage || "장소 정보를 불러오지 못했습니다.";

  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (cause) {
    // cause.name 만 남긴다 (타임아웃이면 TimeoutError). 본문·헤더는 찍지 않는다.
    console.error(`[upstream] ${label} 요청 실패: ${cause?.name || "Error"}`);
    throw upstream(fail);
  }

  if (!res.ok) {
    console.error(`[upstream] ${label} → HTTP ${res.status}`);
    throw upstream(res.status === 401 || res.status === 403 ? deniedMessage : fail);
  }

  try {
    return await res.json();
  } catch {
    throw upstream("장소 정보를 해석하지 못했습니다.");
  }
}
