/* ============================================================
   category.js — GET /api/category 의 로직
   ============================================================ */

import { BadRequest } from "./errors.js";
import { readLocation } from "./params.js";
import { callKakao, KAKAO_CATEGORY } from "./kakao.js";
import { toPayload } from "./normalize.js";

/* 계약이 인정하는 그룹 코드만 통과시킨다 (CONTRACT.md 3절). */
const GROUP_CODES = new Set(["FD6", "CE7"]);

export async function categoryHandler(sp) {
  const group = (sp.get("group") || "FD6").trim().toUpperCase();
  if (!GROUP_CODES.has(group)) throw new BadRequest("지원하지 않는 카테고리 그룹입니다.");

  const { x, y, radius, page, origin } = readLocation(sp);
  // 카카오 카테고리 검색은 반경이 0이면 결과를 주지 않는다.
  const data = await callKakao(KAKAO_CATEGORY, {
    category_group_code: group, x, y, radius: radius || 1000, page, size: 15
  });
  return toPayload(data, origin, page);
}
