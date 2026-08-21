/* Vercel 서버리스 함수 진입점. 로직은 _lib/reviews.js 에 있다. */
import { withErrors } from "./_lib/http.js";
import { reviewsHandler } from "./_lib/reviews.js";

export default withErrors(reviewsHandler);
