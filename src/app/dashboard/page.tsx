'use client'

import { useState, useEffect } from 'react'
import { getProcesses } from '@/actions/dashboard'
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
    name: string
    host: string
  }
}

export default function DashboardPage() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [filter, setFilter] = useState<'all' | 'registered' | 'anonymous'>('all')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    loadSettingsAndProcesses()
  }, [])

  const loadSettingsAndProcesses = async () => {
    const settings = await getSettings()
    const interval = (settings.scanInterval || 60) * 1000
    
    loadProcesses()
    const timer = setInterval(loadProcesses, interval)
    return () => clearInterval(timer)
  }

  const handleManualScan = async () => {
    setScanning(true)
    await loadProcesses()
    setScanning(false)
  }

  const loadProcesses = async () => {
    try {
      await fetch('/api/cron/scan', { method: 'POST' })
    } catch (e) {}
    const data = await getProcesses()
    setProcesses(data)
    setLoading(false)
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

  const isOverTime = (process: Process) => {
    const start = new Date(process.actualStartTime)
    const now = new Date()
    const hours = (now.getTime() - start.getTime()) / 1000 / 60 / 60
    
    if (process.isAnonymous) {
      return hours > 6
    }
    if (process.estimatedDuration) {
      const estimatedHours = process.estimatedDuration / 60
      return hours > estimatedHours
    }
    return false
  }

  const filteredProcesses = processes.filter(p => {
    if (filter === 'registered') return !p.isAnonymous
    if (filter === 'anonymous') return p.isAnonymous
    return true
  })

  const overTimeCount = processes.filter(isOverTime).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">进程看板</h1>
          <div className="flex gap-4">
            <button
              onClick={handleManualScan}
              disabled={scanning}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
            >
              {scanning ? '扫描中...' : '手动扫描'}
            </button>
            <Link href="/" className="px-4 py-2 text-blue-500 hover:underline">返回首页</Link>
            {overTimeCount > 0 && (
              <Link href="/admin/alerts" className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
                有{overTimeCount}个超时进程
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md ${filter === 'all' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
          >
            全部 ({processes.length})
          </button>
          <button
            onClick={() => setFilter('registered')}
            className={`px-4 py-2 rounded-md ${filter === 'registered' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
          >
            已注册 ({processes.filter(p => !p.isAnonymous).length})
          </button>
          <button
            onClick={() => setFilter('anonymous')}
            className={`px-4 py-2 rounded-md ${filter === 'anonymous' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
          >
            匿名 ({processes.filter(p => p.isAnonymous).length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProcesses.map((process) => {
                  const overtime = isOverTime(process)
                  return (
                    <tr key={process.id} className={overtime ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium">{process.server.name}</div>
                        <div className="text-xs text-gray-500">{process.server.host}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{process.pid}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{process.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{process.programName}</td>
                      <td className="px-6 py-4">{process.description || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {process.estimatedDuration ? `${process.estimatedDuration}分钟` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getRuntime(process.actualStartTime)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {process.isAnonymous ? (
                          <span className="text-xs bg-gray-200 px-2 py-1 rounded">匿名</span>
                        ) : (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">已注册</span>
                        )}
                        {overtime && (
                          <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded">超时</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filteredProcesses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      暂无进程数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}