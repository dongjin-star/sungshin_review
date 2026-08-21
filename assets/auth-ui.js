/* ============================================================
   auth-ui.js — 헤더 버튼 + 로그인 모달
   ------------------------------------------------------------
   auth.js 와 나눈 이유: 로그인 **상태**를 쓰는 쪽(담기 게이트 등)은
   화면 코드를 끌고 올 이유가 없다. auth.js 는 순수 모듈로 두고
   DOM 을 만지는 것은 전부 여기에 모은다.

   모달 규칙은 CONTRACT 1.6 을 그대로 따른다 (구글 리뷰 모달과 동일):
   네이티브 <dialog> · showModal() · 닫기는 form method="dialog" 라
   JS 리스너를 붙이지 않는다 · 딤 클릭 닫기만 직접 붙인다.
   ============================================================ */

import { currentUser, onAuthChange, signIn, signUp, signOut } from "./auth.js";

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ------------------------------------------------------------
   헤더 — 로그인 / "OOO님 로그아웃"
   ------------------------------------------------------------ */
function renderStatus(user) {
  const box = $("#authStatus");
  if (!box) return;
  box.replaceChildren();

  if (!user) {
    const login = el("button", "auth-trigger", "로그인");
    login.type = "button";
    login.addEventListener("click", openAuthModal);
    box.append(login);
    return;
  }

  box.append(el("span", "auth-user", `${user.name}님`));

  const out = el("button", "auth-trigger", "로그아웃");
  out.type = "button";
  out.addEventListener("click", async () => {
    out.disabled = true;
    try { await signOut(); } finally { out.disabled = false; }
  });
  box.append(out);
}

/* ------------------------------------------------------------
   모달
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   모드 — 로그인 / 회원가입
   ------------------------------------------------------------
   회원가입 버튼이 곧바로 제출하지 않는다. **먼저 화면을 회원가입으로 바꾼다.**
   그래야 눌렀을 때 눈에 보이는 반응이 있다 — 조용히 제출하면 응답이 올 때까지
   아무 일도 안 일어난 것처럼 보이고, 로그인하려던 사람이 실수로 가입해 버린다.
   ------------------------------------------------------------ */
let mode = "login";

const COPY = {
  login: {
    title: "로그인",
    submit: "로그인",
    switch: "회원가입",
    autocomplete: "current-password"
  },
  signup: {
    title: "회원가입",
    submit: "가입하기",
    switch: "로그인으로 돌아가기",
    autocomplete: "new-password"
  }
};

function setMode(next) {
  mode = next;
  const c = COPY[next];

  $("#authModalTitle").textContent = c.title;
  $("#authSubmitBtn").textContent  = c.submit;
  $("#authSwitchBtn").textContent  = c.switch;
  $("#authNameField").hidden = next !== "signup";
  $("#authPassword").setAttribute("autocomplete", c.autocomplete);

  clearMessages();
}

function showError(message) {
  const err = $("#authError");
  const notice = $("#authNotice");
  if (notice) notice.textContent = "";
  if (err) err.textContent = message || "";
}

/** 성공·안내용. 빨간 글씨가 아니다 — "메일 보냈어요" 는 실패가 아니다. */
function showNotice(message) {
  const err = $("#authError");
  const notice = $("#authNotice");
  if (err) err.textContent = "";
  if (notice) notice.textContent = message || "";
}

function clearMessages() {
  showError("");
  const notice = $("#authNotice");
  if (notice) notice.textContent = "";
}

function setBusy(on) {
  const form = $("#authForm");
  if (!form) return;
  form.querySelectorAll("button, input").forEach(n => { n.disabled = on; });
}

