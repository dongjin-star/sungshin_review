/* ============================================================
   places.js — Google Places API (New) 호출
   ------------------------------------------------------------
   키는 이 파일 안에서만 읽힌다. kakao.js 와 같은 규칙이다.

   두 엔드포인트를 쓰는데 **필드마스크 형식이 서로 다르다**:
     Text Search   places:searchText   → "places.id,places.rating,…"  (접두사 있음)
     Place Details v1/places/{ID}      → "id,rating,…"                (접두사 없음)
   섞어 쓰면 400 이 온다.

   과금 주의: reviews / rating / userRatingCount 는 Places 의 최상위 등급
   (Enterprise + Atmosphere)이고, **한 요청에 걸린 가장 높은 등급으로 과금**된다.
   즉 리뷰 조회 한 번이 최상위 등급 요청 한 번이다. 클라이언트의 세션 캐시가
   비용 방어선이다.
   ============================================================ */

import { noKey } from "./errors.js";
import { fetchUpstreamJson } from "./upstream.js";

const SEARCH_TEXT = "https://places.googleapis.com/v1/places:searchText";
const DETAILS     = "https://places.googleapis.com/v1/places";

/** Text Search 용 — places. 접두사가 붙는다. */
const SEARCH_MASK =
  "places.id,places.location,places.displayName," +
  "places.rating,places.userRatingCount,places.reviews,places.googleMapsUri";

/** Place Details 용 — 접두사가 없다. */
const DETAILS_MASK = "id,location,displayName,rating,userRatingCount,reviews,googleMapsUri";

/** "걸어서 2분" = 150m. 이 반경 밖은 같은 이름이어도 다른 가게로 본다. */
export const REVIEW_RADIUS_M = 150;

/** 후보를 몇 개 받아 볼지. 요청 수가 아니라 한 요청의 응답 크기 문제다. */
const PAGE_SIZE = 10;

const DENIED = "구글 API 키가 거부됐습니다.";
const FAIL   = "구글 리뷰를 불러오지 못했습니다.";

/** 여기서만 키를 읽는다. */
function readKey() {
  const key = (process.env.GOOGLE_MAPS_API_KEY || "").trim();
  return key.length ? key : null;
}

/** 부팅 배너용. 값은 주지 않는다. */
export function hasGoogleKey() {
  return readKey() !== null;
}

function requireKey() {
  const key = readKey();
  if (!key) throw noKey("GOOGLE_MAPS_API_KEY 가 설정되지 않았습니다.");
  return key;
}

/**
 * 이름(+주소)으로 찾는다.
 *
 * locationBias 는 **제한이 아니라 편향**이다. 근처에 마땅한 게 없으면 구글은
 * 수 km 밖 결과를 아무렇지 않게 돌려준다. 그래서 반경 검사는 호출자가
 * metersBetween 으로 다시 해야 한다 — reviews.js 의 pickNearest 가 그 자리다.
 * (locationRestriction 은 사각형만 받고 카테고리 질의 전용이라 못 쓴다.)
 */
export async function searchText(textQuery, { lat, lng }) {
  const key = requireKey();
  return fetchUpstreamJson(
    SEARCH_TEXT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": SEARCH_MASK
      },
      body: JSON.stringify({
        textQuery,
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: REVIEW_RADIUS_M }
        },
        languageCode: "ko",
        regionCode: "KR",
        pageSize: PAGE_SIZE
      })
    },
    { label: "places:searchText", deniedMessage: DENIED, failMessage: FAIL }
  );
}

/**
 * place_id 로 바로 조회. 이미 확인된 가게라 반경 재검사가 필요 없다.
 *
 * languageCode 를 **쿼리 파라미터**로 보낸다 — Text Search 는 POST 본문에 넣지만
 * 이쪽은 GET 이라 자리가 다르다. 빠뜨리면 구글이 영문명을 준다:
 * "성수족발" 이 "Seongsu Braised Pork Feet" 로 돌아온다. 캐시된 가게를 다시 열 때만
 * 이름이 영어로 바뀌는 형태라 눈에 잘 안 띈다.
 */
export async function placeDetails(placeId) {
  const key = requireKey();
  const url = new URL(`${DETAILS}/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", "ko");
  url.searchParams.set("regionCode", "KR");

  return fetchUpstreamJson(
    url,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": DETAILS_MASK
      }
    },
    { label: "places/{id}", deniedMessage: DENIED, failMessage: FAIL }
  );
}

/* ------------------------------------------------------------
   정규화 — 구글 원본 필드명은 여기서 끝난다.
   클라이언트는 displayName.text 나 authorAttribution 을 알지 못한다.
   ------------------------------------------------------------ */

/**
 * 구글 Review → 우리 형태.
 * 본문을 자르지 않는다. 구글 정책이 리뷰 원문의 변형·절단을 금지한다.
 */
function normalizeReview(r) {
  const author = r?.authorAttribution || {};
  const rating = Number(r?.rating);
  return {
    id:           String(r?.name || ""),
    rating:       Number.isFinite(rating) ? rating : null,
    text:         String(r?.text?.text || r?.originalText?.text || ""),
    author:       String(author.displayName || ""),
    authorUri:    String(author.uri || ""),
    relativeTime: String(r?.relativePublishTimeDescription || ""),
    publishTime:  String(r?.publishTime || ""),
    googleMapsUri: String(r?.googleMapsUri || "")
  };
}

/** 구글 Place → 우리 형태. 두 엔드포인트의 응답이 같은 모양이라 공용이다. */
export function normalizePlace(p) {
  const rating = Number(p?.rating);
  const count  = Number(p?.userRatingCount);
  const reviews = Array.isArray(p?.reviews) ? p.reviews : [];

  return {
    placeId:       String(p?.id || ""),
    name:          String(p?.displayName?.text || ""),
    rating:        Number.isFinite(rating) ? rating : null,
    reviewCount:   Number.isFinite(count) ? count : null,
    googleMapsUri: String(p?.googleMapsUri || ""),
    // 구글이 최대 5개를 준다. slice 는 그 상한이 바뀌어도 계약이 흔들리지 않게 하는 것이다.
    reviews:       reviews.slice(0, 5).map(normalizeReview)
  };
}

/** 구글 Place 의 좌표. 없으면 null 이다. */
export function placeCoords(p) {
  const lat = Number(p?.location?.latitude);
  const lng = Number(p?.location?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
