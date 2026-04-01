import { redirect } from 'next/navigation'

import { hasAdminSession } from '@/lib/auth'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const isAdmin = await hasAdminSession()

  if (!isAdmin) {
    redirect('/login')
  }

  return children
}
