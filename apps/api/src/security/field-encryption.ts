import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AES_GCM_ALGORITHM, AES_GCM_IV_BYTES, AES_GCM_TAG_BYTES, DATA_ENCRYPTION_KEY_ENV, DATA_ENCRYPTION_KEY_HEX_LENGTH, USER_NAME_ENCRYPTION_VERSION } from './constants.js';

export function getDataEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configuredKey = env[DATA_ENCRYPTION_KEY_ENV];
  if (!configuredKey || configuredKey.length !== DATA_ENCRYPTION_KEY_HEX_LENGTH || !/^[\da-fA-F]+$/.test(configuredKey)) {
    throw new Error(`${DATA_ENCRYPTION_KEY_ENV} deve conter uma chave hexadecimal de 64 caracteres (32 bytes)`);
  }
  return Buffer.from(configuredKey, 'hex');
}

export function encryptUserName(value: string, key = getDataEncryptionKey()): string {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv(AES_GCM_ALGORITHM, key, iv, { authTagLength: AES_GCM_TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [USER_NAME_ENCRYPTION_VERSION, iv.toString('base64url'), authTag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptUserName(value: string, key = getDataEncryptionKey()): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = value.split(':');
  if (version !== USER_NAME_ENCRYPTION_VERSION || !encodedIv || !encodedTag || encodedCiphertext === undefined || extra !== undefined) {
    throw new Error('Valor de nome criptografado inválido');
  }
  const iv = Buffer.from(encodedIv, 'base64url');
  const authTag = Buffer.from(encodedTag, 'base64url');
  if (iv.length !== AES_GCM_IV_BYTES || authTag.length !== AES_GCM_TAG_BYTES) throw new Error('Valor de nome criptografado inválido');
  const decipher = createDecipheriv(AES_GCM_ALGORITHM, key, iv, { authTagLength: AES_GCM_TAG_BYTES });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export function isUserNameEncrypted(value: string): boolean {
  return value.startsWith(`${USER_NAME_ENCRYPTION_VERSION}:`);
}
