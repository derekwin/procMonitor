import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">GPU作业协调申请系统</h1>
          <div className="flex gap-4">
            <Link 
              href="/login" 
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              管理员登录
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <div className="text-center mb-8">
          <p className="text-xl text-gray-600">
            分布式GPU服务器作业管理与监控平台
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">申请GPU作业</h2>
            <p className="text-gray-600 mb-4">
              如果您需要长时间运行GPU作业（如深度学习训练、模型推理等），
              请在此注册您的作业，说明用途和预估运行时间。
              系统会自动跟踪GPU使用状态。
            </p>
            <Link 
              href="/register" 
              className="inline-block px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
            >
              申请作业
            </Link>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">GPU作业看板</h2>
            <p className="text-gray-600 mb-4">
              查看所有GPU服务器上的作业运行状态，包括已申请和未登记的作业。
              超过预估时间的作业将会被标记提醒。
            </p>
            <Link 
              href="/dashboard" 
              className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              查看看板
            </Link>
          </div>
        </div>

        <div className="mt-8 bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">使用说明</h3>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            <li>通过&quot;申请作业&quot;提交您的 GPU 作业信息，并填写用途和预估运行时间</li>
            <li>如果作业需要继续运行，可再次提交同一服务器和 PID，更新预估时间；计时仍按开始时间 + 预估时间计算</li>
            <li>提交后可在作业看板查看自己的作业是否已被识别和登记</li>
            <li>系统自动扫描GPU进程，识别深度学习训练、推理等作业</li>
            <li>未登记进程超过系统宽限时间，或已登记作业超过“预估时间 + 宽限时间”后，会被自动终止</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
