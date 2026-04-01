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
  const existing = await prisma.process.findUnique({
    where: {
      serverId_pid: {
        serverId: data.serverId,
        pid: data.pid,
      },
    },
  })

  if (existing) {
    return { success: false, error: '该进程已注册' }
  }

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