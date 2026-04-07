'use client'

import { Fragment, useEffect, useState } from 'react'
import { getProcesses, killServerProcess, runMonitorScan } from '@/actions/monitor'
import { getSettings } from '@/actions/settings'
import { checkAdminSession } from '@/actions/auth'
import Link from 'next/link'

interface Process {
  id: string
  pid: number
  username: string
  programName: string
  workingDirectory: string | null
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

export default function DashboardPage() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [filter, setFilter] = useState<'all' | 'registered' | 'anonymous' | 'overtime'>('all')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [killing, setKilling] = useState<string | null>(null)

  async function loadProcessesWithoutScan() {
    const data = await getProcesses()
    setProcesses(data)
    setLoading(false)
  }

  async function scanAndReload(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setScanning(true)
    }

    try {
      const result = await runMonitorScan()
      if (!result.success && !options?.silent) {
        alert('扫描已执行，但部分服务器失败，请稍后查看是否有服务器连接或权限异常。')
      }

      await loadProcessesWithoutScan()
    } finally {
      if (!options?.silent) {
        setScanning(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    async function initialize() {
      const [admin, settingsData, processData] = await Promise.all([
        checkAdminSession(),
        getSettings(),
        getProcesses(),
      ])

      if (cancelled) {
        return
      }

      setIsAdmin(admin)
      setProcesses(processData)
      setLoading(false)

      if (settingsData.autoScan) {
        timer = setInterval(() => {
          void loadProcessesWithoutScan()
        }, (settingsData.scanInterval || 60) * 1000)
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

  async function handleManualScan() {
    await scanAndReload()
  }

  const handleKill = async (process: Process) => {
    if (!confirm(`确定要终止进程 ${process.pid} (${process.programName}) 吗？`)) return
    setKilling(process.id)
    const result = await killServerProcess(process.id)
    setKilling(null)
    if (result.success) {
      alert('进程已终止')
      await loadProcessesWithoutScan()
    } else {
      alert(`终止失败: ${result.error}`)
    }
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

  const getRuntimeMinutes = (startTime: Date) => {
    const start = new Date(startTime)
    const now = new Date()
    return Math.floor((now.getTime() - start.getTime()) / 1000 / 60)
  }

  const isOverTime = (process: Process) => {
    if (process.isAnonymous) {
      return true
    }

    const start = new Date(process.actualStartTime)
    const now = new Date()
    const runtimeMinutes = (now.getTime() - start.getTime()) / 1000 / 60

    if (process.estimatedDuration) {
      return runtimeMinutes > process.estimatedDuration
    }
    return false
  }

  const filteredProcesses = processes.filter(p => {
    if (filter === 'registered') return !p.isAnonymous
    if (filter === 'anonymous') return p.isAnonymous
    if (filter === 'overtime') return isOverTime(p)
    return true
  })

  const overTimeCount = processes.filter(isOverTime).length

  // Statistics calculations
  const userStats = processes.reduce((acc, p) => {
    if (!acc[p.username]) {
      acc[p.username] = { count: 0, totalMinutes: 0 }
    }
    acc[p.username].count++
    acc[p.username].totalMinutes += getRuntimeMinutes(p.actualStartTime)
    return acc
  }, {} as Record<string, { count: number; totalMinutes: number }>)

  const serverStats = processes.reduce((acc, p) => {
    const serverName = p.server.name
    if (!acc[serverName]) {
      acc[serverName] = { count: 0, totalMinutes: 0, users: new Set() }
    }
    acc[serverName].count++
    acc[serverName].totalMinutes += getRuntimeMinutes(p.actualStartTime)
    acc[serverName].users.add(p.username)
    return acc
  }, {} as Record<string, { count: number; totalMinutes: number; users: Set<string> }>)

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}小时${mins}分钟`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">作业看板</h1>
          <div className="flex gap-4">
            <button
              onClick={handleManualScan}
              disabled={scanning}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
            >
              {scanning ? '扫描中...' : '手动扫描'}
            </button>
            <Link href="/" className="px-4 py-2 text-blue-500 hover:underline">返回首页</Link>
            {isAdmin && overTimeCount > 0 && (
              <Link href="/admin/alerts" className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
                有{overTimeCount}个超时作业
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">总作业数</div>
            <div className="text-2xl font-bold text-blue-600">{processes.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">已注册作业</div>
            <div className="text-2xl font-bold text-green-600">{processes.filter(p => !p.isAnonymous).length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">匿名作业</div>
            <div className="text-2xl font-bold text-gray-600">{processes.filter(p => p.isAnonymous).length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">超时作业</div>
            <div className="text-2xl font-bold text-red-600">{overTimeCount}</div>
          </div>
        </div>

        {/* User Statistics */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <h3 className="text-lg font-semibold mb-3">用户作业统计</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(userStats).map(([user, stats]) => (
              <div key={user} className="bg-gray-50 p-3 rounded">
                <div className="font-medium text-sm">{user}</div>
                <div className="text-xs text-gray-500">
                  作业数: {stats.count} | 运行时长: {formatTime(stats.totalMinutes)}
                </div>
              </div>
            ))}
            {Object.keys(userStats).length === 0 && (
              <div className="text-gray-500 text-sm col-span-4">暂无数据</div>
            )}
          </div>
        </div>

        {/* Server Statistics */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <h3 className="text-lg font-semibold mb-3">服务器负载统计</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(serverStats).map(([server, stats]) => (
              <div key={server} className="bg-gray-50 p-3 rounded">
                <div className="font-medium text-sm">{server}</div>
                <div className="text-xs text-gray-500">
                  作业数: {stats.count} | 用户数: {stats.users.size} | 总运行时长: {formatTime(stats.totalMinutes)}
                </div>
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{ width: `${Math.min(100, stats.count * 20)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {stats.count < 3 ? '空闲' : stats.count < 6 ? '正常' : '繁忙'}
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(serverStats).length === 0 && (
              <div className="text-gray-500 text-sm col-span-3">暂无数据</div>
            )}
          </div>
        </div>

        {/* Filter */}
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
          <button
            onClick={() => setFilter('overtime')}
            className={`px-4 py-2 rounded-md ${filter === 'overtime' ? 'bg-red-500 text-white' : 'bg-white border'}`}
          >
            超时 ({overTimeCount})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full table-auto">
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
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProcesses.map((process) => {
                  const overtime = isOverTime(process)
                  const columnCount = isAdmin ? 9 : 8
                  return (
                    <Fragment key={process.id}>
                      <tr className={overtime ? 'bg-yellow-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium">{process.server.name}</div>
                          <div className="text-xs text-gray-500">{process.server.host}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{process.pid}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{process.username}</td>
                        <td className="px-6 py-4 max-w-[320px] break-all">{process.programName}</td>
                        <td className="px-6 py-4 max-w-[240px] break-words">{process.description || '-'}</td>
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
                        {isAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isOverTime(process) && (
                              <button
                                onClick={() => handleKill(process)}
                                disabled={killing === process.id}
                                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 text-xs"
                              >
                                {killing === process.id ? '终止中' : 'Kill'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      <tr className={overtime ? 'bg-yellow-50' : ''}>
                        <td colSpan={columnCount} className="px-6 pb-3 pl-12 pt-0">
                          <div className="border-l-2 border-gray-200 pl-3 text-xs text-gray-500">
                            <span className="mr-2 text-gray-400">/proc/{process.pid}/cwd</span>
                            <span className="font-mono break-all text-gray-700">
                              {process.workingDirectory || '读取失败或当前用户无权限访问'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
                {filteredProcesses.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="px-6 py-4 text-center text-gray-500">
                      暂无作业数据
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
