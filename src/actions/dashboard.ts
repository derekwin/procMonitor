'use server'

import { prisma } from '@/lib/prisma'
import { getSettings } from './settings'

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