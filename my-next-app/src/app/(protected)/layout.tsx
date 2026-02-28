import Sidebar from "../sidebar";
import AuthHeader from "../../../components/AuthHeader";
import LogoutButton from "../../../components/LogoutButton";

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#bfe9ff] to-[#ffcdf3]">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-50 flex items-center justify-end gap-4 border-b border-white/30 bg-transparent px-8 py-4 text-sm font-semibold tracking-wide text-zinc-800 shadow-sm backdrop-blur-md">
            <span>Funny Captions!</span>
            <AuthHeader />
            <LogoutButton />
          </header>
          <main className="flex-1 px-6 pb-10 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
