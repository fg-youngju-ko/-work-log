import { json } from '../../lib/http.js';
import { sanitizeEntry, rowToEntry } from '../../lib/entries.js';

// GET /api/entries — 전체 목록(업무일지는 영구 누적되므로 페이지네이션 없이 전체 반환,
// 다만 row 단위 테이블이라 N+1 없이 단일 쿼리).
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM entries ORDER BY start DESC').all();
  return json(results.map(rowToEntry));
}

// POST /api/entries — 1건 생성(기존 localStorage용 entry 객체 형태 그대로 받음).
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const e = sanitizeEntry(body, crypto.randomUUID());
  if (!e.content || !e.start) return json({ error: 'content, start는 필수입니다' }, 400);
  await env.DB.prepare(
    'INSERT INTO entries (id, content, start, end, category, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  )
    .bind(e.id, e.content, e.start, e.end, e.category, e.source, e.createdAt, e.updatedAt)
    .run();
  return json(e, 201);
}
