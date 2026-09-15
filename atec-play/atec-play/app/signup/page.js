"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [companies, setCompanies] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("companies")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCompanies(data || []));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!companyId) {
      setError("소속회사를 선택해주세요.");
      return;
    }
    if (!agreed) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from("users").insert({
      id: data.user.id,
      email,
      name,
      company_id: companyId,
      status: "pending",
    });

    if (profileError) {
      setError("가입 처리 중 문제가 발생했습니다: " + profileError.message);
      setLoading(false);
      return;
    }

    router.push("/pending");
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div>
          <div className="mark">ATEC PLAY</div>
          <h1>
            가입 신청 후
            <br />
            통합관리자 승인이 필요합니다
          </h1>
        </div>
        <div className="auth-brand-foot">승인 전에도 동호회 목록 열람과 가입 신청은 가능합니다.</div>
      </div>
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2>회원가입</h2>
          <div className="sub">정보를 입력하면 가입 신청이 접수됩니다.</div>
          {error && <div className="error-text">{error}</div>}
          <div className="field">
            <label>이름</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
          </div>
          <div className="field">
            <label>이메일</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="자유롭게 입력" />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" />
          </div>
          <div className="field">
            <label>소속회사</label>
            <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">선택해 주세요</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: 16, height: 16, margin: 0 }}
              />
              <span>개인정보 수집·이용에 동의합니다 (필수)</span>
            </label>
            <button
              type="button"
              onClick={() => setShowTerms((v) => !v)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                marginTop: 6,
                color: "#888",
                fontSize: 13,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {showTerms ? "내용 접기" : "수집 항목 및 이용 목적 보기"}
            </button>
            {showTerms && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(127,127,127,0.10)",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <b>수집 항목</b>
                <br />
                이름, 이메일, 소속회사, 동호회 가입 및 활동 내역
                <br />
                <br />
                <b>이용 목적</b>
                <br />
                사내 동호회 운영, 회원 관리, 동호회 지원금 산정 및 지급 처리
                <br />
                <br />
                <b>보유 및 이용 기간</b>
                <br />
                퇴사 또는 동호회 탈회 시까지. 단, 지원금 지급 내역은 회계 증빙을 위해 관계 법령에서 정한 기간 동안 보관합니다.
                <br />
                <br />
                동의를 거부하실 수 있으나, 이 경우 동호회 가입 및 지원금 신청 등 서비스 이용이 제한됩니다.
              </div>
            )}
          </div>

          <button className="btn btn-primary" disabled={loading || !agreed}>
            {loading ? "처리 중..." : "가입 신청"}
          </button>
          <div className="auth-foot-link">
            이미 계정이 있으신가요? <a href="/login"><b>로그인</b></a>
          </div>
        </form>
      </div>
    </div>
  );
}
