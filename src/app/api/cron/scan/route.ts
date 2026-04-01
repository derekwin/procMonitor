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
      
      // Get GPU processes with debug info
      const { processes: gpuProcesses, debug } = await getGpuProcessListWithDebug(conn)
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
        debug
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

async function getGpuProcessListWithDebug(conn: any): Promise<{ processes: any[]; debug: any }> {
  const debug: any = {}
  
  // Method 1: nvidia-smi (preferred)
  const nvidiaSmiResult = await runCommand(conn, 'nvidia-smi --query-compute-apps=pid,process_name,used_memory,username --format=csv,noheader 2>&1')
  debug.nvidiaSmi = nvidiaSmiResult
  
  if (nvidiaSmiResult.success && nvidiaSmiResult.output.trim()) {
    const processes: any[] = []
    const lines = nvidiaSmiResult.output.trim().split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
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
    if (processes.length > 0) {
      return { processes, debug }
    }
  }

  // Method 2: Check for CUDA processes in ps
  const psResult = await runCommand(conn, 'ps -eo pid,user,args --no-headers | head -200')
  debug.ps = psResult
  
  if (psResult.success) {
    const processes: any[] = []
    const lines = psResult.output.trim().split('\n')
    
    const gpuKeywords = [
      'python', 'torch', 'tensorflow', 'cuda', 'cudnn', 'nvidia',
      'train', 'inference', 'deep', 'ml', 'ai', 'model',
      'accelerate', 'deepspeed', 'xformers', 'vllm', 'llama',
      'jupyter', 'notebook', 'python3'
    ]
    
    for (const line of lines) {
      const lower = line.toLowerCase()
      if (gpuKeywords.some(k => lower.includes(k))) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3) {
          const pid = parseInt(parts[0])
          const user = parts[1]
          const command = parts.slice(2).join(' ')
          const programName = command.split(' ')[0].split('/').pop() || command
          
          processes.push({
            pid,
            user,
            command: programName,
            gpuMemory: ''
          })
        }
      }
    }
    
    if (processes.length > 0) {
      return { processes, debug }
    }
  }

  // Method 3: Check nvidia-smi output directly
  const nvidiaFullResult = await runCommand(conn, 'nvidia-smi 2>&1')
  debug.nvidiaFull = nvidiaFullResult.success ? 'Output available' : nvidiaFullResult.error
  
  return { processes: [], debug }
}

function runCommand(conn: any, command: string): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    conn.exec(command, (err: any, stream: any) => {
      if (err || !stream) {
        resolve({ success: false, output: '', error: String(err) })
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        resolve({ success: true, output })
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