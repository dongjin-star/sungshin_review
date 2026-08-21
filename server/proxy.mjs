/* ============================================================
   proxy.mjs — 개발용 정적 서버
   ------------------------------------------------------------
   의존성 0. Node 내장(node:http, node:fs)만 쓴다.

   **이 파일은 이제 개발 전용 껍데기다.** API 로직은 전부 api/_lib/ 에 있고,
   배포(Vercel)에서는 api/*.js 가 서버리스 함수로 직접 실행된다.
   여기서는 그 **같은 함수 객체**를 import 해서 부른다 — 로컬과 배포가
   다른 코드를 돌면 로컬에서 통과한 것이 배포에서 깨진다.

   그래서 이 파일에 남은 것은 Vercel 이 CDN 으로 대신 해 주는 일,
   즉 정적 파일 서빙뿐이다.

   실행:  npm run dev   (기본 포트 5173)
   ============================================================ */

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sendJson, sendText } from "../api/_lib/http.js";
import { hasKakaoKey } from "../api/_lib/kakao.js";
import { hasGoogleKey } from "../api/_lib/places.js";

import searchFn   from "../api/search.js";
import categoryFn from "../api/category.js";
import reviewsFn  from "../api/reviews.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");          // 저장소 루트를 그대로 서빙한다
const PORT = Number(process.env.PORT) || 5173;

/** 경로 → Vercel 함수. 배포의 api/ 파일명과 1:1로 맞춘다. */
const API = new Map([
  ["/api/search",   searchFn],
  ["/api/category", categoryFn],
  ["/api/reviews",  reviewsFn]
]);

/* ============================================================
   정적 파일
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
  //
  // ⚠️ 배포에는 이 허용목록이 없다. Vercel 은 루트를 그대로 정적 서빙하므로
  //    .md 차단은 .vercelignore 가 대신한다. 둘 다 있어야 양쪽이 막힌다.
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
   라우팅
   ============================================================ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  // 이 검사는 withErrors 안에도 있다. 중복이지만 둘 다 필요하다 —
  // 여기 것은 정적 경로까지 덮고, 저기 것은 Vercel 을 덮는다.
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "BAD_REQUEST", message: "GET 만 지원합니다." });
  }

  if (pathname.startsWith("/api/")) {
    const fn = API.get(pathname);
    if (!fn) return sendJson(res, 404, { error: "BAD_REQUEST", message: "없는 엔드포인트입니다." });
    // 오류 처리는 withErrors 가 통째로 갖고 있다. 여기서 또 감싸지 않는다.
    // (api/_lib/*.js 를 HTTP 로 요청해도 이 분기에 걸려 404 JSON 이지 파일이 아니다)
    return await fn(req, res);
  }

  try {
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error("[static]", err?.message || err);
    sendText(res, 500, "Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`빼고 dev server → http://localhost:${PORT}/`);
  console.log(hasKakaoKey()
    ? "  카카오 키 감지됨 — 검색이 실서비스 데이터를 씁니다."
    : "  카카오 키 없음 — /api/search·category 는 503 NO_KEY, 화면은 씨드 12곳으로 동작합니다.");
  console.log(hasGoogleKey()
    ? "  구글 키 감지됨 — 리뷰 조회가 동작합니다."
    : "  구글 키 없음 — /api/reviews 는 503 NO_KEY, 리뷰 영역만 조용히 접힙니다.");
});
