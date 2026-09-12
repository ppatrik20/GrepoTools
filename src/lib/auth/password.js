import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// Precomputed valid bcrypt hash with 12 rounds for timing-safe dummy verification
const DUMMY_HASH = '$2a$12$e8M9R7R8q1oZg0i1s3HqQeL2Z2o.7VwKjR0uD5C3P6V7Y1A3N9tqK';

/**
 * Hashes a plaintext password using bcrypt with 12 salt rounds.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Performs a constant-work bcrypt comparison to mitigate user enumeration timing side-channels
 * when a username does not exist.
 * @param {string} [password]
 * @returns {Promise<boolean>}
 */
export async function dummyVerify(password = '') {
  try {
    await bcrypt.compare(typeof password === 'string' ? password : '', DUMMY_HASH);
  } catch {
    // Suppress errors during dummy comparison
  }
  return false;
}
