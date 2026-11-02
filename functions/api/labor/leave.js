import { json } from '../../../lib/http.js';

function rowToEntry(row) {
  return { id: row.id, date: row.date, kind: row.kind, hours: row.hours, memo: row.memo, createdAt: row.created_at };
}

// GET /api/labor/leave — 연차 부여/조정 내역 전체(수동 입력분만, 사용분은 labor_records에서 derive)
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM leave_ledger ORDER BY date').all();
  return json(results.map(rowToEntry));
}

// POST /api/labor/leave — 부여/조정 1건 추가
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const id = body.id || crypto.randomUUID();
  const date = String(body.date || '').slice(0, 10);
  const kind = body.kind === 'adjust' ? 'adjust' : 'grant';
  const hours = Number(body.hours);
  if (!date || !Number.isFinite(hours)) return json({ error: 'date, hours는 필수입니다' }, 400);
  const memo = body.memo ? String(body.memo).slice(0, 500) : null;
  const createdAt = body.createdAt || new Date().toISOString();
  await env.DB.prepare('INSERT INTO leave_ledger (id, date, kind, hours, memo, created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, date, kind, hours, memo, createdAt)
    .run();
  return json({ id, date, kind, hours, memo, createdAt }, 201);
}
