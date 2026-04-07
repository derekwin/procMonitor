export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const { startAutoScanWorker } = await import('@/lib/auto-scan-worker')
  startAutoScanWorker()
}
