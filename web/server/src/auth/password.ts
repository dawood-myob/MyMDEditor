import crypto from 'node:crypto';

const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, keylen = KEYLEN): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, keylen, { N: n, r: 8, p: 1, maxmem: 256 * n * 8 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Format: scrypt$N$r$p$salt(b64)$hash(b64) */
export async function hashPassword(password: string, n = 16384): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, n);
  return `scrypt$${n}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  if (!Number.isInteger(n) || n < 1024 || n > 1 << 20) return false;
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  if (expected.length === 0) return false;
  const actual = await scrypt(password, salt, n, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;
/** Burns the same CPU as a real verification so unknown users are not distinguishable by timing. */
export async function verifyDummy(password: string, n = 16384): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing', n);
  await verifyPassword(password, await dummyHash);
}
