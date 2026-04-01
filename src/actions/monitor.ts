import { prisma } from '@/lib/prisma'
import { getSettings } from './settings'

export async function scanAllServers() {
  return []
}

export async function killServerProcess(processId: string, serverId: string, pid: number) {
  const response = await fetch(`/api/cron/scan?processId=${processId}&serverId=${serverId}&pid=${pid}`, {
    method: 'DELETE',
  })
  const result = await response.json()
  return result
}

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
  const settings = await getSettings()
  const anonThresholdHours = (settings.anonProcessThreshold || 360) / 60
  
  const processes = await prisma.process.findMany({
    include: {
      server: {
        select: { id: true, name: true, host: true },
      },
    },
  })

  return processes.filter(p => {
    const hours = (now.getTime() - new Date(p.actualStartTime).getTime()) / 1000 / 60 / 60
    if (p.isAnonymous) {
      return hours > anonThresholdHours
    }
    if (p.estimatedDuration) {
      return hours > p.estimatedDuration / 60
    }
    return false
  })
}