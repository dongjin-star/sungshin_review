/* ============================================================
   auth.js — Supabase 로그인 · 세션
   ------------------------------------------------------------
   이 파일의 본체는 UI 가 아니라 **다른 기능이 "지금 누가 로그인했나"를
   물어보는 표면**이다. 담기를 계정에 묶는 다음 작업이 여기 얹힌다.

     import { currentUser } from "./auth.js";
     if (!currentUser()) { openAuthModal(); return; }

   알아둘 결정 (코드만 봐서는 이유가 안 보이는 것들):

   - **currentUser() 는 동기다.** 세션이 localStorage 에 있어 모듈 로드
     시점에 즉시 복원되기 때문이다. 소비자가 await 없이 물어볼 수 있어야
     게이트 코드가 한 줄로 끝난다.

   - **키를 여기 그대로 적는다.** 카카오·구글 키와 정반대 정책이다.
     그 둘은 서버에서만 읽히지만(api/_lib/), Supabase publishable 키는
     브라우저에서 쓰라고 만든 키다. 빌드 단계가 없어 환경변수를 주입할
     방법도 없다. 대신 이 키로 할 수 있는 일은 서버의 RLS 가 정한다 —
     **담기를 테이블로 옮기는 순간 RLS 정책이 필수가 된다.**
     service_role / secret 키는 절대 여기 넣지 않는다.

   - **비밀번호는 우리가 손대지 않는다.** 해싱·검증 전부 Supabase 몫이고
     우리는 발급받은 토큰만 보관한다.

   - **로그인 실패를 "없는 이메일"과 "틀린 비밀번호"로 나누지 않는다.**
     Supabase 가 둘 다 invalid_credentials 로 뭉뚱그리는 건 계정 존재
     여부를 캐는 공격을 막기 위해서다. 우리도 그 선을 지킨다.
   ============================================================ */

const SUPABASE_URL = "https://rmgiknzlxygglxgruprq.supabase.co";
const SUPABASE_KEY = "sb_publishable_NaC_3zl0eS0i-TkwZqJTlQ_6jeopatU";

const AUTH = `${SUPABASE_URL}/auth/v1`;
const SESSION_KEY = "bbaego:session";

/** 만료 이 시간 전이면 미리 갱신한다. */
const REFRESH_MARGIN_MS = 60 * 1000;

/* ============================================================
   1. 세션 보관 — search.js 의 loadWishlist/saveWishlist 와 같은 어법
   ============================================================ */

/** @type {{access_token:string, refresh_token:string, expires_at:number, user:{id:string,email:string,name:string}}|null} */
let session = null;

const listeners = new Set();
let refreshTimer = 0;

function readSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    // 모양을 검증한다. 손상된 값 하나로 페이지가 멈추면 안 된다.
    if (!raw || !raw.access_token || !raw.refresh_token || !raw.user?.id) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeSession(next) {
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 사파리 프라이빗 모드 등 — 저장은 실패해도 이번 세션은 계속 돈다 */
  }
}

/** 세션을 바꾸는 유일한 통로. 저장 · 타이머 · 구독자 통지를 한자리에서 한다. */
function setSession(next) {
  session = next;
  writeSession(next);
  scheduleRefresh();
  for (const fn of listeners) {
    try { fn(currentUser()); } catch { /* 구독자 하나가 죽어도 나머지는 돈다 */ }
  }
}

/**
 * 구글 응답의 user → 우리 형태.
 * 이름이 없으면 이메일 앞부분으로 대신한다 — 헤더에 빈칸이 뜨면 안 된다.
 */
function toUser(raw) {
  const email = String(raw?.email || "");
  const meta = raw?.user_metadata || {};
  const name = String(meta.display_name || meta.name || "").trim() || email.split("@")[0];
  return { id: String(raw?.id || ""), email, name };
}

/** 토큰 응답 → 세션. expires_in(상대 초)을 절대 시각으로 바꿔 둔다. */
function toSession(data) {
  const ttl = Number(data?.expires_in);
  return {
    access_token:  String(data.access_token),
    refresh_token: String(data.refresh_token),
    expires_at:    Date.now() + (Number.isFinite(ttl) ? ttl : 3600) * 1000,
    user:          toUser(data.user)
  };
}

