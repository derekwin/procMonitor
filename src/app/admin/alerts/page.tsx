'use client'

import { useState, useEffect } from 'react'
import { getOverTimeProcesses, killServerProcess, runMonitorScan } from '@/actions/monitor'
import { getSettings } from '@/actions/settings'
import Link from 'next/link'

interface Process {
  id: string
  pid: number
  username: string
  programName: string
  description: string | null
  estimatedDuration: number | null
  actualStartTime: Date
  isAnonymous: boolean
  server: {
    id: string
    name: string
    host: string
  }
}

export default function AlertsPage() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [loading, setLoading] = useState(true)
  const [killing, setKilling] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [anonThreshold, setAnonThreshold] = useState(120)

  async function loadProcessesWithoutScan() {
    try {
      const data = await getOverTimeProcesses()
      setProcesses(data)
    } catch (e) {
      console.error('Failed to load processes:', e)
    }
    setLoading(false)
  }

  async function loadProcessesWithScan() {
    setLoading(true)
    const result = await runMonitorScan()
    if (!result.success) {
      console.error('Scan finished with errors:', result.results)
    }
    await loadProcessesWithoutScan()
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    async function initialize() {
      const [settings, data] = await Promise.all([
        getSettings(),
        getOverTimeProcesses(),
      ])

      if (cancelled) {
        return
      }

      setAnonThreshold(settings.anonProcessThreshold || 120)
      setProcesses(data)
      setLoading(false)

      if (settings.autoScan) {
        timer = setInterval(() => {
          void loadProcessesWithoutScan()
        }, (settings.scanInterval || 60) * 1000)
      }
    }

    void initialize()

    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [])

  const handleManualScan = async () => {
    setScanning(true)
    await loadProcessesWithScan()
    setScanning(false)
  }

  const handleKill = async (process: Process) => {
    if (!confirm(`确定要kill进程 ${process.pid} (${process.programName}) 吗？`)) {
      return
    }

    setKilling(process.id)
    const result = await killServerProcess(process.id)
    setKilling(null)

    if (result.success) {
      alert('进程已被终止')
      await loadProcessesWithoutScan()
    } else {
      alert(`终止失败: ${result.error}`)
    }
  }

  const handleKillAll = async () => {
    if (!confirm(`确定要一键kill所有超时进程吗？`)) {
      return
    }

    const failedProcesses: string[] = []

    for (const process of processes) {
      const result = await killServerProcess(process.id)
      if (!result.success) {
        failedProcesses.push(`${process.server.name}#${process.pid}`)
      }
    }

    if (failedProcesses.length > 0) {
      alert(`以下进程终止失败: ${failedProcesses.join(', ')}`)
    } else {
      alert('所有超时进程已终止')
    }

    await loadProcessesWithoutScan()
  }

  const getRuntime = (startTime: Date) => {
    const start = new Date(startTime)
    const now = new Date()
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000 / 60)
    if (diff < 60) return `${diff}分钟`
    const hours = Math.floor(diff / 60)
    const mins = diff % 60
    return `${hours}小时${mins}分钟`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">超时进程提醒</h1>
          <div className="flex gap-4">
            <Link href="/admin" className="px-4 py-2 text-blue-500 hover:underline">返回管理</Link>
            <button onClick={handleManualScan} disabled={scanning} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50">
              {scanning ? '扫描中...' : '手动扫描'}
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-6">
          <p className="text-yellow-800">
            以下进程已达到自动终止条件：
            <strong>匿名进程 &gt; {anonThreshold}分钟</strong> 或 <strong>已注册进程 &gt; 预估时间 + {anonThreshold}分钟</strong>
          </p>
          {processes.length > 0 && (
            <button
              onClick={handleKillAll}
              className="mt-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              一键Kill所有
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : processes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无超时进程</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">服务器</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">程序</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">说明</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">预估时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">已运行</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {processes.map((process) => (
                  <tr key={process.id} className="bg-red-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium">{process.server.name}</div>
                      <div className="text-xs text-gray-500">{process.server.host}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono">{process.pid}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{process.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{process.programName}</td>
                    <td className="px-6 py-4">{process.description || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {process.estimatedDuration ? `${process.estimatedDuration}+${anonThreshold}分钟` : `${anonThreshold}分钟`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-red-600 font-medium">
                      {getRuntime(process.actualStartTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleKill(process)}
                        disabled={killing === process.id}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 text-sm"
                      >
                        {killing === process.id ? '终止中...' : 'Kill'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
