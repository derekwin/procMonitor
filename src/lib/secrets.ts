import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

import { getAdminSecret } from '@/lib/env'

const ENCRYPTED_PREFIX = 'enc:'

function getEncryptionKey() {
  return createHash('sha256').update(getAdminSecret()).digest()
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(ENCRYPTED_PREFIX)
}

export function encryptSecret(value: string) {
  if (!value) {
    return value
  }

  if (value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string) {
  if (!value) {
    return value
  }

  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }

  const payload = value.slice(ENCRYPTED_PREFIX.length)
  const [iv, tag, encrypted] = payload.split('.')
  if (!iv || !tag || !encrypted) {
    throw new Error('Invalid encrypted secret payload')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(iv, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
