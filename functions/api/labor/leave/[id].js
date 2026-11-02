import { json } from '../../../../lib/http.js';

// DELETE /api/labor/leave/:id — 부여/조정 1건 취소(원상 반영은 프런트에서 잔여량 재계산으로 자동 처리됨)
export async function onRequestDelete({ params, env }) {
  const r = await env.DB.prepare('DELETE FROM leave_ledger WHERE id = ?').bind(params.id).run();
  return json({ deleted: r.meta.changes });
}
