'use server'

import { prisma } from '@/lib/prisma'
import { checkAdminSession } from './auth'

export async function addServer(data: {
  name: string
  host: string
  port: number
  username: string
  password: string
}) {
  // Verify admin session
  const isAdmin = await checkAdminSession()
  if (!isAdmin) {
    return { success: false, error: '需要管理员权限' }
  }
  
  // Validate input
  if (!data.name || !data.host || !data.username || !data.password) {
    return { success: false, error: '缺少必要参数' }
  }
  
  // Validate port
  if (typeof data.port !== 'number' || data.port <= 0 || data.port > 65535) {
    return { success: false, error: '无效的端口' }
  }

  const server = await prisma.server.create({
    data: {
      ...data,
    },
  })
  
  return { success: true, server }
}

export async function testServerConnection(data: {
  host: string
  port: number
  username: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  const { Client } = await import('ssh2')
  
  return new Promise((resolve) => {
    const conn = new Client()
    
    const timeout = setTimeout(() => {
      conn.end()
      resolve({ success: false, error: 'Connection timeout' })
    }, 10000)
    
    conn.on('ready', () => {
      clearTimeout(timeout)
      conn.end()
      resolve({ success: true })
    })
    
    conn.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    })
    
    conn.connect({
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
    })
  })
}

export async function getServers() {
  const servers = await prisma.server.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return servers.map(s => ({ ...s, password: '' }))
}

export async function deleteServer(id: string) {
  // Verify admin session
  const isAdmin = await checkAdminSession()
  if (!isAdmin) {
    return { success: false, error: '需要管理员权限' }
  }
  
  await prisma.server.delete({ where: { id } })
  return { success: true }
}

export async function getServerPassword(id: string): Promise<string> {
  // Verify admin session
  const isAdmin = await checkAdminSession()
  if (!isAdmin) {
    return ''
  }
  
  const server = await prisma.server.findUnique({ where: { id } })
  return server?.password || ''
}