'use server'

import { prisma } from '@/lib/prisma'

export async function registerProcess(data: {
  serverId: string
  pid: number
  username: string
  programName: string
  description?: string
  estimatedDuration?: number
}) {
  // Validate input
  if (!data.serverId || !data.pid || !data.username || !data.programName) {
    return { success: false, error: '缺少必要参数' }
  }
  
  // Validate PID is a positive number
  if (typeof data.pid !== 'number' || data.pid <= 0 || !Number.isInteger(data.pid)) {
    return { success: false, error: '无效的PID' }
  }

  // Validate estimated duration if provided
  if (data.estimatedDuration !== undefined && (data.estimatedDuration <= 0 || !Number.isInteger(data.estimatedDuration))) {
    return { success: false, error: '无效的预估时间' }
  }

  // Validate server exists
  const server = await prisma.server.findUnique({ where: { id: data.serverId } })
  if (!server) {
    return { success: false, error: '服务器不存在' }
  }

  const existing = await prisma.process.findUnique({
    where: {
      serverId_pid: {
        serverId: data.serverId,
        pid: data.pid,
      },
    },
  })

    if (existing) {
      if (!existing.isAnonymous) {
        return { success: false, error: '该进程已注册' }
      }
      const updated = await prisma.process.update({
        where: { id: existing.id },
        data: {
          username: data.username,
          programName: data.programName,
          description: data.description || '',
          estimatedDuration: data.estimatedDuration,
          isAnonymous: false,
        },
      })
      return { success: true, process: updated, message: '绑定信息成功' }
    }

  // Process doesn't exist - create new
  const process = await prisma.process.create({
    data: {
      ...data,
      isAnonymous: false,
    },
  })

  return { success: true, process }
}

export async function getServerList() {
  return prisma.server.findMany({
    select: { id: true, name: true, host: true },
    orderBy: { name: 'asc' },
  })
}