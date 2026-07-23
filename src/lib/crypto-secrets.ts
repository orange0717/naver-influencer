import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * 제3자 계정 자격증명(Google OAuth refresh token 등) 저장용 AES-256-GCM 암복호화.
 * TOKEN_ENCRYPTION_KEY는 32바이트를 base64로 인코딩한 값이어야 한다.
 * 예: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY는 base64로 인코딩된 32바이트 값이어야 합니다.');
  }
  return key;
}

/** 평문을 암호화해 "iv:authTag:ciphertext" (모두 base64) 형태의 문자열로 반환 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** encryptSecret으로 만든 문자열을 원문으로 복호화 */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = payload.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('잘못된 암호화 페이로드 형식입니다.');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
