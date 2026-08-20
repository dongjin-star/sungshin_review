/* ============================================================
   ⚠️  SEED DATA — 여기만 수정하면 됩니다 (PRD 9장 유지보수 규칙)
   ------------------------------------------------------------
   ⚠️  경고: 아래 12곳은 구조 검증용 임시 데이터입니다.
       가게명·메모·방문일이 실재하지 않습니다.
       배포 전 반드시 실제 방문 기록 + 직접 촬영 사진으로 교체하세요.
       이 상태로 공개하면 PRD 10.5의 신뢰 규칙이 그대로 깨집니다.

   photo 를 비워두면 DESIGN 7.2 규칙대로 단색 블록으로 렌더됩니다.
   스톡 이미지·가게 홍보 사진은 넣지 않습니다.
   ============================================================ */
export const SERVICE_NAME = "빼고"; // 가제 (PRD 열린 이슈 1)

export const CATEGORIES = [
  { code: "korean",   label: "한식" },
  { code: "chinese",  label: "중식" },
  { code: "japanese", label: "일식" },
  { code: "western",  label: "양식" },
  { code: "snack",    label: "분식" },
  { code: "meat",     label: "고기" },
  { code: "asian",    label: "아시안" },
  { code: "fastfood", label: "패스트푸드" }
];

export const REGIONS = [
  { code: "seongsu", label: "성수동", lat: 37.5445, lng: 127.0557 }
];

export const PLACES = [
  { id:"place-001", name:"성수동 백반집",  category:"korean",   region:"seongsu", lat:37.5443, lng:127.0551, note:"제육이 짜지 않다. 혼자 가도 안 눈치보임", priceRange:1, author:"JJIn", visitedAt:"2026-07-21", photo:"", situationTags:["solo","family"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-002", name:"뚝섬 순두부",    category:"korean",   region:"seongsu", lat:37.5471, lng:127.0538, note:"국물이 맑다. 아침에 여는 몇 안 되는 곳", priceRange:1, author:"JJIn", visitedAt:"2026-07-03", photo:"", situationTags:["solo"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-003", name:"연무장 반점",    category:"chinese",  region:"seongsu", lat:37.5419, lng:127.0561, note:"짬뽕 국물에 불맛. 웨이팅은 1시 이후 없음", priceRange:2, author:"JJIn", visitedAt:"2026-06-28", photo:"", situationTags:["group"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-004", name:"성수 소바",      category:"japanese", region:"seongsu", lat:37.5456, lng:127.0592, note:"면을 직접 뽑는다. 여름에 줄이 길다",     priceRange:2, author:"JJIn", visitedAt:"2026-07-14", photo:"", situationTags:["solo","date"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-005", name:"서울숲 스시집",  category:"japanese", region:"seongsu", lat:37.5432, lng:127.0413, note:"점심 오마카세가 합리적. 예약 필수",       priceRange:3, author:"JJIn", visitedAt:"2026-05-30", photo:"", situationTags:["date","family"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-006", name:"성수 파스타",    category:"western",  region:"seongsu", lat:37.5468, lng:127.0574, note:"봉골레가 담백하다. 2인이면 딱 좋음",     priceRange:3, author:"JJIn", visitedAt:"2026-07-09", photo:"", situationTags:["date"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-007", name:"뚝섬 비스트로",  category:"western",  region:"seongsu", lat:37.5407, lng:127.0529, note:"저녁에만 연다. 조용해서 대화가 된다",     priceRange:3, author:"JJIn", visitedAt:"2026-06-11", photo:"", situationTags:["date","group"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-008", name:"연무장 분식",    category:"snack",    region:"seongsu", lat:37.5428, lng:127.0603, note:"떡볶이가 안 맵다. 튀김은 갓 튀겨줌",     priceRange:1, author:"JJIn", visitedAt:"2026-07-25", photo:"", situationTags:["solo","group"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-009", name:"성수 고깃집",    category:"meat",     region:"seongsu", lat:37.5459, lng:127.0546, note:"목살 두께가 좋다. 4인 이상은 예약",       priceRange:3, author:"JJIn", visitedAt:"2026-06-19", photo:"", situationTags:["group","family"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-010", name:"뚝섬 곱창",      category:"meat",     region:"seongsu", lat:37.5484, lng:127.0567, note:"초벌해서 나온다. 냄새 거의 없음",         priceRange:2, author:"JJIn", visitedAt:"2026-05-22", photo:"", situationTags:["group"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-011", name:"성수 쌀국수",    category:"asian",    region:"seongsu", lat:37.5437, lng:127.0578, note:"고수 빼달라 하면 잘 빼준다. 회전 빠름",   priceRange:1, author:"JJIn", visitedAt:"2026-07-30", photo:"", situationTags:["solo"], source:"seed", reviews:[], photos:[], savedCount:0 },
  { id:"place-012", name:"서울숲 버거",    category:"fastfood", region:"seongsu", lat:37.5449, lng:127.0441, note:"패티를 직접 굽는다. 감자는 평범",         priceRange:2, author:"JJIn", visitedAt:"2026-06-05", photo:"", situationTags:["solo","group"], source:"seed", reviews:[], photos:[], savedCount:0 }
];

/* ============================================================
   SEED DATA 끝 — 아래는 수정할 일이 거의 없습니다
   ============================================================ */