/* ============================================================
   2. 오류 → 한국어
   ------------------------------------------------------------
   실측한 응답 모양:
     {"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
   error_code 가 문자열이고 **code 는 HTTP 상태 번호**다. message 가 아니라 msg 다.
   ============================================================ */

const MESSAGES = {
  invalid_credentials:  "이메일 또는 비밀번호가 맞지 않아요.",
  user_already_exists:  "이미 가입된 이메일이에요. 로그인해 주세요.",
  email_exists:         "이미 가입된 이메일이에요. 로그인해 주세요.",
  weak_password:        "비밀번호를 6자 이상으로 지어 주세요.",
  email_address_invalid:"이메일 주소를 다시 확인해 주세요.",
  validation_failed:    "이메일 주소를 다시 확인해 주세요.",
  // 화면에 찍히는 문장이라 사용자에게 말한다. "Supabase 설정을 꺼라"는 운영자용
  // 지시이고 브라우저를 보는 사람이 할 수 있는 일이 아니다 —
  // 그 안내는 CLAUDE.md 미해결 항목에 적는다.
  email_not_confirmed:  "메일함으로 확인 링크를 보냈어요. 링크를 누르면 로그인할 수 있어요.",
  signup_disabled:      "지금은 회원가입을 받지 않아요.",
  over_request_rate_limit: "요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요.",

  // 서버 코드로는 "확인 메일 발송 한도 초과"(429)다. 이번 요청에서는 메일이
  // 나가지 않았다. 그런데도 이 문구를 쓰는 것은 **사용자 지정**이다 (2026-08-21).
  //
  // 사용자가 실제로 보는 상황은 대개 이렇다: 가입을 여러 번 눌렀고, 앞선
  // 시도에서 이미 확인 메일이 갔으며, 지금 눌린 건 한도에 막힌 재발송이다.
  // 그 경우 받은편지함에는 메일이 있다.
  //
  // 다만 첫 시도부터 한도에 걸리면 받을 메일이 없는데도 기다리게 된다.
  // 그래서 근본 해결은 문구가 아니라 대시보드에서 **Confirm email 을 끄는 것**이다
  // — 끄면 메일 경로 자체가 사라지고 가입 즉시 로그인된다 (CLAUDE.md 미해결 12).
  over_email_send_rate_limit: "메일을 확인해주세요.",
  NETWORK:              "연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요."
};

const FALLBACK = "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/** 응답 본문에서 문자열 코드만 꺼낸다. body.code 는 숫자라 섞으면 안 된다. */
function codeOf(body) {
  if (typeof body?.error_code === "string") return body.error_code;
  if (typeof body?.code === "string") return body.code;
  if (typeof body?.error === "string") return body.error;
  return null;
}

function authError(body, status) {
  const code = codeOf(body);
  let message = MESSAGES[code];

  // 서버의 영문 msg 는 화면에 내보내지 않는다 — api/_lib/errors.js 와 같은 규칙이다.
  // (weak_password 는 "Password should be at least 6 characters." 를 준다.)
  // 최소 길이는 대시보드 설정이라 여기 6이 하드코딩돼 있다. 설정을 올리면 이 문장도 같이 고친다.
  if (!message && status === 429) message = MESSAGES.over_request_rate_limit;

  return Object.assign(new Error(message || FALLBACK), { code: code || "UNKNOWN", status });
}

/* ============================================================
   3. 호출
   ============================================================ */

