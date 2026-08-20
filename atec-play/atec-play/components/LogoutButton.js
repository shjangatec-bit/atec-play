"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={logout} className="btn-sm btn-outline" style={{ padding: "0 8px" }} title="로그아웃">
      ↩
    </button>
  );
}
