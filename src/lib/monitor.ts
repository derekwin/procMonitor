import 'server-only'

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { migrateLegacyServerPasswords } from '@/lib/server-passwords'
import { connectToServer, getProcessList, getWorkingDirectories, killProcess } from '@/lib/ssh'

type ProcessWithServer = Prisma.ProcessGetPayload<{
  include: {
    server: {
      select: { id: true, name: true, host: true }
    }
  }
}>

function getGracePeriodMinutes(settings: { anonProcessThreshold?: number | null } | null) {
  return settings?.anonProcessThreshold || 120
}

function getRuntimeMinutes(actualStartTime: Date) {
  return (Date.now() - new Date(actualStartTime).getTime()) / 1000 / 60
}

function isPastOvertimeThreshold(
  process: {
    actualStartTime: Date
    isAnonymous: boolean
    estimatedDuration: number | null
  },
) {
  if (process.isAnonymous) {
    return true
  }

  if (!process.estimatedDuration) {
    return false
  }

  const runtimeMinutes = getRuntimeMinutes(process.actualStartTime)
  return runtimeMinutes > process.estimatedDuration
}

function isPastAutoKillThreshold(
  process: {
    actualStartTime: Date
    isAnonymous: boolean
    estimatedDuration: number | null
  },
  gracePeriodMinutes: number,
) {
  const runtimeMinutes = getRuntimeMinutes(process.actualStartTime)

  if (process.isAnonymous) {
    return runtimeMinutes > gracePeriodMinutes
  }

  if (!process.estimatedDuration) {
    return false
  }

  return runtimeMinutes > process.estimatedDuration + gracePeriodMinutes
}

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
          workingDirectory: scannedProcess.workingDirectory,
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
        workingDirectory: scannedProcess.workingDirectory ?? existing.workingDirectory,
      },
    })
  }
}

export async function scanServers() {
  await migrateLegacyServerPasswords()

  const [servers, settings] = await Promise.all([
    prisma.server.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.settings.findUnique({
      where: { id: 'default' },
      select: { anonProcessThreshold: true },
    }),
  ])

  const gracePeriodMinutes = getGracePeriodMinutes(settings)

  const results: Array<{
    serverId: string
    serverName: string
    success: boolean
    processCount?: number
    autoKilledCount?: number
    error?: string
  }> = []

  for (const server of servers) {
    let conn

    try {
      conn = await connectToServer(server)
      const existingProcesses = await prisma.process.findMany({
        where: { serverId: server.id },
        select: { pid: true, workingDirectory: true },
      })
      const existingByPid = new Map(existingProcesses.map((process) => [process.pid, process]))
      const gpuProcesses = await getProcessList(conn)
      const pidsNeedingWorkingDirectory = gpuProcesses
        .filter((process) => {
          const existing = existingByPid.get(process.pid)
          return !existing || !existing.workingDirectory
        })
        .map((process) => process.pid)

      const workingDirectories = pidsNeedingWorkingDirectory.length > 0
        ? await getWorkingDirectories(conn, pidsNeedingWorkingDirectory, server.password)
        : new Map<number, string | null>()

      for (const process of gpuProcesses) {
        process.workingDirectory =
          workingDirectories.get(process.pid) ??
          existingByPid.get(process.pid)?.workingDirectory ??
          null
      }

      await syncServerProcesses(server.id, gpuProcesses)
      const currentProcesses = await prisma.process.findMany({
        where: { serverId: server.id },
      })

      let autoKilledCount = 0

      for (const process of currentProcesses) {
        if (!isPastAutoKillThreshold(process, gracePeriodMinutes)) {
          continue
        }

        try {
          await killProcess(conn, process.pid, server.password)
          await prisma.process.delete({
            where: { id: process.id },
          })
          autoKilledCount += 1
        } catch (error) {
          results.push({
            serverId: server.id,
            serverName: server.name,
            success: false,
            processCount: gpuProcesses.length,
            autoKilledCount,
            error: `自动终止进程 ${process.pid} 失败: ${error instanceof Error ? error.message : String(error)}`,
          })
          throw error
        }
      }

      results.push({
        serverId: server.id,
        serverName: server.name,
        success: true,
        processCount: gpuProcesses.length,
        autoKilledCount,
      })
    } catch (error) {
      if (results.some((result) => result.serverId === server.id && result.error)) {
        continue
      }

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
  const processes = await listProcesses()

  return processes.filter((process) => isPastOvertimeThreshold(process))
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
