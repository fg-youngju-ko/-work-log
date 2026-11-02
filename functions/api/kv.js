import { json } from '../../lib/http.js';

// GET /api/kv — 알려진 모든 키를 한 번에 반환(프런트가 페이지 로드 시 한 번만 호출).
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT key, value FROM kv_store').all();
  const out = {};
  results.forEach((row) => {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      /* 손상된 값은 건너뜀 */
    }
  });
  return json(out);
}
