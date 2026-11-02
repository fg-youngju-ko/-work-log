import { verifyPin, checkLockout, recordFailedAttempt, clearLockout, MAX_ATTEMPTS } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';

// POST /api/pin/verify — 공개 엔드포인트(미들웨어에서 제외됨). 후보 PIN이 맞는지만 확인.
export async function onRequestPost({ request, env }) {
  const lockout = await checkLockout(env);
  if (lockout.locked) {
    const minutesLeft = Math.ceil((lockout.lockUntil - Date.now()) / 60000);
    return json({ error: `너무 많이 틀렸습니다. ${minutesLeft}분 후 다시 시도하세요.` }, 429);
  }

  const { pin } = await request.json().catch(() => ({}));
  const ok = await verifyPin(env, pin);
  if (!ok) {
    const r = await recordFailedAttempt(env, lockout.attempts);
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - r.attempts);
    return json({ error: 'PIN이 올바르지 않습니다', attemptsLeft }, 401);
  }

  await clearLockout(env);
  return json({ ok: true });
}
