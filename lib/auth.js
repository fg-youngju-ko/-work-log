// 개인 전용 도구라 복잡한 로그인 체계 대신 4자리 PIN 하나만 사용한다.
// 초기값 "0000", settings 테이블에 아무 값도 없으면 최초 요청 때 자동으로 시딩한다.
const DEFAULT_PIN = '0000';
const MAX_ATTEMPTS = 10;
const LOCK_MINUTES = 15;

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(key, value)
    .run();
}

async function getPinHash(env) {
  const existing = await getSetting(env, 'pin_hash');
  if (existing) return existing;
  const defaultHash = await sha256Hex(DEFAULT_PIN);
  await setSetting(env, 'pin_hash', defaultHash);
  return defaultHash;
}

export async function setPinHash(env, newPin) {
  const hash = await sha256Hex(newPin);
  await setSetting(env, 'pin_hash', hash);
}

export async function verifyPin(env, candidate) {
  if (!/^\d{4}$/.test(candidate || '')) return false;
  const hash = await getPinHash(env);
  const candidateHash = await sha256Hex(candidate);
  return candidateHash === hash;
}

// 브루트포스로 4자리를 전부 시도하는 걸 막기 위한 아주 단순한 잠금 장치.
// 단일 사용자 도구라 IP별이 아니라 전역 카운터로 충분하다고 판단함.
export async function checkLockout(env) {
  const raw = await getSetting(env, 'pin_lockout');
  if (!raw) return { locked: false, attempts: 0 };
  const data = JSON.parse(raw);
  if (data.lockUntil && Date.now() < data.lockUntil) {
    return { locked: true, attempts: data.attempts, lockUntil: data.lockUntil };
  }
  return { locked: false, attempts: 0 }; // 잠금 기간이 지났으면 리셋
}

export async function recordFailedAttempt(env, currentAttempts) {
  const attempts = currentAttempts + 1;
  const lockUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MINUTES * 60 * 1000 : null;
  await setSetting(env, 'pin_lockout', JSON.stringify({ attempts, lockUntil }));
  return { attempts, lockUntil };
}

export async function clearLockout(env) {
  await setSetting(env, 'pin_lockout', JSON.stringify({ attempts: 0, lockUntil: null }));
}

export { MAX_ATTEMPTS };
