import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import LogoutButton from "@/components/LogoutButton";

export default async function GuidePage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");

  const isGuest = profile?.status !== "approved";
  const supabase = createClient();

  return (
    <div className="app-shell">
      {isGuest ? (
        <div className="sidebar">
          <div className="side-logo">ATEC PLAY<span>통합 동호회 관리</span></div>
          <a href="/pending" className="side-link"><span className="side-dot" />동호회 둘러보기</a>
          <a href="/guide" className="side-link active"><span className="side-dot" />운영지침</a>
          <a href="/forms" className="side-link"><span className="side-dot" />양식함</a>
          <div className="side-user">
            <div className="avatar" style={{ background: "var(--gray-bg)", color: "var(--ink-2)" }}>
              {profile?.name?.slice(0, 2) || "게스트"}
            </div>
            <div style={{ flex: 1 }}>
              <div className="name">{profile?.name}</div>
              <div className="role">게스트 · 승인 대기</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      ) : (
        <Sidebar profile={profile} permissions={permissions} active="/guide" />
      )}
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 운영지침</div>
            <h1>사내 동호회 신설·운영 지침</h1>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">1. 사내동호회란</div>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
            임직원 간의 친목 도모와 다양한 레포츠 및 취미활동을 함께 할 수 있도록 장려하고, 신규입사자의 회사 내 적응과 유대감 형성에 도움을 줄 수 있도록 지원하는 사내 소모임입니다.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">2. 동호회 운영 개요</div>
          <table>
            <tbody>
              <tr><td style={{ width: 140, fontWeight: 500 }}>가입 대상</td><td>임직원</td></tr>
              <tr><td style={{ fontWeight: 500 }}>활동회비</td><td>매월 1만원 (급여공제)</td></tr>
              <tr><td style={{ fontWeight: 500 }}>활동일정</td><td>각 동호회별 월별 일정에 따라 모임 활동</td></tr>
              <tr>
                <td style={{ fontWeight: 500 }}>동호회 지원</td>
                <td>동호회 활동 참석인원 1인당 2만원 한도로 총 비용의 50%를 지원 (최대 30만원)</td>
              </tr>
            </tbody>
          </table>
          <div className="empty-note" style={{ paddingTop: 10 }}>
            ※ 본 시스템(ATEC PLAY)의 지원금 자동계산 기준(단가 × 참석인원)은 위 지원 기준을 반영해 동호회별로 설정됩니다.
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div className="card">
            <div className="section-title">3. 동호회 가입 절차</div>
            <ol style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 2, paddingLeft: 18 }}>
              <li>활동하고자 하는 동호회의 회장 또는 총무에게 가입 신청</li>
              <li>회장(총무)이 신규 가입자 명단을 월별로 인사팀 담당자에게 전달 (부서명·성명·활동 시작 월)</li>
              <li>탈퇴나 다른 동호회로 변경 가입하는 경우에도 회장(총무)을 통해 인사팀에 전달</li>
            </ol>
            <div className="empty-note">※ 각 동호회별 인원과 회비 관리를 위해 개인이 직접 신청할 수 없습니다. 본 시스템에서는 동호회 목록에서 가입 신청 → 회장/총무 승인 절차로 진행됩니다.</div>
          </div>
          <div className="card">
            <div className="section-title">4. 동호회 신설 절차</div>
            <ol style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 2, paddingLeft: 18 }}>
              <li>활동 중인 동호회와 다른 분야의 동호회를 만들고자 하는 경우 진행</li>
              <li>사내 공지를 통해 동호회원 5인 이상 구성 (같은 팀 인원으로만 구성 불가, 지사 제외)</li>
              <li>동호회등록신청서 작성 후 인사팀 제출</li>
              <li>제출서류: 등록신청서, 회원명부, 활동계획서, 동호회통장 사본</li>
              <li>내부결재 후 승인 여부를 해당 동호회 회장에게 통보</li>
              <li>승인 월부터 회원 회비를 급여공제 후 동호회에 지급</li>
            </ol>
          </div>
        </div>

        <div className="card">
          <div className="section-title">5. 지원금 신청 및 지급 절차</div>
          <div className="grid-2">
            <div>
              <div className="co-tag" style={{ marginBottom: 6, fontWeight: 500 }}>지원금 신청</div>
              <ol style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 2, paddingLeft: 18 }}>
                <li>매월 말일 '동호회 활동비 지원금 신청' 게시판 공지</li>
                <li>제출서류: 회사보조금 신청양식, 비용증빙서류(영수증)</li>
                <li>제출기한: 매 익월 10일까지</li>
              </ol>
            </div>
            <div>
              <div className="co-tag" style={{ marginBottom: 6, fontWeight: 500 }}>지원금 지급</div>
              <ol style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 2, paddingLeft: 18 }}>
                <li>회사보조금 신청서와 증빙서류 검토 후 내부결재</li>
                <li>지원기준에 합당한 건에 한하여 말일까지 동호회 통장으로 지급</li>
              </ol>
            </div>
          </div>
          <div className="empty-note" style={{ marginTop: 10 }}>
            지원기준: 동호회 활동에 따른 지출비용(활동 후 식사비, 필요장비 구입비, 활동장소 대여비, 관람티켓 구입비 등). 동호회 활동이 없는 단순 회식비는 지원되지 않습니다.
          </div>
        </div>
      </div>
    </div>
  );
}