async function call(path, { method = "POST", body, token } = {}) {
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  // 토큰이 없으면 publishable 키를 Bearer 로 보낸다 — GoTrue 규약이다.
  headers.Authorization = `Bearer ${token || SUPABASE_KEY}`;

  let res;
  try {
    res = await fetch(`${AUTH}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // api/_lib/upstream.js 와 같은 값. 멈춘 요청이 로그인 버튼을 영영 돌게 두면 안 된다.
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw Object.assign(new Error(MESSAGES.NETWORK), { code: "NETWORK", status: 0 });
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* 상태 코드로 처리한다 */ }

  if (!res.ok) throw authError(data, res.status);
  return data;
}

/* ============================================================
   4. 토큰 갱신
   ------------------------------------------------------------
   리프레시 토큰은 1회용이라 동시에 두 번 쓰면 둘 다 죽는다.
   진행 중인 Promise 를 들고 있다가 재사용해서 요청을 한 개로 묶는다.
   ============================================================ */

let refreshing = null;

/**
 * 이 코드들만 "세션이 진짜 죽었다"로 본다. 나머지(5xx · 429 · 알 수 없는 4xx)는
 * 세션을 지키고 다음 기회에 다시 시도한다.
 *
 * 여기서 저지를 수 있는 최악의 실수는 **일시적 장애로 로그아웃시키는 것**이다.
 * 카페 와이파이가 502를 뱉었다고 사용자를 내쫓으면 안 된다.
 */
const REVOKED = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "invalid_grant",
  "session_not_found",
  "user_not_found",
  "user_banned"
]);

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!session) return;

  const delay = session.expires_at - Date.now() - REFRESH_MARGIN_MS;
  // setTimeout 은 2^31-1ms 를 넘으면 즉시 발화한다. 넘칠 일은 없지만 막아 둔다.
  const safe = Math.min(Math.max(delay, 0), 2 ** 31 - 1);
  refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, safe);
}

async function refresh() {
  if (!session) return null;
  if (refreshing) return refreshing;

  const token = session.refresh_token;
  refreshing = (async () => {
    try {
      const data = await call("/token?grant_type=refresh_token", {
        body: { refresh_token: token }
      });
      setSession(toSession(data));
      return session;
    } catch (err) {
      // 다른 탭이 먼저 갱신해서 토큰이 회전했을 수 있다. 그 경우 우리가 보낸
      // 토큰은 "이미 썼다"로 거절당하지만 **세션은 멀쩡하다.** 저장된 값이
      // 우리가 보낸 것과 다르면 옆 탭의 결과를 받아들이고 끝낸다.
      const stored = readSession();
      if (stored && stored.refresh_token !== token) {
        session = stored;
        scheduleRefresh();
        return session;
      }

      // 명시적으로 폐기된 경우에만 로그아웃한다. 네트워크·5xx·429·모르는 코드는
      // 세션을 지키고 다음 기회를 노린다.
      if (REVOKED.has(err.code)) {
        setSession(null);
      }
      throw err;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/* ============================================================
   5. 공개 API — 다른 기능이 쓰는 표면
   ============================================================ */

/** 지금 로그인한 사람. 없으면 null. **동기다.** */
export function currentUser() {
  return session ? session.user : null;
}

export function isLoggedIn() {
  return session !== null;
}

/**
 * 로그인 상태가 바뀔 때마다 호출된다. 구독을 끊는 함수를 돌려준다.
 * 붙이는 즉시 현재 상태로 한 번 부른다 — 소비자가 초기 렌더를 따로 안 해도 되게.
 */
export function onAuthChange(fn) {
  listeners.add(fn);
  try { fn(currentUser()); } catch { /* 구독자 사정 */ }
  return () => listeners.delete(fn);
}

/**
 * 유효한 액세스 토큰. 만료가 임박했으면 갱신해서 준다.
 * 지금은 아무도 안 쓰지만 담기를 Supabase 테이블로 옮길 때 필요한 조각이다.
 */
export async function accessToken() {
  if (!session) return null;
  if (session.expires_at - Date.now() > REFRESH_MARGIN_MS) return session.access_token;
  try {
    const next = await refresh();
    return next ? next.access_token : null;
  } catch {
    return null;
  }
}

export async function signIn(email, password) {
  const data = await call("/token?grant_type=password", {
    body: { email: String(email).trim(), password }
  });
  setSession(toSession(data));
  return currentUser();
}

/**
 * 가입하고 곧바로 로그인까지 간다.
 *
 * 프로젝트의 "Confirm email" 설정에 따라 응답이 갈린다:
 *   꺼짐 → access_token 이 함께 온다. 그대로 세션이 된다 → { status: "signed_in" }
 *   켜짐 → 유저만 오고 토큰이 없다 → { status: "confirm_required" }
 *
 * 이미 가입된 이메일만 throw 한다. 나머지 두 경우는 둘 다 성공이다.
 * @returns {Promise<{status:"signed_in"|"confirm_required", user:object}>}
 */
export async function signUp(email, password, name) {
  const clean = String(email).trim();
  const data = await call("/signup", {
    body: {
      email: clean,
      password,
      data: { display_name: String(name || "").trim() || clean.split("@")[0] }
    }
  });

  // 확인 메일이 켜져 있으면 Supabase 는 이미 가입된 이메일을 감춘다 —
  // 에러 대신 identities 가 빈 가짜 유저를 준다. 계정 열거를 막으려는 것이다.
  if (Array.isArray(data?.identities) && data.identities.length === 0) {
    throw Object.assign(new Error(MESSAGES.user_already_exists), { code: "user_already_exists" });
  }

  // 토큰이 없으면 "Confirm email" 이 켜져 있다는 뜻이다. **실패가 아니다** —
  // 계정은 만들어졌고 확인 링크를 기다리는 상태다. 그래서 throw 하지 않고
  // 상태를 돌려준다. 호출부가 빨간 오류가 아니라 안내로 낼 수 있어야 한다.
  if (!data?.access_token) {
    return { status: "confirm_required", user: toUser(data) };
  }

  setSession(toSession(data));
  return { status: "signed_in", user: currentUser() };
}

export async function signOut() {
  const token = session?.access_token;
  // 화면을 먼저 내린다. 서버 호출이 실패해도 로그아웃은 되어야 한다.
  setSession(null);
  if (!token) return;
  try {
    // scope=local 이 중요하다. 기본값은 global 이라 그 사용자의 **모든 기기**
    // 세션을 폐기한다 — 노트북에서 로그아웃했는데 폰에서도 풀린다.
    await call("/logout?scope=local", { token });
  } catch {
    /* 토큰은 이미 버렸다. 서버 쪽 정리가 실패해도 사용자에겐 로그아웃이 맞다 */
  }
}

/* ============================================================
   6. 초기 복원
   ============================================================ */

/**
 * 확인 메일 링크로 돌아온 경우 — Supabase 가 토큰을 **URL 해시**에 실어 보낸다.
 * 이걸 안 받으면 링크를 눌러도 로그인이 안 된 채로 첫 화면이 뜬다(고장으로 보인다).
 * 받은 즉시 주소창에서 지운다 — 살아 있는 토큰이 복사·공유·Referer 로 새면 안 된다.
 *
 * "Confirm email" 을 끄면 이 경로 자체가 안 쓰인다. 켜둔 채로 쓰려면
 * 대시보드에서 Site URL · Redirect URLs 도 등록해야 링크가 여기로 돌아온다.
 */
function adoptHashSession() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash.includes("access_token") && !hash.includes("error")) return false;

  const p = new URLSearchParams(hash);
  const access = p.get("access_token");
  const refreshTok = p.get("refresh_token");

  // 주소창은 성공이든 실패든 무조건 정리한다
  history.replaceState(null, "", location.pathname + location.search);

  if (!access || !refreshTok) return false;

  const ttl = Number(p.get("expires_in"));
  setSession({
    access_token: access,
    refresh_token: refreshTok,
    expires_at: Date.now() + (Number.isFinite(ttl) ? ttl : 3600) * 1000,
    // 해시에는 유저 정보가 없다. 아래에서 /user 로 채운다.
    user: { id: "", email: "", name: "" }
  });

  // 이름·이메일을 채우러 한 번만 다녀온다.
  call("/user", { method: "GET", token: access })
    .then(u => { if (session) setSession({ ...session, user: toUser(u) }); })
    .catch(() => { /* 실패해도 로그인 자체는 유효하다 */ });
  return true;
}

session = readSession();
if (!session) adoptHashSession();
if (session) {
  scheduleRefresh();
  // 이미 만료됐거나 임박했으면 지금 갱신한다. 실패는 refresh 안에서 갈린다.
  if (session.expires_at - Date.now() <= REFRESH_MARGIN_MS) refresh().catch(() => {});
}

// 노트북이 자다 깨면 갱신 타이머가 안 돌았을 수 있다. 화면이 다시 보일 때
// 만료됐으면 그 자리에서 갱신한다 — 타이머는 최적화일 뿐 보장이 아니다.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !session) return;
  if (session.expires_at - Date.now() <= REFRESH_MARGIN_MS) refresh().catch(() => {});
});

// 다른 탭에서 로그인/로그아웃하면 이 탭도 따라간다.
// 한 탭에서 로그아웃했는데 옆 탭이 로그인 상태로 남아 있으면 그게 더 헷갈린다.
window.addEventListener("storage", (e) => {
  if (e.key !== SESSION_KEY) return;
  session = readSession();
  scheduleRefresh();
  for (const fn of listeners) {
    try { fn(currentUser()); } catch { /* 구독자 사정 */ }
  }
});