/**
 * 정리를 **열 때** 한다. 닫을 때가 아니다.
 *
 * <dialog> 의 close 이벤트를 믿을 수 없기 때문이다 — Chrome 151 에서는
 * 방금 만든 빈 dialog 조차 close 를 발생시키지 않는 것을 실측했다.
 * 거기에 정리를 걸면 다음에 열었을 때 지난 입력값과 모드가 그대로 남는다.
 *
 * 열 때 정리하면 이벤트에 기대지 않고, 사용자가 화면을 보는 바로 그 시점에
 * 항상 깨끗하다. 어느 쪽이든 결과가 같으므로 이쪽이 무조건 낫다.
 */
export function openAuthModal() {
  const dlg = $("#authModal");
  if (!dlg) return;
  $("#authForm")?.reset();
  setMode("login");
  if (!dlg.open) dlg.showModal();
  $("#authEmail")?.focus();
}

function closeAuthModal() {
  const dlg = $("#authModal");
  if (dlg?.open) dlg.close();
}

/** 지금 모드로 제출한다. */
async function submit() {
  const email    = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const name     = $("#authName").value.trim();

  if (!email || !password) {
    showError("이메일과 비밀번호를 입력해 주세요.");
    return;
  }
  // 가입은 여기서 먼저 거른다. 서버 오류를 정상 경로로 쓰면 왕복이 낭비고,
  // Supabase 의 가입 요청 수 제한(IP당 시간당 30회)도 아낀다.
  if (mode === "signup") {
    if (!name) { showError("이름을 입력해 주세요."); return; }
    if (password.length < 6) { showError("비밀번호를 6자 이상으로 지어 주세요."); return; }
  }

  clearMessages();
  setBusy(true);
  try {
    if (mode === "signup") {
      const result = await signUp(email, password, name);
      if (result.status === "confirm_required") {
        // 가입은 됐지만 확인 메일을 기다려야 한다. 실패가 아니므로 안내로 낸다.
        showNotice(`${email} 로 확인 링크를 보냈어요. 링크를 누르면 로그인돼요.`);
        $("#authPassword").value = "";
        return;   // 창을 닫지 않는다 — 방금 뭘 해야 하는지 읽어야 한다
      }
    } else {
      await signIn(email, password);
    }

    // 성공했으니 입력값을 남기지 않는다 — 특히 비밀번호
    $("#authForm").reset();
    closeAuthModal();
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(false);
  }
}

function wireModal() {
  const dlg  = $("#authModal");
  const form = $("#authForm");
  if (!dlg || !form) return;

  // 닫기 버튼에는 리스너를 붙이지 않는다 — <form method="dialog"> 안의 submit
  // 이라 브라우저가 닫아 준다. 이 함수가 안 불려도 닫기는 살아 있어야 한다.

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });

  // 보조 버튼은 제출이 아니라 **모드 전환**이다. 눌렀을 때 화면이 바뀌는 게
  // 사용자가 기대하는 반응이고, 로그인하려다 실수로 가입되는 것도 막는다.
  $("#authSwitchBtn")?.addEventListener("click", () => {
    setMode(mode === "login" ? "signup" : "login");
    $(mode === "signup" ? "#authName" : "#authEmail")?.focus();
  });

  // 정리의 본체는 openAuthModal 에 있다 (close 이벤트를 믿을 수 없다).
  // 이건 덤이다 — 발생하면 더 빨리 지워질 뿐, 안 발생해도 문제없다.
  dlg.addEventListener("close", () => { form.reset(); setMode("login"); });

  // 딤 배경 클릭으로 닫기. <dialog> 는 기본으로 안 해 준다.
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right
                && e.clientY >= r.top  && e.clientY <= r.bottom;
    if (!inside) closeAuthModal();
  });
}

/* ------------------------------------------------------------
   시작
   ------------------------------------------------------------ */
wireModal();
// onAuthChange 는 붙는 즉시 현재 상태로 한 번 부른다 — 초기 렌더가 따로 필요 없다.
onAuthChange(renderStatus);

// 로그인 상태가 바뀌면 열려 있던 창을 닫는다 (다른 탭에서 로그인한 경우 등)
onAuthChange((user) => { if (user) closeAuthModal(); });

export { currentUser };
