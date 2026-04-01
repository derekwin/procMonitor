'use server'

import { prisma } from '@/lib/prisma'
import { requireAdminSession } from '@/lib/auth'

export async function getSettings() {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })
  if (!settings) {
    return { autoScan: true, scanInterval: 60, anonProcessThreshold: 360 }
  }
  return settings
}

export async function getAutoScan(): Promise<boolean> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })
  return settings?.autoScan ?? true
}

export async function updateSettings(data: {
  autoScan: boolean
  scanInterval: number
  anonProcessThreshold?: number
}) {
  try {
    await requireAdminSession()
  } catch {
    return { success: false, error: '需要管理员权限' }
  }
  
  // Validate input
  if (data.scanInterval !== undefined && (data.scanInterval < 10 || !Number.isInteger(data.scanInterval))) {
    return { success: false, error: '扫描间隔至少10秒' }
  }
  
  if (data.anonProcessThreshold !== undefined && (data.anonProcessThreshold < 60 || !Number.isInteger(data.anonProcessThreshold))) {
    return { success: false, error: '匿名进程超时至少60分钟' }
  }
  
  const settings = await prisma.settings.upsert({
    where: { id: 'default' },
    update: data,
    create: {
      id: 'default',
      autoScan: data.autoScan,
      scanInterval: data.scanInterval,
      anonProcessThreshold: data.anonProcessThreshold ?? 360,
    },
  })
  return { success: true, settings }
}
