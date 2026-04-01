import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
      
      // Only get GPU processes from nvidia-smi
      const gpuProcesses = await getGpuProcessList(conn)
      conn.end()

      const registeredProcesses = await prisma.process.findMany({
        where: { serverId: server.id },
      })

      // Delete processes that no longer exist
      const allPids = gpuProcesses.map(p => p.pid)
      for (const regProcess of registeredProcesses) {
        if (!allPids.includes(regProcess.pid)) {
          await prisma.process.delete({ where: { id: regProcess.id } })
        }
      }

      const dbPids = registeredProcesses.map(p => p.pid)
      
      // Add new GPU processes
      for (const proc of gpuProcesses) {
        if (dbPids.includes(proc.pid)) continue
        
        try {
          const programName = proc.command || proc.program || 'unknown'
          await prisma.process.upsert({
            where: {
              serverId_pid: { serverId: server.id, pid: proc.pid }
            },
            create: {
              serverId: server.id,
              pid: proc.pid,
              username: proc.user || 'unknown',
              programName,
              isAnonymous: true,
            },
            update: {
              username: proc.user || 'unknown',
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
    }, 15000)

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
    // Try nvidia-smi first (most reliable)
    conn.exec('nvidia-smi --query-compute-apps=pid,process_name,used_memory,username --format=csv,noheader 2>/dev/null', (err: any, stream: any) => {
      if (err || !stream) {
        resolve([])
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        const processes: any[] = []
        if (!output.trim()) {
          // Try alternative: check for CUDA processes via ps
          checkCudaProcesses(conn, resolve)
          return
        }
        
        const lines = output.trim().split('\n')
        for (const line of lines) {
          const parts = line.split(',').map(p => p.trim())
          if (parts.length >= 2) {
            processes.push({
              pid: parseInt(parts[0]) || 0,
              user: parts[3] || 'unknown',
              command: parts[1] || 'unknown',
              gpuMemory: parts[2] || ''
            })
          }
        }
        resolve(processes)
      })
    })
  })
}

function checkCudaProcesses(conn: any, resolve: (procs: any[]) => void) {
  // Fallback: look for CUDA-related processes
  conn.exec('ps aux | grep -E "cuda|torch|tensorflow|python.*train" | grep -v grep | head -50', (err: any, stream: any) => {
    if (err) {
      resolve([])
      return
    }

    let output = ''
    stream.on('data', (data: Buffer) => { output += data.toString() })
    stream.on('close', () => {
      const processes: any[] = []
      const lines = output.trim().split('\n')
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 11) {
          const pid = parseInt(parts[1])
          const user = parts[0]
          const command = parts.slice(10).join(' ')
          
          // Only include if it's likely a GPU process
          const gpuIndicators = ['cuda', 'torch', 'tensorflow', 'python', 'train', 'inference', 'deep', 'ml']
          if (gpuIndicators.some(i => command.toLowerCase().includes(i))) {
            processes.push({
              pid,
              user,
              command: command.split(' ')[0].split('/').pop() || command,
              gpuMemory: ''
            })
          }
        }
      }
      resolve(processes)
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