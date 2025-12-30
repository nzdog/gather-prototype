export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Gather Prototype</h1>
        <p className="text-gray-600">
          Event coordination for Richardson Family Christmas 2025
        </p>
        <div className="mt-8 space-y-4">
          <div className="p-4 border rounded-lg">
            <h2 className="font-semibold mb-2">Access Views</h2>
            <p className="text-sm text-gray-600">
              Use magic link tokens to access:
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>/h/[token] - Host Overview</li>
              <li>/c/[token] - Coordinator Team Sheet</li>
              <li>/p/[token] - Participant View</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
