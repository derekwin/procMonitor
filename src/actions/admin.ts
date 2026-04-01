'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAdminSession } from '@/lib/auth'

export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  let username: string

  try {
    username = await requireAdminSession()
  } catch {
    return { success: false, error: '需要管理员权限' }
  }
  
  const admin = await prisma.admin.findUnique({
    where: { username }
  })
  
  if (!admin) {
    return { success: false, error: '管理员不存在' }
  }
  
  const isValid = await bcrypt.compare(oldPassword, admin.password)
  if (!isValid) {
    return { success: false, error: '原密码错误' }
  }
  
  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.admin.update({
    where: { username },
    data: { password: hashed }
  })
  
  return { success: true }
}
