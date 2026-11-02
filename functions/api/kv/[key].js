import { json } from '../../../lib/http.js';
import { KV_ALLOWED_KEYS } from '../../../lib/kv.js';

// PUT /api/kv/:key — 알려진 키 하나의 값을 통째로 교체(allowlist로 임의 키 저장 방지).
export async function onRequestPut({ request, env, params }) {
  const key = decodeURIComponent(params.key);
  if (!KV_ALLOWED_KEYS.includes(key)) return json({ error: '알 수 없는 키입니다' }, 400);

  const text = await request.text();
  try {
    JSON.parse(text); // 유효한 JSON인지만 검증, 저장은 원문 그대로(재인코딩 왕복 방지)
  } catch {
    return json({ error: '유효한 JSON이 아닙니다' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(key, text)
    .run();
  return json({ ok: true });
}
