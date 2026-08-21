/* ============================================================
   errors.js — 오류 분류 한 곳
   ------------------------------------------------------------
   원래 server/proxy.mjs 의 createServer try/catch 안에 있던 매핑이다.
   엔드포인트가 셋으로 늘면서 각 함수가 같은 매핑을 복사할 위험이 생겨
   여기 한 벌만 둔다.

   **문구를 바꾸지 않는다.** 클라이언트(assets/search.js)가 body.message 를
   화면에 그대로 찍는다. 여기서 한 글자 고치면 사용자가 보는 문장이 바뀐다.
   ============================================================ */

/** 사용자가 보낸 값이 잘못된 경우. instanceof 로만 판별한다. */
export class BadRequest extends Error {}

/** 서버에 키가 없다 — 설정 문제지 사용자 잘못이 아니다. */
export function noKey(message) {
  return Object.assign(new Error(message), { status: 503, code: "NO_KEY" });
}

/** 바깥 API(카카오·구글)가 실패했다. */
export function upstream(message) {
  return Object.assign(new Error(message), { status: 502, code: "UPSTREAM" });
}

/**
 * 오류 → HTTP 응답. 이 함수만이 오류를 상태 코드로 번역한다.
 * @returns {{ status: number, body: { error: string, message: string } }}
 */
export function toErrorResponse(err) {
  if (err instanceof BadRequest) {
    return { status: 400, body: { error: "BAD_REQUEST", message: err.message } };
  }
  if (err?.code === "NO_KEY") {
    return { status: 503, body: { error: "NO_KEY", message: err.message } };
  }
  if (err?.code === "UPSTREAM") {
    return { status: 502, body: { error: "UPSTREAM", message: err.message } };
  }
  // 분류되지 않은 오류는 원문을 밖으로 내보내지 않는다 — 내부 경로가 샐 수 있다.
  console.error("[server]", err?.message || err);
  return { status: 502, body: { error: "UPSTREAM", message: "알 수 없는 오류입니다." } };
}
