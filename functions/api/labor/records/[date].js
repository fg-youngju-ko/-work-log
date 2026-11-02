import { json } from '../../../../lib/http.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PUT /api/labor/records/:date — 하루치 근태 기록 통째로 교체(없으면 생성)
export async function onRequestPut({ request, env, params }) {
  const date = params.date;
  if (!DATE_RE.test(date)) return json({ error: '날짜 형식이 올바르지 않습니다(YYYY-MM-DD)' }, 400);
  const text = await request.text();
  try {
    JSON.parse(text);
  } catch {
    return json({ error: '유효한 JSON이 아닙니다' }, 400);
  }
  await env.DB.prepare(
    `INSERT INTO labor_records (date, detail, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET detail = excluded.detail, updated_at = excluded.updated_at`
  )
    .bind(date, text)
    .run();
  return json({ ok: true });
}

// DELETE /api/labor/records/:date — 그날 기록 삭제(평범한 근무일로 되돌림)
export async function onRequestDelete({ params, env }) {
  await env.DB.prepare('DELETE FROM labor_records WHERE date = ?').bind(params.date).run();
  return json({ ok: true });
}
