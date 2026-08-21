/* Vercel 서버리스 함수 진입점. 로직은 _lib/search.js 에 있다.
   server/proxy.mjs 도 이 파일을 그대로 import 한다 — 로컬과 배포가
   같은 함수 객체를 돌려야 withErrors 의 버그가 로컬에서 드러난다. */
import { withErrors } from "./_lib/http.js";
import { searchHandler } from "./_lib/search.js";

export default withErrors(searchHandler);
