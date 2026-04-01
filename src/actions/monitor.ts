import { prisma } from '@/lib/prisma'

export async function scanAllServers() {
  // This is now a placeholder - actual scanning happens via API route
  return []
}

export async function killServerProcess(processId: string, serverId: string, pid: number) {
  // This now calls the API route
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
        select: { name: true, host: true },
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
        select: { id: true, name: true, host: true },
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