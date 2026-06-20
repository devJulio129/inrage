import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Verificación del identityToken de "Sign in with Apple" sin dependencias extra:
// Apple firma el token (RS256) con llaves públicas publicadas como JWKS. Node
// importa el JWK directo (crypto.createPublicKey) y jsonwebtoken valida firma,
// emisor, audiencia y expiración.
const APPLE_ISS = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

let cache = { keys: null, at: 0 };

async function getAppleKeys() {
  if (cache.keys && Date.now() - cache.at < KEYS_TTL_MS) return cache.keys;
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error('No se pudieron obtener las llaves de Apple');
  const { keys } = await res.json();
  cache = { keys, at: Date.now() };
  return keys;
}

// Devuelve el payload verificado (sub, email, …) o lanza si el token no es válido.
// `audiences` = los bundle IDs / Services IDs autorizados (el `aud` del token).
export async function verifyAppleToken(identityToken, audiences) {
  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error('Token de Apple inválido');

  let keys = await getAppleKeys();
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Apple rotó sus llaves: fuerza un refresh y reintenta una vez.
    cache = { keys: null, at: 0 };
    keys = await getAppleKeys();
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('Llave de Apple no encontrada');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISS,
    audience: audiences
  });
}
