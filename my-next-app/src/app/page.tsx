export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans">
      <main className="flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          My Next App
        </h1>
        <a
          className="text-base font-medium text-blue-700 underline underline-offset-4 hover:text-blue-800"
          href="/api/health"
        >
          Check API health
        </a>
      </main>
    </div>
  );
}
