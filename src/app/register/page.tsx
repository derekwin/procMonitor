'use client'

import { useState, useEffect } from 'react'
import { registerProcess, getServerList } from '@/actions/process'
import Link from 'next/link'

interface Server {
  id: string
  name: string
  host: string
}

export default function RegisterPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [formData, setFormData] = useState({
    serverId: '',
    pid: '',
    username: '',
    programName: '',
    description: '',
    estimatedDuration: '',
    durationUnit: 'minutes',
  })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    getServerList().then(setServers)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage('')

    // Convert duration to minutes
    let durationMinutes = parseInt(formData.estimatedDuration)
    if (formData.durationUnit === 'hours') {
      durationMinutes = durationMinutes * 60
    }

    const result = await registerProcess({
      serverId: formData.serverId,
      pid: parseInt(formData.pid),
      username: formData.username,
      programName: formData.programName,
      description: formData.description || undefined,
      estimatedDuration: durationMinutes,
    })

    setSubmitting(false)
    if (result.success) {
      setMessage(result.message || '作业申请提交成功！')
      setFormData({
        serverId: formData.serverId,
        pid: '',
        username: '',
        programName: '',
        description: '',
        estimatedDuration: '',
        durationUnit: 'minutes',
      })
    } else {
      setMessage(result.error || '提交失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">申请GPU作业</h1>
          <div className="flex gap-4">
            <Link href="/" className="px-4 py-2 text-blue-500 hover:underline">返回首页</Link>
            <Link href="/dashboard" className="px-4 py-2 text-blue-500 hover:underline">作业看板</Link>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto py-6 px-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-gray-600 mb-6">
            提交您的GPU作业申请（如深度学习训练、模型推理等），
            说明作业用途和预估运行时间。
            系统会自动跟踪GPU使用状态，超过预估时间将会提醒管理员。
          </p>
          
          {message && (
            <div className={`p-4 rounded-md mb-4 ${message.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">选择服务器 <span className="text-red-500">*</span></label>
              <select
                value={formData.serverId}
                onChange={(e) => setFormData({ ...formData, serverId: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                <option value="">请选择服务器</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.host})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">作业PID <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={formData.pid}
                  onChange={(e) => setFormData({ ...formData, pid: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="进程ID"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">作业用户 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="您的用户名"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">作业程序文件名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.programName}
                onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="如: train.py, inference.sh"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">预估运行时间 <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.estimatedDuration}
                  onChange={(e) => setFormData({ ...formData, estimatedDuration: e.target.value })}
                  className="flex-1 px-3 py-2 border rounded-md"
                  placeholder="运行时长"
                  required
                />
                <select
                  value={formData.durationUnit}
                  onChange={(e) => setFormData({ ...formData, durationUnit: e.target.value })}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="minutes">分钟</option>
                  <option value="hours">小时</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">超过此时间会提醒管理员确认是否结束作业</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">作业说明</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
                placeholder="简单描述这个作业是做什么的"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
            >
              {submitting ? '提交中...' : '提交申请'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}