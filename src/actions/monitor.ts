'use server'

import { requireAdminSession } from '@/lib/auth'
import {
  listOvertimeProcesses,
  listProcesses,
  scanServers,
  terminateTrackedProcess,
} from '@/lib/monitor'

export async function getProcesses() {
  return listProcesses()
}

export async function getOverTimeProcesses() {
  return listOvertimeProcesses()
}

export async function runMonitorScan() {
  await requireAdminSession()
  return scanServers()
}

export async function killServerProcess(processId: string) {
  await requireAdminSession()

  try {
    await terminateTrackedProcess(processId)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
