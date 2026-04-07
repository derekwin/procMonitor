import 'server-only'

import { prisma } from '@/lib/prisma'
import { scanServers } from '@/lib/monitor'

const DEFAULT_SCAN_INTERVAL_SECONDS = 60
const MIN_SCAN_INTERVAL_SECONDS = 10
const RETRY_DELAY_MS = 15_000

declare global {
  var __procMonitorAutoScanWorkerStarted: boolean | undefined
}

function normalizeScanInterval(seconds: number | null | undefined) {
  if (!Number.isInteger(seconds) || !seconds) {
    return DEFAULT_SCAN_INTERVAL_SECONDS
  }

  return Math.max(MIN_SCAN_INTERVAL_SECONDS, seconds)
}

function isWorkerDisabledByEnv() {
  const value = process.env.DISABLE_INTERNAL_AUTO_SCAN_WORKER
  return value === '1' || value === 'true'
}

async function runAutoScanLoop() {
  let nextDelayMs = DEFAULT_SCAN_INTERVAL_SECONDS * 1000

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { autoScan: true, scanInterval: true },
    })

    const autoScanEnabled = settings?.autoScan ?? true
    const scanIntervalSeconds = normalizeScanInterval(settings?.scanInterval)
    nextDelayMs = scanIntervalSeconds * 1000

    if (autoScanEnabled) {
      const result = await scanServers()
      if (!result.success) {
        console.error('[auto-scan-worker] scan completed with partial failures', result.results)
      }
    }
  } catch (error) {
    console.error('[auto-scan-worker] scan loop failed', error)
    nextDelayMs = RETRY_DELAY_MS
  } finally {
    const timeout = setTimeout(() => {
      void runAutoScanLoop()
    }, nextDelayMs)
    timeout.unref?.()
  }
}

export function startAutoScanWorker() {
  if (globalThis.__procMonitorAutoScanWorkerStarted) {
    return
  }

  if (isWorkerDisabledByEnv()) {
    console.info('[auto-scan-worker] disabled by DISABLE_INTERNAL_AUTO_SCAN_WORKER')
    return
  }

  globalThis.__procMonitorAutoScanWorkerStarted = true
  console.info('[auto-scan-worker] started')
  void runAutoScanLoop()
}
