import { redirect } from 'next/navigation'

import { hasAdminSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import AdminLoginClient from './page-client'

export default async function AdminLoginPage() {
  const [isAuthenticated, adminCount] = await Promise.all([
    hasAdminSession(),
    prisma.admin.count(),
  ])

  if (isAuthenticated) {
    redirect('/admin')
  }

  return <AdminLoginClient adminExists={adminCount > 0} />
}
