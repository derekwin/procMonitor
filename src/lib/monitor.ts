import 'server-only'

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { migrateLegacyServerPasswords } from '@/lib/server-passwords'
import { connectToServer, getProcessList, killProcess } from '@/lib/ssh'

type ProcessWithServer = Prisma.ProcessGetPayload<{
  include: {
    server: {
      select: { id: true, name: true, host: true }
    }
  }
}>

async function syncServerProcesses(
  serverId: string,
  scannedProcesses: Awaited<ReturnType<typeof getProcessList>>,
) {
  const existingProcesses = await prisma.process.findMany({
    where: { serverId },
  })

  const existingByPid = new Map(existingProcesses.map((process) => [process.pid, process]))
  const scannedPidSet = new Set(scannedProcesses.map((process) => process.pid))
  const staleIds = existingProcesses
    .filter((process) => !scannedPidSet.has(process.pid))
    .map((process) => process.id)

  if (staleIds.length > 0) {
    await prisma.process.deleteMany({
      where: { id: { in: staleIds } },
    })
  }

  for (const scannedProcess of scannedProcesses) {
    const existing = existingByPid.get(scannedProcess.pid)

    if (!existing) {
      await prisma.process.create({
        data: {
          serverId,
          pid: scannedProcess.pid,
          username: scannedProcess.user,
          programName: scannedProcess.command,
          isAnonymous: true,
        },
      })
      continue
    }

    await prisma.process.update({
      where: { id: existing.id },
      data: {
        username:
          existing.isAnonymous || existing.username === 'unknown'
            ? scannedProcess.user
            : existing.username,
        programName: existing.isAnonymous ? scannedProcess.command : existing.programName,
      },
    })
  }
}

export async function scanServers() {
  await migrateLegacyServerPasswords()

  const servers = await prisma.server.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const results: Array<{
    serverId: string
    serverName: string
    success: boolean
    processCount?: number
    error?: string
  }> = []

  for (const server of servers) {
    let conn

    try {
      conn = await connectToServer(server)
      const gpuProcesses = await getProcessList(conn)
      await syncServerProcesses(server.id, gpuProcesses)

      results.push({
        serverId: server.id,
        serverName: server.name,
        success: true,
        processCount: gpuProcesses.length,
      })
    } catch (error) {
      results.push({
        serverId: server.id,
        serverName: server.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      conn?.end()
    }
  }

  return {
    success: results.every((result) => result.success),
    results,
  }
}

export async function listProcesses(): Promise<ProcessWithServer[]> {
  return prisma.process.findMany({
    include: {
      server: {
        select: { id: true, name: true, host: true },
      },
    },
    orderBy: { actualStartTime: 'desc' },
  })
}

export async function listOvertimeProcesses(): Promise<ProcessWithServer[]> {
  const [settings, processes] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 'default' } }),
    listProcesses(),
  ])

  const now = Date.now()
  const anonThresholdMinutes = settings?.anonProcessThreshold || 360

  return processes.filter((process) => {
    const runtimeMinutes = (now - new Date(process.actualStartTime).getTime()) / 1000 / 60

    if (process.isAnonymous) {
      return runtimeMinutes > anonThresholdMinutes
    }

    if (!process.estimatedDuration) {
      return false
    }

    return runtimeMinutes > process.estimatedDuration
  })
}

export async function terminateTrackedProcess(processId: string) {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: { server: true },
  })

  if (!process) {
    throw new Error('Process not found')
  }

  const conn = await connectToServer(process.server)

  try {
    await killProcess(conn, process.pid, process.server.password)
  } finally {
    conn.end()
  }

  await prisma.process.delete({
    where: { id: process.id },
  })
}
