import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function AuthHeader() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-full bg-white/70 px-3 py-2 shadow-sm">
      <span className="text-xs font-semibold text-zinc-700">
        {user.email}
      </span>
    </div>
  );
}
