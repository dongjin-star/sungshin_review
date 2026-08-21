/* Vercel 서버리스 함수 진입점. 로직은 _lib/category.js 에 있다. */
import { withErrors } from "./_lib/http.js";
import { categoryHandler } from "./_lib/category.js";

export default withErrors(categoryHandler);
