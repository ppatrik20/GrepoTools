import crypto from 'crypto';

/**
 * Validates bearer authorization against ADMIN_PASSWORD environment variable.
 * Eliminates default 'admin' fallback passwords and performs constant-time comparison
 * using fixed-length SHA-256 digests to prevent timing attacks and buffer length leaks.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function verifyAdminBearerAuth(request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.trim() === '') {
    return false;
  }

  if (!request || !request.headers || typeof request.headers.get !== 'function') {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || typeof authHeader !== 'string') {
    return false;
  }

  const trimmedHeader = authHeader.trim();
  if (!/^bearer\s+/i.test(trimmedHeader)) {
    return false;
  }

  const token = trimmedHeader.replace(/^bearer\s+/i, '').trim();
  if (!token) {
    return false;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const expectedHash = crypto.createHash('sha256').update(adminPassword.trim()).digest();

  return crypto.timingSafeEqual(tokenHash, expectedHash);
}

/**
 * Validates raw password string against ADMIN_PASSWORD using constant-time comparison.
 *
 * @param {string} password
 * @returns {boolean}
 */
export function verifyAdminPassword(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.trim() === '') {
    return false;
  }

  if (!password || typeof password !== 'string' || password.trim() === '') {
    return false;
  }

  const tokenHash = crypto.createHash('sha256').update(password.trim()).digest();
  const expectedHash = crypto.createHash('sha256').update(adminPassword.trim()).digest();

  return crypto.timingSafeEqual(tokenHash, expectedHash);
}

export * from './auth/password.js';
export * from './auth/tokens.js';
export * from './auth/audit.js';
export * from './auth/rbac.js';
export * from './auth/bootstrap.js';


