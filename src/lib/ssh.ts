import { Client } from 'ssh2'
import bcrypt from 'bcryptjs'

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
  startTime?: Date
}

export async function connectToServer(server: ServerInfo): Promise<Client> {
  const conn = new Client()
  
  const decryptedPassword = await bcrypt.compare(server.password, server.password) 
    ? server.password 
    : await bcrypt.hash(server.password, 10)

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
      password: server.password,
    })
  })
}

export async function getProcessList(conn: Client): Promise<ProcessInfo[]> {
  return new Promise((resolve, reject) => {
    conn.exec('ps aux --no-headers', (err, stream) => {
      if (err) {
        reject(err)
        return
      }

      let output = ''
      stream.on('data', (data: Buffer) => {
        output += data.toString()
      })
      stream.on('close', () => {
        const processes: ProcessInfo[] = []
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

export async function killProcess(conn: Client, pid: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    conn.exec(`kill ${pid}`, (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      stream.on('close', () => {
        resolve(true)
      })
    })
  })
}