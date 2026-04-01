'use server'

import { prisma } from '@/lib/prisma'

export async function getProcesses() {
  const processes = await prisma.process.findMany({
    include: {
      server: {
        select: { id: true, name: true, host: true },
      },
    },
    orderBy: { actualStartTime: 'desc' },
  })
  return processes
}

export async function getOverTimeProcesses() {
  const now = new Date()
  const processes = await prisma.process.findMany({
    include: {
      server: {
        select: { id: true, name: true, host: true, username: true, password: true },
      },
    },
  })

  return processes.filter(p => {
    const hours = (now.getTime() - new Date(p.actualStartTime).getTime()) / 1000 / 60 / 60
    if (p.isAnonymous) {
      return hours > 6
    }
    if (p.estimatedDuration) {
      return hours > p.estimatedDuration / 60
    }
    return false
  })
}