import 'server-only'

import path from 'node:path'

import { Client } from 'ssh2'

import { decryptSecret } from '@/lib/secrets'

export interface ServerInfo {
  id: string
  host: string
  port: number
  username: string
  password: string
}

export interface ProcessInfo {
  pid: number
  user: string
  command: string
}

export async function connectToServer(server: ServerInfo): Promise<Client> {
  const conn = new Client()
  const password = decryptSecret(server.password)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.end()
      reject(new Error('Connection timeout'))
    }, 10000)

    conn.on('ready', () => {
      clearTimeout(timeout)
      resolve(conn)
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    conn.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password,
    })
  })
}

function executeRemoteCommand(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err)
        return
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      stream.on('close', (code?: number) => {
        if (code && code !== 0) {
          reject(new Error((stderr || stdout || `Remote command failed with exit code ${code}`).trim()))
          return
        }

        resolve(stdout.trim())
      })
    })
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseNvidiaSmiPmonPids(output: string) {
  const pids = new Set<number>()
  const lines = output.trim().split('\n')

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index]?.trim()
    if (!line) {
      continue
    }

    const parts = line.split(/\s+/)
    const pid = Number.parseInt(parts[1] || '', 10)
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid)
    }
  }

  return [...pids]
}

function isDisplayProcess(command: string) {
  const normalized = command.toLowerCase()
  return [
    'xorg',
    'gnome-shell',
    'compiz',
    'kwin',
    'mutter',
    'mate',
  ].some((entry) => normalized.includes(entry))
}

async function getProcessMetadata(conn: Client, pid: number): Promise<ProcessInfo | null> {
  const output = await executeRemoteCommand(conn, `ps -o user=,args= -p ${pid}`).catch(() => '')

  if (!output) {
    return null
  }

  const [user, ...commandParts] = output.trim().split(/\s+/)
  const commandLine = commandParts.join(' ').trim()
  if (!user || !commandLine || isDisplayProcess(commandLine)) {
    return null
  }

  const executable = commandParts[0] ? path.basename(commandParts[0]) : 'unknown'
  const detail = commandParts.slice(1).join(' ').trim()

  return {
    pid,
    user,
    command: detail ? `${executable} ${detail}` : executable,
  }
}

export async function getProcessList(conn: Client): Promise<ProcessInfo[]> {
  const output = await executeRemoteCommand(conn, 'nvidia-smi pmon -c 1')
  const pids = parseNvidiaSmiPmonPids(output)
  const processes = await Promise.all(pids.map((pid) => getProcessMetadata(conn, pid)))

  return processes.filter((process): process is ProcessInfo => Boolean(process))
}

export async function killProcess(conn: Client, pid: number): Promise<void> {
  try {
    await executeRemoteCommand(conn, `kill ${pid}`)
    return
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (!message.includes('operation not permitted') && !message.includes('permission denied')) {
      throw error
    }
  }

  const privilegedCommands = [
    `sudo -n /bin/kill ${pid}`,
    `sudo -n /usr/bin/kill ${pid}`,
  ]

  let lastError: unknown = null

  for (const command of privilegedCommands) {
    try {
      await executeRemoteCommand(conn, command)
      return
    } catch (error) {
      lastError = error
      const message = getErrorMessage(error).toLowerCase()

      if (message.includes('a password is required')) {
        throw new Error(
          '远程服务器未配置免密 sudo kill。请在该服务器上为当前 SSH 用户配置 NOPASSWD 的 /bin/kill 和 /usr/bin/kill。',
        )
      }

      if (message.includes('command not found') || message.includes('no such file')) {
        continue
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('终止进程失败')
}
