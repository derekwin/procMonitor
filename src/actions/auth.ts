'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { hasAdminSession, setSession } from '@/lib/auth'

export async function getAuthBootstrapState() {
  const [isAuthenticated, adminCount] = await Promise.all([
    hasAdminSession(),
    prisma.admin.count(),
  ])

  return {
    isAuthenticated,
    adminExists: adminCount > 0,
  }
}

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

export async function initializeAdmin(
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const normalizedUsername = username.trim()

  if (!normalizedUsername) {
    return { success: false, error: '用户名不能为空' }
  }

  if (password.length < 8) {
    return { success: false, error: '密码至少需要 8 位' }
  }

  const adminCount = await prisma.admin.count()
  if (adminCount > 0) {
    return { success: false, error: '管理员已初始化，请直接登录' }
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.admin.create({
    data: {
      username: normalizedUsername,
      password: hashedPassword,
    },
  })

  await setSession(normalizedUsername)

  return { success: true }
}

export async function logoutAdmin() {
  const { destroySession } = await import('@/lib/auth')
  await destroySession()
}

export async function checkAdminSession(): Promise<boolean> {
  return hasAdminSession()
}
