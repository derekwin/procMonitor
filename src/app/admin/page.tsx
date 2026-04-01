'use client'

import { useState, useEffect } from 'react'
import { addServer, testServerConnection, getServers, deleteServer } from '@/actions/server'
import { logoutAdmin } from '@/actions/auth'
import { useRouter } from 'next/navigation'

interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
}

export default function AdminPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
  })
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    const data = await getServers()
    setServers(data)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    const result = await testServerConnection(formData)
    setTesting(false)
    alert(result.success ? '连接成功！' : `连接失败: ${result.error}`)
  }

  const handleAddServer = async () => {
    setSaving(true)
    const result = await addServer(formData)
    setSaving(false)
    if (result.success) {
      setShowAddModal(false)
      setFormData({ name: '', host: '', port: 22, username: '', password: '' })
      loadServers()
    }
  }

  const handleDeleteServer = async (id: string) => {
    if (confirm('确定要删除这个服务器吗？')) {
      await deleteServer(id)
      loadServers()
    }
  }

  const handleLogout = async () => {
    await logoutAdmin()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">管理员后台</h1>
          <div className="flex gap-4">
            <a href="/admin" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
              服务器管理
            </a>
            <a href="/admin/alerts" className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
              超时进程提醒
            </a>
            <button onClick={handleLogout} className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              退出登录
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">服务器列表</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            添加服务器
          </button>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">主机</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">端口</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户名</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {servers.map((server) => (
                <tr key={server.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{server.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{server.host}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{server.port}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{server.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => handleDeleteServer(server.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    暂无服务器，请添加
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[500px]">
            <h3 className="text-xl font-semibold mb-4">添加服务器</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="服务器别名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">主机地址</label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">端口</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">用户名</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">密码</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing || !formData.host || !formData.username || !formData.password}
                className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddServer}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}