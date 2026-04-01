'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { setSession } from '@/lib/auth'

export async function loginAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const admin = await prisma.admin.findUnique({ where: { username } })
  
  if (!admin) {
    return { success: false, error: 'Invalid credentials' }
  }
  
  const isValid = await bcrypt.compare(password, admin.password)
  if (!isValid) {
    return { success: false, error: 'Invalid credentials' }
  }
  
  await setSession(username)
  return { success: true }
}

export async function logoutAdmin() {
  const { destroySession } = await import('@/lib/auth')
  await destroySession()
}

export async function checkAdminSession(): Promise<boolean> {
  const { getSession } = await import('@/lib/auth')
  const session = await getSession()
  return !!session
}