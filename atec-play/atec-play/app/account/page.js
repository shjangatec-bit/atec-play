import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import PasswordChangeForm from "./PasswordChangeForm";

export default async function AccountPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (!profile) redirect("/login");

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/account" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 내 정보</div>
            <h1>내 정보</h1>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">기본 정보</div>
          <table>
            <tbody>
              <tr>
                <td style={{ color: "var(--ink-2)", width: 120 }}>이름</td>
                <td>{profile.name}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--ink-2)" }}>이메일</td>
                <td className="mono">{profile.email}</td>
              </tr>
              <tr>
                <td style={{ color: "var(--ink-2)" }}>소속회사</td>
                <td>{profile.company?.name || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card" style={{ maxWidth: 420 }}>
          <div className="section-title">비밀번호 변경</div>
          <PasswordChangeForm />
        </div>
      </div>
    </div>
  );
}
