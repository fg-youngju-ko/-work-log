import { json } from '../../../lib/http.js';

// GET /api/labor/records — 날짜별 근태 기록 전체(entries처럼 영구 누적, 전체를 한 번에 반환)
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT date, detail FROM labor_records ORDER BY date').all();
  const out = {};
  results.forEach((row) => {
    try {
      out[row.date] = JSON.parse(row.detail);
    } catch {
      /* 손상된 값은 건너뜀 */
    }
  });
  return json(out);
}
