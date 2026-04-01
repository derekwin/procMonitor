'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hasAdminSession, setSession } from '@/lib/auth'

export async function loginAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = username.trim()
  const admin = await prisma.admin.findUnique({ where: { username: normalizedUsername } })
  
  if (!admin) {
    return { success: false, error: '用户名或密码错误' }
  }
  
  const isValid = await bcrypt.compare(password, admin.password)
  if (!isValid) {
    return { success: false, error: '用户名或密码错误' }
  }
  
  await setSession(admin.username)
  return { success: true }
}

export async function logoutAdmin() {
  const { destroySession } = await import('@/lib/auth')
  await destroySession()
}

export async function checkAdminSession(): Promise<boolean> {
  return hasAdminSession()
}
