import { json } from '../../../lib/http.js';
import { sanitizeEntry } from '../../../lib/entries.js';

// PUT /api/entries/:id — 1건 수정(없으면 생성, 가져오기/동기화 재시도에도 안전하도록 upsert)
export async function onRequestPut({ request, env, params }) {
  const body = await request.json().catch(() => ({}));
  const e = sanitizeEntry(body, params.id);
  if (!e.content || !e.start) return json({ error: 'content, start는 필수입니다' }, 400);
  await env.DB.prepare(
    `INSERT INTO entries (id, content, start, end, category, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content, start = excluded.start, end = excluded.end,
       category = excluded.category, source = excluded.source, updated_at = excluded.updated_at`
  )
    .bind(e.id, e.content, e.start, e.end, e.category, e.source, e.createdAt, e.updatedAt)
    .run();
  return json(e);
}

// DELETE /api/entries/:id
export async function onRequestDelete({ params, env }) {
  const r = await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(params.id).run();
  return json({ deleted: r.meta.changes });
}
