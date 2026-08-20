"use client";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/org", label: "조직/인원 조회" },
  { href: "/clubs", label: "동호회" },
];

const ADMIN_LINKS = [
  { href: "/admin/accounts", label: "계정 승인" },
  { href: "/admin/permissions", label: "권한 설정" },
  { href: "/admin/club-requests", label: "동호회 신청 승인" },
  { href: "/admin/support-rates", label: "지원 단가 설정" },
  { href: "/admin/stats", label: "전체 통계" },
];

export default function Sidebar({ profile, permissions, active }) {
  const router = useRouter();
  const isAdmin = hasPermission(permissions, "ACC_APPROVE");
  const companyId = profile?.company?.id;
  const isBudgetOfficer =
    hasPermission(permissions, "CLUB_BUDGET_DISBURSE", { companyId }) ||
    hasPermission(permissions, "ORG_VIEW_COMPANY", { companyId });

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="sidebar">
      <div className="side-logo">
        ATEC PLAY
        <span>통합 동호회 관리</span>
      </div>
      {LINKS.map((link) => (
        <a key={link.href} href={link.href} className={`side-link${active === link.href ? " active" : ""}`}>
          <span className="side-dot" />
          {link.label}
        </a>
      ))}
      {isBudgetOfficer && (
        <>
          <div className="side-section">회사 담당</div>
          <a
            href="/company/budget-payments"
            className={`side-link${active === "/company/budget-payments" ? " active" : ""}`}
          >
            <span className="side-dot" />
            지원금 지급 관리
          </a>
        </>
      )}
      <div className="side-section">내 정보</div>
      <a href="/clubs?mine=1" className="side-link">
        <span className="side-dot" />
        내 동호회
      </a>
      {isAdmin && (
        <>
          <div className="side-section">관리자</div>
          {ADMIN_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`side-link${active === link.href ? " active" : ""}`}>
              <span className="side-dot" />
              {link.label}
            </a>
          ))}
        </>
      )}
      <div className="side-user">
        <div className="avatar">{profile?.name?.slice(0, 2)}</div>
        <div style={{ flex: 1 }}>
          <div className="name">{profile?.name}</div>
          <div className="role">{profile?.company?.name}</div>
        </div>
        <button onClick={logout} className="btn-sm btn-outline" style={{ padding: "0 8px" }} title="로그아웃">
          ↩
        </button>
      </div>
    </div>
  );
}
