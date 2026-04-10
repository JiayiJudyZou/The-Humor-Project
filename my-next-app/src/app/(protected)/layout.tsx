import Sidebar from "../sidebar";
import AuthHeader from "../../../components/AuthHeader";
import LogoutButton from "../../../components/LogoutButton";

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-cotton-candy min-h-screen">
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="relative z-10 flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-50 border-b border-white/45 bg-transparent px-5 py-3 backdrop-blur-xl sm:px-8">
            <div className="ui-surface mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Funny Captions</p>
                <p className="truncate text-sm font-semibold text-zinc-900">Creative caption workflow</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <AuthHeader />
                <LogoutButton />
              </div>
            </div>
          </header>

          <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 px-4 pb-10 pt-6 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
