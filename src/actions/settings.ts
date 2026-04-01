'use server'

import { prisma } from '@/lib/prisma'

export async function getSettings() {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })
  if (!settings) {
    // Return default settings
    return { autoScan: true, scanInterval: 60 }
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
}) {
  const settings = await prisma.settings.upsert({
    where: { id: 'default' },
    update: data,
    create: {
      id: 'default',
      ...data,
    },
  })
  return { success: true, settings }
}