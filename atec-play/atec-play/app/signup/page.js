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
          <button className="btn btn-primary" disabled={loading}>
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
