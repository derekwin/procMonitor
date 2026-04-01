'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAuthBootstrapState, initializeAdmin, loginAdmin } from '@/actions/auth'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [adminExists, setAdminExists] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    getAuthBootstrapState().then((state) => {
      if (state.isAuthenticated) {
        router.push('/admin')
      } else {
        setAdminExists(state.adminExists)
        setLoading(false)
      }
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!adminExists && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setSubmitting(true)
    const result = adminExists
      ? await loginAdmin(username, password)
      : await initializeAdmin(username, password)
    setSubmitting(false)

    if (result.success) {
      router.push('/admin')
    } else {
      setError(result.error || '登录失败')
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {adminExists ? '管理员登录' : '初始化管理员'}
        </h1>
        {!adminExists && (
          <p className="mb-4 text-sm text-gray-600">
            系统还没有管理员账号。请先创建首个管理员，创建完成后后续就按普通登录使用。
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          {!adminExists && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
          )}
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? '处理中...' : adminExists ? '登录' : '创建管理员'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-blue-500 hover:underline">返回首页</Link>
        </div>
      </div>
    </div>
  )
}
