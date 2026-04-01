import { cookies } from 'next/headers'

const ADMIN_SESSION = 'admin-session'

export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ADMIN_SESSION)?.value || null
}

export async function setSession(username: string) {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION, username, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION)
}