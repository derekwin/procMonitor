'use client'

import { startTransition, useEffect, useState } from 'react'
import Link from 'next/link'
import { addServer, testServerConnection, getServers, deleteServer } from '@/actions/server'
import { logoutAdmin } from '@/actions/auth'
import { getAdminCronSettings, getSettings, updateCronSecret, updateSettings } from '@/actions/settings'
import { changeAdminPassword } from '@/actions/admin'
import { useRouter } from 'next/navigation'

interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
}

interface Settings {
  autoScan: boolean
  scanInterval: number
  anonProcessThreshold: number
}

export default function AdminPage() {
  const [servers, setServers] = useState<Server[]>([])
  const [settings, setSettings] = useState<Settings>({ autoScan: true, scanInterval: 60, anonProcessThreshold: 120 })
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
  })
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')
  const [cronSecret, setCronSecret] = useState('')
  const [savingCronSecret, setSavingCronSecret] = useState(false)
  const router = useRouter()

  async function loadServers() {
    const data = await getServers()
    setServers(data)
  }

  async function loadSettings() {
    const data = await getSettings()
    setSettings(data)
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const [serversData, settingsData, cronData] = await Promise.all([
        getServers(),
        getSettings(),
        getAdminCronSettings(),
      ])

      if (cancelled) {
        return
      }

      startTransition(() => {
        setServers(serversData)
        setSettings(settingsData)
        setCronSecret(cronData.cronSecret)
      })
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  const handleTestConnection = async () => {
    setTesting(true)
    const result = await testServerConnection(formData)
    setTesting(false)
    alert(result.success ? '连接成功！' : '连接失败: ' + result.error)
  }

  const handleAddServer = async () => {
    setSaving(true)
    const result = await addServer(formData)
    setSaving(false)
    if (result.success) {
      setShowAddModal(false)
      setFormData({ name: '', host: '', port: 22, username: '', password: '' })
      await loadServers()
    } else {
      alert(result.error || '保存失败')
    }
  }

  const handleDeleteServer = async (id: string) => {
    if (confirm('确定要删除这个服务器吗？')) {
      const result = await deleteServer(id)
      if (!result.success) {
        alert(result.error || '删除失败')
        return
      }
      await loadServers()
    }
  }

  const handleLogout = async () => {
    await logoutAdmin()
    router.push('/')
  }

  const handleSettingsChange = async (key: string, value: boolean | number) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    const result = await updateSettings({ 
      autoScan: newSettings.autoScan, 
      scanInterval: newSettings.scanInterval,
      anonProcessThreshold: newSettings.anonProcessThreshold 
    })
    if (!result.success) {
      alert(result.error || '设置保存失败')
      await loadSettings()
    }
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMsg('两次输入的新密码不一致')
      return
    }
    if (passwordData.newPassword.length < 6) {
      setPasswordMsg('新密码长度至少6位')
      return
    }
    setChangingPassword(true)
    const result = await changeAdminPassword(passwordData.oldPassword, passwordData.newPassword)
    setChangingPassword(false)
    if (result.success) {
      setPasswordMsg('密码修改成功')
      setTimeout(() => {
        setShowPasswordModal(false)
        setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' })
        setPasswordMsg('')
      }, 1500)
    } else {
      setPasswordMsg(result.error || '修改失败')
    }
  }

  const handleSaveCronSecret = async () => {
    setSavingCronSecret(true)
    const result = await updateCronSecret(cronSecret)
    setSavingCronSecret(false)

    if (!result.success) {
      alert(result.error || 'Cron 密钥保存失败')
      return
    }

    setCronSecret(result.cronSecret ?? '')
    alert(result.enabled ? 'Cron 密钥已保存' : 'Cron 外部调用已禁用')
  }

  const handleGenerateCronSecret = () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24))
    const generated = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    setCronSecret(generated)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">管理员后台</h1>
          <div className="flex gap-4">
            <button onClick={() => setShowPasswordModal(true)} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
              修改密码
            </button>
            <button onClick={() => setShowSettings(true)} className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              设置
            </button>
            <Link href="/admin/alerts" className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
              超时作业提醒
            </Link>
            <button onClick={handleLogout} className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              退出登录
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">服务器列表</h2>
          <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">
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
                    <button onClick={() => handleDeleteServer(server.id)} className="text-red-500 hover:text-red-700">
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
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border rounded-md" placeholder="服务器别名" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">主机地址</label>
                <input type="text" value={formData.host} onChange={(e) => setFormData({ ...formData, host: e.target.value })} className="w-full px-3 py-2 border rounded-md" placeholder="192.168.1.100" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">端口</label>
                <input type="number" value={formData.port} onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">用户名</label>
                <input type="text" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">密码</label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 text-xs text-yellow-800">
                <p className="font-medium">提示</p>
                <p className="mt-1">系统会优先尝试普通 <code className="bg-white px-1 rounded">kill</code>，失败后再尝试使用该 SSH 账号的 sudo 密码执行。</p>
                <p className="mt-1">如果你的服务器支持免密 sudo，仍然推荐放行 <code className="bg-white px-1 rounded">/bin/kill</code> 和 <code className="bg-white px-1 rounded">/usr/bin/kill</code>，但不是必须条件。</p>
              </div>
              <button onClick={handleTestConnection} disabled={testing || !formData.host || !formData.username || !formData.password} className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50">
                {testing ? '测试中...' : '测试连接'}
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddServer} disabled={saving} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[400px]">
            <h3 className="text-xl font-semibold mb-4">系统设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">自动扫描</label>
                <button onClick={() => handleSettingsChange('autoScan', !settings.autoScan)} className={'relative inline-flex h-6 w-11 items-center rounded-full ' + (settings.autoScan ? 'bg-blue-500' : 'bg-gray-300')}>
                  <span className={'inline-block h-4 w-4 transform rounded-full bg-white ' + (settings.autoScan ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">扫描间隔（秒）</label>
                <input type="number" value={settings.scanInterval} onChange={(e) => handleSettingsChange('scanInterval', parseInt(e.target.value))} className="w-full px-3 py-2 border rounded-md" min={10} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">自动终止宽限时间（分钟）</label>
                <input type="number" value={settings.anonProcessThreshold || 120} onChange={(e) => handleSettingsChange('anonProcessThreshold', parseInt(e.target.value))} className="w-full px-3 py-2 border rounded-md" min={60} />
                <p className="mt-1 text-xs text-gray-500">未登记进程运行超过该时间会被自动终止；已登记进程则会在“预估时间 + 该时间”后自动终止。</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cron 调用密钥</label>
                <input
                  type="text"
                  value={cronSecret}
                  onChange={(e) => setCronSecret(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="留空表示禁用外部 cron 调用"
                />
                <p className="mt-1 text-xs text-gray-500">管理员手动扫描始终可用。只有你需要外部定时器调用扫描接口时，才需要配置这里。</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleGenerateCronSecret}
                    type="button"
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                  >
                    自动生成
                  </button>
                  <button
                    onClick={handleSaveCronSecret}
                    disabled={savingCronSecret}
                    type="button"
                    className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:opacity-50"
                  >
                    {savingCronSecret ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full mt-4 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              关闭
            </button>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[400px]">
            <h3 className="text-xl font-semibold mb-4">修改管理员密码</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">原密码</label>
                <input type="password" value={passwordData.oldPassword} onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">新密码</label>
                <input type="password" value={passwordData.newPassword} onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">确认新密码</label>
                <input type="password" value={passwordData.confirmPassword} onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
              </div>
              {passwordMsg && (
                <div className={'p-3 rounded-md text-sm ' + (passwordMsg.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                  {passwordMsg}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handlePasswordChange} disabled={changingPassword || !passwordData.oldPassword || !passwordData.newPassword} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50">
                {changingPassword ? '修改中...' : '确认修改'}
              </button>
              <button onClick={() => { setShowPasswordModal(false); setPasswordMsg('') }} className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
