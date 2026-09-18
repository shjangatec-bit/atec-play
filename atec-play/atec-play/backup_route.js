import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// 복원할 때 올리는 순서대로 번호를 붙였습니다. (앞 번호 표가 먼저 있어야 뒷 번호 표가 들어갑니다)
const TABLES = [
  { file: "01_companies", table: "companies", label: "회사" },
  { file: "02_users", table: "users", label: "회원" },
  { file: "03_permissions", table: "permissions", label: "권한 목록", order: "code" },
  { file: "04_clubs", table: "clubs", label: "동호회" },
  { file: "05_user_permissions", table: "user_permissions", label: "계정별 권한" },
  { file: "06_club_members", table: "club_members", label: "동호회 가입현황" },
  { file: "07_club_lifecycle_requests", table: "club_lifecycle_requests", label: "개설·폐설 신청" },
  { file: "08_club_support_rates", table: "club_support_rates", label: "지원 단가" },
  { file: "09_posts", table: "posts", label: "게시글·활동보고서" },
  { file: "10_post_attachments", table: "post_attachments", label: "첨부파일 목록" },
  { file: "11_post_attendees", table: "post_attendees", label: "활동 참석자" },
  { file: "12_post_comments", table: "post_comments", label: "댓글" },
  { file: "13_post_likes", table: "post_likes", label: "좋아요", order: "post_id" },
  { file: "14_club_budget_disbursements", table: "club_budget_disbursements", label: "지원금 지급내역" },
];

// ───────── 1) 표 전체 읽기 (Supabase는 한 번에 1,000행까지만 주므로 나눠서 읽습니다) ─────────
async function fetchAll(client, table, orderCol = "id") {
  const PAGE = 1000;
  let rows = [];
  let useOrder = true;
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select("*").range(from, from + PAGE - 1);
    if (useOrder) q = q.order(orderCol, { ascending: true });
    let { data, error } = await q;
    if (error && useOrder) {
      // 정렬 기준 컬럼이 없는 표면 정렬 없이 다시 읽습니다.
      useOrder = false;
      ({ data, error } = await client.from(table).select("*").range(from, from + PAGE - 1));
    }
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ───────── 2) CSV 만들기 ─────────
function toCsv(rows) {
  if (!rows.length) return "";
  const cols = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => !cols.includes(k) && cols.push(k)));
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

// ───────── 3) ZIP 만들기 (외부 라이브러리 없이, 압축 없는 방식) ─────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function buildZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = f.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // 파일명 UTF-8
    local.writeUInt16LE(0, 8); // 압축 안 함
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);

    offset += local.length + name.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

// ───────── 4) 요청 처리 ─────────
export async function GET() {
  // 통합관리자(승인 상태)인지 서버에서 다시 확인합니다.
  const supabase = createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: me } = await supabase.from("users").select("status").eq("id", authUser.id).single();
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
  if (me?.status !== "approved" || !isAdmin) {
    return NextResponse.json({ error: "통합관리자만 백업할 수 있습니다." }, { status: 403 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다." }, { status: 500 });
  }

  // 접근 제한(RLS)에 걸리지 않고 전체를 빠짐없이 읽기 위해 service role 키를 씁니다.
  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const files = [];
  const summary = [];

  try {
    const results = await Promise.all(TABLES.map((t) => fetchAll(admin, t.table, t.order)));
    TABLES.forEach((t, i) => {
      const csv = Buffer.from(toCsv(results[i]), "utf8");
      files.push({ name: `restore/${t.file}.csv`, data: csv }); // 복원용 (Supabase에 다시 올릴 때)
      files.push({ name: `excel/${t.file}.csv`, data: Buffer.concat([BOM, csv]) }); // 엑셀 확인용 (한글 안 깨짐)
      summary.push(`${t.file}.csv  ${t.label}  ${results[i].length}건`);
    });
  } catch (e) {
    return NextResponse.json({ error: `백업 중 오류: ${e.message}` }, { status: 500 });
  }

  const readme = [
    `ATEC PLAY 전체 백업 (${today}, 백업자: ${authUser.email})`,
    "",
    "[폴더 설명]",
    "excel   : 엑셀로 열어서 확인·집계할 때 사용 (더블클릭하면 한글이 깨지지 않음)",
    "restore : 시스템 복구 시 Supabase에 다시 올릴 때 사용 (이 폴더 파일은 수정하지 말 것)",
    "",
    "[파일 목록]",
    ...summary,
    "",
    "[복원 방법]",
    "1. Supabase > Table Editor에서 복구할 표를 연다",
    "2. Insert > Import data from CSV 로 restore 폴더의 파일을 올린다",
    "3. 반드시 파일 번호 순서(01 → 14)대로 올린다",
    "",
    "[백업에 포함되지 않는 것]",
    "- 로그인 비밀번호: 복구 후 계정 재생성 및 비밀번호 초기화 필요",
    "- 사진·첨부파일 실물: Supabase > Storage > club-files 에서 별도 다운로드",
    "- 0건인 표는 빈 파일로 저장됨 (복원할 필요 없음)",
  ].join("\r\n");
  files.unshift({ name: "00_README.txt", data: Buffer.concat([BOM, Buffer.from(readme, "utf8")]) });

  const zip = buildZip(files);
  const fileName = `ATECPLAY_backup_${today}.zip`;
  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
