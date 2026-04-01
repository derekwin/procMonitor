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
  workingDirectory: string | null
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

function executeRemoteCommand(
  conn: Client,
  command: string,
  options?: { stdin?: string },
): Promise<string> {
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

      if (options?.stdin !== undefined) {
        stream.write(options.stdin)
        stream.end()
      }

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

async function executeWithSudoFallback(
  conn: Client,
  options: {
    unprivilegedCommands: string[]
    sudoCommands: string[]
    sudoPassword?: string
    passwordFailureMessage: string
  },
): Promise<string> {
  let lastError: unknown = null
  let shouldTryPassword = false

  for (const command of options.unprivilegedCommands) {
    try {
      return await executeRemoteCommand(conn, command)
    } catch (error) {
      lastError = error
      const message = getErrorMessage(error).toLowerCase()
      if (!message.includes('operation not permitted') && !message.includes('permission denied')) {
        throw error
      }
    }
  }

  for (const command of options.sudoCommands) {
    try {
      return await executeRemoteCommand(conn, `sudo -n ${command}`)
    } catch (error) {
      lastError = error
      const message = getErrorMessage(error).toLowerCase()

      if (message.includes('a password is required')) {
        shouldTryPassword = true
        break
      }

      if (message.includes('command not found') || message.includes('no such file')) {
        continue
      }
    }
  }

  if (shouldTryPassword && options.sudoPassword) {
    const password = decryptSecret(options.sudoPassword)

    for (const command of options.sudoCommands) {
      try {
        return await executeRemoteCommand(conn, `sudo -S -p '' ${command}`, {
          stdin: `${password}\n`,
        })
      } catch (error) {
        lastError = error
        const message = getErrorMessage(error).toLowerCase()

        if (
          message.includes('sorry, try again') ||
          message.includes('incorrect password') ||
          message.includes('authentication failure')
        ) {
          throw new Error(options.passwordFailureMessage)
        }

        if (message.includes('command not found') || message.includes('no such file')) {
          continue
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('远程命令执行失败')
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
    workingDirectory: null,
  }
}

async function getProcessWorkingDirectory(
  conn: Client,
  pid: number,
  sudoPassword?: string,
): Promise<string | null> {
  try {
    const output = await executeWithSudoFallback(conn, {
      unprivilegedCommands: [`readlink /proc/${pid}/cwd`],
      sudoCommands: [`readlink /proc/${pid}/cwd`],
      sudoPassword,
      passwordFailureMessage: '远程服务器 sudo 密码校验失败，无法读取进程工作目录。',
    })

    const workingDirectory = output.trim()
    return workingDirectory || null
  } catch {
    return null
  }
}

export async function getProcessList(conn: Client): Promise<ProcessInfo[]> {
  const output = await executeRemoteCommand(conn, 'nvidia-smi pmon -c 1')
  const pids = parseNvidiaSmiPmonPids(output)
  const processes = await Promise.all(
    pids.map(async (pid) => {
      const process = await getProcessMetadata(conn, pid)
      if (!process) {
        return null
      }
      return process
    }),
  )

  return processes.filter((process): process is ProcessInfo => Boolean(process))
}

export async function getWorkingDirectories(
  conn: Client,
  pids: number[],
  sudoPassword?: string,
): Promise<Map<number, string | null>> {
  const entries = await Promise.all(
    pids.map(async (pid) => [pid, await getProcessWorkingDirectory(conn, pid, sudoPassword)] as const),
  )

  return new Map(entries)
}

export async function killProcess(
  conn: Client,
  pid: number,
  sudoPassword?: string,
): Promise<void> {
  await executeWithSudoFallback(conn, {
    unprivilegedCommands: [`kill ${pid}`],
    sudoCommands: [`/bin/kill ${pid}`, `/usr/bin/kill ${pid}`],
    sudoPassword,
    passwordFailureMessage: '远程服务器 sudo 密码校验失败，请确认该 SSH 账号的系统密码正确且具备 sudo 权限。',
  })
}
