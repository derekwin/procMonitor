import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'GPU 作业监控系统',
  description: '用于登记、扫描和处理 GPU 作业的内部监控平台',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
