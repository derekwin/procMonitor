import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SYSTEM_USERS = ['root', 'mysql', 'postgres', 'redis', 'nginx', 'apache', 'systemd', 'dbus', 'snap']
const SYSTEM_PROCESSES = ['systemd', 'sshd', 'cron', 'rsyslog', 'network', 'dbus', 'snapd', 'udisksd', 'polkitd', 'accounts-daemon', 'containerd', 'docker', 'k3s', 'kubelet']

function isSystemProcess(user: string, command: string): boolean {
  if (SYSTEM_USERS.includes(user.toLowerCase())) return true
  for (const sysProc of SYSTEM_PROCESSES) {
    if (command.toLowerCase().includes(sysProc)) return true
  }
  return false
}

function isGpuProcess(command: string): boolean {
  const gpuKeywords = [
    'python', 'torch', 'tensorflow', 'cuda', 'cudnn', 'nvidia',
    'python3', 'train', 'inference', 'deep', 'ml', 'ai',
    'python', 'julia', 'R', 'rstudio',
    'accelerate', 'deepspeed', 'xformers', 'vllm', 'llama', 'transformers'
  ]
  const lower = command.toLowerCase()
  return gpuKeywords.some(k => lower.includes(k))
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { Client } = await import('ssh2')
  
  const servers = await prisma.server.findMany()
  const results = []

  for (const server of servers) {
    try {
      const conn = await connectToServer(Client, server)
      
      const gpuProcesses = await getGpuProcessList(conn)
      const allProcesses = await getProcessList(conn)
      
      conn.end()

      const registeredProcesses = await prisma.process.findMany({
        where: { serverId: server.id },
      })

      for (const regProcess of registeredProcesses) {
        const exists = allProcesses.find(p => p.pid === regProcess.pid)
        if (!exists) {
          await prisma.process.delete({ where: { id: regProcess.id } })
        }
      }

      const dbPids = registeredProcesses.map(p => p.pid)
      const newProcesses = allProcesses.filter(p => 
        !dbPids.includes(p.pid) && 
        !isSystemProcess(p.user, p.command) &&
        isGpuProcess(p.command)
      )

      for (const proc of newProcesses) {
        try {
          const programName = proc.command.split(' ')[0].split('/').pop() || proc.command
          await prisma.process.upsert({
            where: {
              serverId_pid: { serverId: server.id, pid: proc.pid }
            },
            create: {
              serverId: server.id,
              pid: proc.pid,
              username: proc.user,
              programName,
              isAnonymous: true,
            },
            update: {
              username: proc.user,
              programName,
            },
          })
        } catch (e) {}
      }

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
        error: String(error),
      })
    }
  }

  return NextResponse.json({ success: true, results })
}

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const processId = searchParams.get('processId')
  const serverId = searchParams.get('serverId')
  const pid = searchParams.get('pid')

  if (!processId || !serverId || !pid) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const { Client } = await import('ssh2')
  
  const server = await prisma.server.findUnique({ where: { id: serverId } })
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }

  try {
    const conn = await connectToServer(Client, server)
    await killProcess(conn, parseInt(pid))
    conn.end()
    await prisma.process.delete({ where: { id: processId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

async function connectToServer(Client: any, server: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.end()
      reject(new Error('Connection timeout'))
    }, 10000)

    conn.on('ready', () => {
      clearTimeout(timeout)
      resolve(conn)
    })

    conn.on('error', (err: any) => {
      clearTimeout(timeout)
      reject(err)
    })

    conn.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
    })
  })
}

async function getGpuProcessList(conn: any): Promise<any[]> {
  return new Promise((resolve) => {
    conn.exec('nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>/dev/null', (err: any, stream: any) => {
      if (err || !stream) {
        resolve([])
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        const processes: any[] = []
        if (!output.trim()) {
          resolve(processes)
          return
        }
        
        const lines = output.trim().split('\n')
        for (const line of lines) {
          const parts = line.split(',').map(p => p.trim())
          if (parts.length >= 2) {
            processes.push({
              pid: parseInt(parts[0]),
              user: 'unknown',
              command: parts[1],
              gpuMemory: parts[2] || ''
            })
          }
        }
        resolve(processes)
      })
    })
  })
}

async function getProcessList(conn: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    conn.exec('ps aux --no-headers', (err: any, stream: any) => {
      if (err) { reject(err); return }

      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        const processes: any[] = []
        const lines = output.trim().split('\n')
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 11) {
            processes.push({
              pid: parseInt(parts[1]),
              user: parts[0],
              command: parts.slice(10).join(' '),
            })
          }
        }
        
        resolve(processes)
      })
    })
  })
}

async function killProcess(conn: any, pid: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    conn.exec(`kill ${pid}`, (err: any, stream: any) => {
      if (err) { reject(err); return }
      stream.on('close', () => { resolve(true) })
    })
  })
}