/* ============================================================
   search.js — GET /api/search 의 로직
   ------------------------------------------------------------
   핸들러는 res 를 모른다. 페이로드를 return 하면 http.js 의 withErrors 가
   내보낸다. 그래서 이 파일에는 HTTP 의존이 없다.
   ============================================================ */

import { BadRequest } from "./errors.js";
import { readLocation } from "./params.js";
import { callKakao, KAKAO_KEYWORD } from "./kakao.js";
import { toPayload } from "./normalize.js";

export async function searchHandler(sp) {
  // 문구를 params.text() 로 일반화하지 않는다 — 화면에 그대로 찍히는 문장이라
  // "검색어(q)가 필요합니다"가 "검색어(q) 값이 필요합니다"로 바뀌면 안 된다.
  const q = (sp.get("q") || "").trim();
  if (!q) throw new BadRequest("검색어(q)가 필요합니다.");
  if (q.length > 80) throw new BadRequest("검색어가 너무 깁니다.");

  const { x, y, radius, page, origin } = readLocation(sp);

  // 반경은 클라이언트가 명시적으로 보낼 때만 건다. 기본은 "전국"이다.
  //
  // x/y 는 그대로 보낸다 — 버리면 안 된다. 카카오는 좌표만 있고 반경이 없으면
  // 지역어가 없는 질의("파스타")는 좌표에서 가까운 순으로, 지역어가 있는 질의
  // ("부산 돼지국밥")는 그 지역으로 알아서 넘긴다. 실측:
  //   파스타 + 성수동 x/y, 반경 없음        → 성수동 결과
  //   부산 돼지국밥 + 성수동 x/y, 반경 없음 → 부산 결과
  //   부산 돼지국밥 + 성수동 x/y, 반경 1km  → 0건   ← 반경을 걸면 이렇게 된다
  const data = await callKakao(KAKAO_KEYWORD, {
    query: q, x, y, radius: radius || null, page, size: 15, category_group_code: "FD6"
  });
  return toPayload(data, origin, page);
}
