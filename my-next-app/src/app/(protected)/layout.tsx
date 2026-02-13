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
      <div className="relative flex min-h-screen">
        <Sidebar />
        <header className="absolute right-8 top-6 flex items-center gap-4 text-sm font-semibold tracking-wide text-zinc-800">
          <span>Judy&apos;s Humor Project</span>
          <AuthHeader />
          <LogoutButton />
        </header>
        <main className="flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
