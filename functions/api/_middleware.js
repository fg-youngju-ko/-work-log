import { verifyPin } from '../../lib/auth.js';
import { json } from '../../lib/http.js';

// /api/pin/verify만 공개(후보 PIN을 확인하는 용도라 인증을 걸 수 없음, 자체 잠금 로직으로 방어).
// 그 외 모든 /api/* 요청은 Authorization: Bearer <4자리 PIN> 필요.
// PIN 변경(PATCH /api/pin)도 이 미들웨어를 그대로 통과해야 하므로, 현재 PIN을 Bearer로
// 보내는 것 자체가 "기존 PIN을 안다"는 증명이 되어 별도 분기 없이 자연히 보호된다.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname === '/api/pin/verify') return next();

  const auth = request.headers.get('Authorization') || '';
  const pin = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const ok = await verifyPin(env, pin);
  if (!ok) return json({ error: 'PIN이 올바르지 않습니다' }, 401);
  return next();
}
