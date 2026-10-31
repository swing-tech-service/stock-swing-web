// Server-only authentication hand-off. Never import this module into a client component.
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const ANALYSIS_SESSION_TTL_SECONDS = 2 * 60 * 60;
type Claims = { v: 1; user: string; target: 'u001'; iat: number; exp: number; credential: string };
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
function signingKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Analysis session signing is unavailable');
  return createHmac('sha256', secret).update('stock-swing/analysis-session/v1').digest();
}
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function credentialBinding(user: string, target: string, hash: string) {
  return createHmac('sha256', signingKey()).update(`credential\0${user}\0${target}\0${hash}`).digest('hex');
}

// Call only after the dashboard's existing validatePocAccess succeeded.
export function issueAnalysisSession(user: string, target: string, accessKey: string, now = Date.now()) {
  if (!validId(user) || target !== 'u001' || !accessKey) throw new Error('Invalid authenticated dashboard identity');
  const iat = Math.floor(now / 1000);
  const hash = createHash('sha256').update(accessKey).digest('hex');
  const claims: Claims = {v:1,user,target,iat,exp:iat + ANALYSIS_SESSION_TTL_SECONDS,
    credential:credentialBinding(user,target,hash)};
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', signingKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAnalysisSession(token: unknown, target: string, now = Date.now()): Claims | null {
  if (typeof token !== 'string' || token.length > 2048 || target !== 'u001') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', signingKey()).update(parts[0]).digest('base64url');
  if (!equal(parts[1], expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    if (!c || c.v !== 1 || !validId(c.user) || c.target !== target ||
        !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.iat > seconds + 30 ||
        c.exp <= seconds || c.exp - c.iat !== ANALYSIS_SESSION_TTL_SECONDS ||
        typeof c.credential !== 'string' || !/^[a-f0-9]{64}$/.test(c.credential)) return null;
    return c as Claims;
  } catch { return null; }
}

export function matchesSessionCredential(c: Claims, currentHash: unknown) {
  return typeof currentHash === 'string' && /^[a-f0-9]{64}$/.test(currentHash) &&
    equal(c.credential, credentialBinding(c.user,c.target,currentHash));
}
