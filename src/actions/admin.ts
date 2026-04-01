'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const admin = await prisma.admin.findUnique({
    where: { username: 'admin' }
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
    where: { username: 'admin' },
    data: { password: hashed }
  })
  
  return { success: true }
}