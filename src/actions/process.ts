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
  const normalizedData = {
    serverId: data.serverId.trim(),
    pid: data.pid,
    username: data.username.trim(),
    programName: data.programName.trim(),
    description: data.description?.trim(),
    estimatedDuration: data.estimatedDuration,
  }

  if (!normalizedData.serverId || !normalizedData.pid || !normalizedData.username || !normalizedData.programName) {
    return { success: false, error: '缺少必要参数' }
  }
  
  if (typeof normalizedData.pid !== 'number' || normalizedData.pid <= 0 || !Number.isInteger(normalizedData.pid)) {
    return { success: false, error: '无效的PID' }
  }

  if (
    normalizedData.estimatedDuration !== undefined &&
    (!Number.isInteger(normalizedData.estimatedDuration) || normalizedData.estimatedDuration <= 0)
  ) {
    return { success: false, error: '无效的预估时间' }
  }

  const server = await prisma.server.findUnique({ where: { id: normalizedData.serverId } })
  if (!server) {
    return { success: false, error: '服务器不存在' }
  }

  const existing = await prisma.process.findUnique({
    where: {
      serverId_pid: {
        serverId: normalizedData.serverId,
        pid: normalizedData.pid,
      },
    },
  })

  if (existing) {
    if (!existing.isAnonymous) {
      const runtimeMinutes = Math.max(
        0,
        Math.floor((Date.now() - new Date(existing.actualStartTime).getTime()) / 1000 / 60),
      )

      const refreshedEstimate =
        normalizedData.estimatedDuration !== undefined
          ? runtimeMinutes + normalizedData.estimatedDuration
          : existing.estimatedDuration

      const updated = await prisma.process.update({
        where: { id: existing.id },
        data: {
          username: normalizedData.username,
          programName: normalizedData.programName,
          description: normalizedData.description || null,
          estimatedDuration: refreshedEstimate,
          isAnonymous: false,
        },
      })

      return {
        success: true,
        process: updated,
        message: '作业信息已更新，预估时间已按当前时刻刷新',
      }
    }

    const updated = await prisma.process.update({
      where: { id: existing.id },
      data: {
        username: normalizedData.username,
        programName: normalizedData.programName,
        description: normalizedData.description || null,
        estimatedDuration: normalizedData.estimatedDuration,
        isAnonymous: false,
      },
    })

    return { success: true, process: updated, message: '绑定信息成功' }
  }

  const process = await prisma.process.create({
    data: {
      ...normalizedData,
      description: normalizedData.description || null,
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
