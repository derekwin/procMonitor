import { NextRequest, NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { scanServers } from '@/lib/monitor'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronRequest = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)
  const isAdminRequest = Boolean(await getSession())

  if (!isCronRequest && !isAdminRequest) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await scanServers()
  return NextResponse.json(result, { status: result.success ? 200 : 207 })
}
