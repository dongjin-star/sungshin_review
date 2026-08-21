/* ============================================================
   http.js — 응답 헬퍼 + 두 런타임을 잇는 래퍼
   ------------------------------------------------------------
   이 파일이 존재하는 이유는 진입점이 둘이기 때문이다:

     로컬   server/proxy.mjs  (node:http)
     배포   api/*.js          (Vercel 서버리스 함수)

   Vercel 의 Node 런타임은 진짜 http.ServerResponse 를 넘겨준다 (헬퍼
   메서드가 몇 개 붙어 있을 뿐이다). 그래서 sendJson 이 양쪽에서 그대로 돈다.

   다른 점은 쿼리를 꺼내는 방법 하나뿐이고, paramsFrom() 이 그것을 흡수한다.
   핸들러는 URLSearchParams 만 받고 **페이로드를 return 한다** — res 를 모른다.
   그래야 로직에 HTTP 의존이 없고 node -e 로 바로 돌려볼 수 있다.
   ============================================================ */

import { toErrorResponse } from "./errors.js";

export function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    // 리뷰 응답이 여기 섞여 나간다. 구글 약관이 리뷰 콘텐츠 캐싱을 금지하므로
    // 엣지·프록시 캐시가 절대 붙지 않게 no-store 를 유지한다 (google.js 주석 참조).
    "Cache-Control": "no-store"
  });
  res.end(body);
}

export function sendText(res, status, text) {
  const body = Buffer.from(text, "utf8");
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length
  });
  res.end(body);
}

/**
 * 쿼리 파서 — 한 벌로 두 런타임을 다 받는다.
 * Vercel 도 req.url 에 쿼리 문자열을 그대로 실어 주므로 이것만으로 충분하다.
 * req.query 는 빈 자리를 메우는 용도로만 본다 (URL 쪽이 항상 이긴다 — 결정적이어야 한다).
 */
export function paramsFrom(req) {
  const url = new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`);
  const sp = url.searchParams;

  if (req.query && typeof req.query === "object") {
    for (const [k, v] of Object.entries(req.query)) {
      if (sp.has(k)) continue;
      for (const item of Array.isArray(v) ? v : [v]) sp.append(k, String(item));
    }
  }
  return sp;
}

/**
 * 핸들러를 두 런타임이 다 부를 수 있는 (req, res) 함수로 감싼다.
 *
 * 405 검사가 여기 있는 이유: Vercel 에는 바깥 서버가 없어서 proxy.mjs 의
 * 전역 검사가 걸리지 않는다. proxy.mjs 쪽 검사와 중복되지만 둘 다 필요하다 —
 * 하나를 지우면 한쪽 런타임이 무방비가 된다.
 */
export function withErrors(handler) {
  return async function (req, res) {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJson(res, 405, { error: "BAD_REQUEST", message: "GET 만 지원합니다." });
      }

      const payload = await handler(paramsFrom(req), req);
      if (payload === undefined) return;   // 핸들러가 직접 응답을 쓴 경우
      return sendJson(res, 200, payload);
    } catch (err) {
      const { status, body } = toErrorResponse(err);

      // 이미 헤더가 나갔으면 두 번 쓸 수 없다. 여기서 end() 하지 않으면
      // Vercel 에서는 응답 스트림이 안 닫혀 타임아웃까지 매달린다.
      if (res.headersSent || res.writableEnded) {
        if (!res.writableEnded) res.end();
        return;
      }
      return sendJson(res, status, body);
    }
  };
}
