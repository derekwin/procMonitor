'use server'

import { prisma } from '@/lib/prisma'
import { requireAdminSession } from '@/lib/auth'
import { encryptSecret } from '@/lib/secrets'
import { connectToServer } from '@/lib/ssh'
import { migrateLegacyServerPasswords } from '@/lib/server-passwords'

export async function addServer(data: {
  name: string
  host: string
  port: number
  username: string
  password: string
}) {
  try {
    await requireAdminSession()
  } catch {
    return { success: false, error: '需要管理员权限' }
  }

  const normalizedData = {
    name: data.name.trim(),
    host: data.host.trim(),
    port: data.port,
    username: data.username.trim(),
    password: data.password,
  }

  if (!normalizedData.name || !normalizedData.host || !normalizedData.username || !normalizedData.password) {
    return { success: false, error: '缺少必要参数' }
  }
  
  if (!Number.isInteger(normalizedData.port) || normalizedData.port <= 0 || normalizedData.port > 65535) {
    return { success: false, error: '无效的端口' }
  }

  const server = await prisma.server.create({
    data: {
      ...normalizedData,
      password: encryptSecret(normalizedData.password),
    },
  })
  
  return { success: true, server }
}

export async function testServerConnection(data: {
  host: string
  port: number
  username: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminSession()
  } catch {
    return { success: false, error: '需要管理员权限' }
  }

  if (!data.host.trim() || !data.username.trim() || !data.password) {
    return { success: false, error: '缺少必要参数' }
  }

  if (!Number.isInteger(data.port) || data.port <= 0 || data.port > 65535) {
    return { success: false, error: '无效的端口' }
  }

  let conn

  try {
    conn = await connectToServer({
      id: 'test-connection',
      host: data.host.trim(),
      port: data.port,
      username: data.username.trim(),
      password: data.password,
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    conn?.end()
  }
}

export async function getServers() {
  await requireAdminSession()
  await migrateLegacyServerPasswords()

  const servers = await prisma.server.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return servers.map(s => ({ ...s, password: '' }))
}

export async function deleteServer(id: string) {
  try {
    await requireAdminSession()
  } catch {
    return { success: false, error: '需要管理员权限' }
  }
  
  await prisma.server.delete({ where: { id } })
  return { success: true }
}
