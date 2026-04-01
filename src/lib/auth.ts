import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { getAdminSecret, shouldUseSecureCookies } from '@/lib/env'
import { prisma } from '@/lib/prisma'

const ADMIN_SESSION = 'admin-session'
const SESSION_TTL_SECONDS = 60 * 60 * 24

type SessionPayload = {
  username: string
  exp: number
}

function signValue(value: string) {
  return createHmac('sha256', getAdminSecret()).update(value).digest('base64url')
}

function encodeSession(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = signValue(body)
  return `${body}.${signature}`
}

function decodeSession(token: string): SessionPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) {
    return null
  }

  const expectedSignature = signValue(body)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (!parsed.username || parsed.exp <= Date.now()) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION)?.value

  if (!token) {
    return null
  }

  const payload = decodeSession(token)
  if (!payload) {
    cookieStore.delete(ADMIN_SESSION)
    return null
  }

  const admin = await prisma.admin.findUnique({
    where: { username: payload.username },
    select: { username: true },
  })

  if (!admin) {
    cookieStore.delete(ADMIN_SESSION)
    return null
  }

  return admin.username
}

export async function hasAdminSession(): Promise<boolean> {
  return Boolean(await getSession())
}

export async function requireAdminSession(): Promise<string> {
  const username = await getSession()
  if (!username) {
    throw new Error('UNAUTHORIZED')
  }
  return username
}

export async function setSession(username: string) {
  const cookieStore = await cookies()
  cookieStore.set(
    ADMIN_SESSION,
    encodeSession({
      username,
      exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    }),
    {
      httpOnly: true,
      secure: shouldUseSecureCookies(),
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
    },
  )
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION)
}
