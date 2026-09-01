import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// 헷갈리기 쉬운 문자(0/O, 1/l/I 등)는 빼고 임시 비밀번호를 만듭니다.
function randomPassword(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req) {
  let userId;
  try {
    ({ userId } = await req.json());
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });

  // 1) 이 API를 호출한 사람이 로그인한 통합관리자인지 서버에서 다시 확인합니다.
  //    (화면에서 버튼을 숨기는 것만으로는 부족하고, 서버에서도 반드시 재검증해야 안전합니다.)
  const supabase = createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: perms } = await supabase
    .from("user_permissions")
    .select("permission_code, club_id, company_id")
    .eq("user_id", authUser.id);

  const isAdmin = (perms || []).some(
    (p) =>
      (p.permission_code === "ACC_APPROVE" || p.permission_code === "ACC_MANAGE") &&
      p.club_id === null &&
      p.company_id === null
  );
  if (!isAdmin) {
    return NextResponse.json({ error: "통합관리자만 비밀번호를 초기화할 수 있습니다." }, { status: 403 });
  }

  // 2) 여기서부터는 service role 키로만 가능한 "관리자 권한 API"를 사용합니다.
  //    이 키는 절대 브라우저로 내려가지 않고, 이 서버 코드 안에서만 사용됩니다.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "서버에 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되어 있지 않습니다. Vercel 환경변수를 확인해 주세요." },
      { status: 500 }
    );
  }

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const newPassword = randomPassword();
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ newPassword });
}
