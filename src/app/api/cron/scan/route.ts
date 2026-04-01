import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // Check if it's a cron request (internal) or admin request
  const isCronRequest = cronSecret && authHeader === `Bearer ${cronSecret}`
  
  // Verify admin session properly
  const { getSession } = await import('@/lib/auth')
  const session = await getSession()
  const isAdminRequest = !!session
  
  if (!isCronRequest && !isAdminRequest) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { Client } = await import('ssh2')
  
  const servers = await prisma.server.findMany()
  const results = []

  for (const server of servers) {
    try {
      const conn = await connectToServer(Client, server)
      
      // Use nvtop to get GPU processes
      const gpuProcesses = await getGpuProcessesFromNvtop(conn)
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
          const programName = proc.command || 'unknown'
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
  
  // Check if it's a cron request (internal) or admin request
  const isCronRequest = cronSecret && authHeader === `Bearer ${cronSecret}`
  
  // Verify admin session properly
  const { getSession } = await import('@/lib/auth')
  const session = await getSession()
  const isAdminRequest = !!session
  
  if (!isCronRequest && !isAdminRequest) {
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

  // Verify process exists in database and belongs to this server
  const process = await prisma.process.findFirst({ 
    where: { id: processId, serverId } 
  })
  if (!process) {
    return NextResponse.json({ error: 'Process not found' }, { status: 404 })
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

async function getGpuProcessesFromNvtop(conn: any): Promise<any[]> {
  return new Promise((resolve) => {
    // Use nvidia-smi pmon to get GPU processes
    const command = 'nvidia-smi pmon -c 1 2>&1'
    
    conn.exec(command, (err: any, stream: any) => {
      if (err || !stream) {
        resolve([])
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        if (!output.trim() || output.includes('not found') || output.includes('command not found')) {
          resolve([])
          return
        }
        
        // Parse nvidia-smi pmon output
        const processes = parseNvidiaSmiPmonOutput(output)
        resolve(processes)
      })
    })
  })
}

function parseNvidiaSmiPmonOutput(output: string): any[] {
  const processes: any[] = []
  const lines = output.trim().split('\n')
  
  // Filter out display driver related processes
  const excludedCommands = ['Xorg', 'X', 'gnome-shell', 'compiz', 'kwin', 'mutter', 'mate compositor']
  
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    const parts = line.split(/\s+/)
    if (parts.length >= 10) {
      const gpuId = parts[0]
      const pidStr = parts[1]
      const type = parts[2]
      const command = parts[parts.length - 1]
      
      if (pidStr === '-' || !pidStr.match(/^\d+$/)) continue
      
      // Filter out display driver processes
      const lowerCommand = command.toLowerCase()
      if (excludedCommands.some(ex => lowerCommand.includes(ex.toLowerCase()))) continue
      
      const pid = parseInt(pidStr)
      if (pid && pid > 0) {
        processes.push({
          pid,
          gpuId: parseInt(gpuId),
          type,
          command: command || 'unknown',
          user: 'unknown',
          gpuMemory: ''
        })
      }
    }
  }
  
  return processes
}

async function getUserForPid(conn: any, pid: number): Promise<string> {
  return new Promise((resolve) => {
    conn.exec(`ps -o user= -p ${pid} 2>&1`, (err: any, stream: any) => {
      if (err || !stream) {
        resolve('unknown')
        return
      }
      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        resolve(output.trim() || 'unknown')
      })
    })
  })
}

function parseNvtopOutput(output: string): any[] {
  const processes: any[] = []
  const lines = output.trim().split('\n')
  
  // nvtop output typically shows GPU processes in a table format
  // Look for lines that contain process info (not headers, not empty)
  
  for (const line of lines) {
    // Skip empty lines and headers
    if (!line.trim() || line.toLowerCase().includes('gpu') || line.toLowerCase().includes('process')) {
      continue
    }
    
    // Try to extract PID - nvtop shows it in certain positions
    // Format varies but typically: PID  USER  COMMAND  ... GPU ...
    const pidMatch = line.match(/\b(\d+)\b/)
    if (pidMatch) {
      const pid = parseInt(pidMatch[1])
      
      // Extract user (usually appears after PID)
      const userMatch = line.match(/\b(\w+)\b/)
      const user = userMatch ? userMatch[1] : 'unknown'
      
      // Extract command (usually contains the program name)
      const command = line.split(/\s+/).find(p => 
        p.includes('python') || p.includes('torch') || p.includes('.py') || 
        p.includes('train') || p.includes('node') || p.includes('.sh')
      ) || line.split(/\s+/).slice(-1)[0] || 'unknown'
      
      if (pid && pid > 0) {
        processes.push({
          pid,
          user: user !== 'GPU' && user !== 'PID' ? user : 'unknown',
          command: command.split('/').pop() || command,
          gpuMemory: ''
        })
      }
    }
  }
  
  return processes
}

function fallbackToNvidiaSmi(conn: any, resolve: (procs: any[]) => void) {
  // Fallback to nvidia-smi
  // Try multiple command formats as field names vary by driver version
  const commands = [
    'nvidia-smi --query-compute-apps=pid,process_name,used_memory,owner_name --format=csv,noheader 2>&1',
    'nvidia-smi --query-compute-apps=pid,process_name,used_memory,compute_app --format=csv,noheader 2>&1',
    'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>&1'
  ]
  
  let cmdIndex = 0
  
  const tryCommand = () => {
    if (cmdIndex >= commands.length) {
      resolve([])
      return
    }
    
    conn.exec(commands[cmdIndex], (err: any, stream: any) => {
      if (err || !stream) {
        cmdIndex++
        tryCommand()
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => { output += data.toString() })
      stream.on('close', () => {
        // If output is empty or contains error, try next command
        if (!output.trim() || output.includes('not found') || output.includes('command not found') || output.includes('Invalid')) {
          cmdIndex++
          tryCommand()
          return
        }
        
        const processes: any[] = []
        const lines = output.trim().split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          const parts = line.split(',').map(p => p.trim())
          if (parts.length >= 2) {
            processes.push({
              pid: parseInt(parts[0]) || 0,
              user: parts[3] || parts[2] || 'unknown', // owner_name or compute_app may be in different positions
              command: parts[1] || 'unknown',
              gpuMemory: parts[2] || ''
            })
          }
        }
        resolve(processes)
      })
    })
  }
  
  tryCommand()
}

async function killProcess(conn: any, pid: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Use sudo -n for non-interactive sudo (won't prompt for password)
    conn.exec(`sudo -n kill ${pid}`, (err: any, stream: any) => {
      if (err) { reject(err); return }
      stream.on('close', () => { resolve(true) })
    })
  })
}