import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-ctr';
const ENC_PREFIX = 'enc:';

function getKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) return null;
  return Buffer.from(keyHex, 'hex');
}

// Encrypts a plaintext API key; returns "enc:iv:ciphertext" or plaintext if no key configured
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

// Decrypts a stored API key; handles legacy plaintext values gracefully
export function decryptApiKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) return null;
  try {
    const rest = stored.slice(ENC_PREFIX.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return null;
    const iv = Buffer.from(rest.slice(0, colonIdx), 'hex');
    const enc = Buffer.from(rest.slice(colonIdx + 1), 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
