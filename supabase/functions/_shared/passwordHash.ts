// PBKDF2-SHA256 password/answer hashing using Web Crypto.
// Format: "pbkdf2$<iter>$<saltB64>$<hashB64>"
// PBKDF2 is a NIST-approved KDF; with 210k iterations it is suitable
// for low-entropy KBA answers as a defense-in-depth replacement for raw SHA-256.

const ITER = 210_000;
const KEY_LEN = 32; // 256-bit
const PREFIX = "pbkdf2";

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    key,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashAnswer(answer: string): Promise<string> {
  const normalized = answer.toLowerCase().trim();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(normalized, salt, ITER);
  return `${PREFIX}$${ITER}$${b64encode(salt)}$${b64encode(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyAnswer(answer: string, stored: string): Promise<boolean> {
  const normalized = answer.toLowerCase().trim();

  if (stored.startsWith(`${PREFIX}$`)) {
    const parts = stored.split("$");
    if (parts.length !== 4) return false;
    const iter = parseInt(parts[1], 10);
    const salt = b64decode(parts[2]);
    const expected = b64decode(parts[3]);
    const actual = await derive(normalized, salt, iter);
    return timingSafeEqual(actual, expected);
  }

  // Legacy: raw SHA-256 hex (64 chars). Kept for backward compat;
  // callers should re-hash with hashAnswer() after a successful verify.
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    const hex = await sha256Hex(normalized);
    return timingSafeEqual(
      new TextEncoder().encode(hex),
      new TextEncoder().encode(stored.toLowerCase()),
    );
  }

  return false;
}

export function isLegacyHash(stored: string): boolean {
  return /^[0-9a-f]{64}$/i.test(stored);
}
