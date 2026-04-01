import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">进程监控系统</h1>
          <Link 
            href="/login" 
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            管理员登录
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">注册我的进程</h2>
            <p className="text-gray-600 mb-4">
              如果你是某个服务器上进程的使用者，可以在此注册你的进程，
              说明程序用途和预估运行时间。
            </p>
            <Link 
              href="/register" 
              className="inline-block px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
            >
              前往注册
            </Link>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">进程看板</h2>
            <p className="text-gray-600 mb-4">
              查看所有受管服务器上的用户启动进程，包括已注册和匿名的进程。
            </p>
            <Link 
              href="/dashboard" 
              className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              查看看板
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}