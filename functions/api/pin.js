import { setPinHash } from '../../lib/auth.js';
import { json } from '../../lib/http.js';

// PATCH /api/pin — PIN 변경. _middleware.js가 이미 현재 PIN(Bearer)을 검증했으므로
// 여기서는 새 PIN 형식만 확인하고 바로 교체한다.
export async function onRequestPatch({ request, env }) {
  const { newPin } = await request.json().catch(() => ({}));
  if (!/^\d{4}$/.test(newPin || '')) {
    return json({ error: '새 PIN은 4자리 숫자여야 합니다' }, 400);
  }
  await setPinHash(env, newPin);
  return json({ ok: true });
}
