"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("status")
      .eq("id", data.user.id)
      .single();

    if (profile?.status === "pending") {
      router.push("/pending");
    } else if (profile?.status === "approved") {
      router.push("/dashboard");
    } else {
      setError("계정이 정지되었거나 반려된 상태입니다. 통합관리자에게 문의해주세요.");
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div>
          <div className="mark">ATEC PLAY</div>
          <h1>
            6개 계열사 임직원이
            <br />
            함께 만드는 동호회
          </h1>
          <div className="company-dots">
            <span style={{ background: "var(--c1)" }} />
            <span style={{ background: "var(--c2)" }} />
            <span style={{ background: "var(--c3)" }} />
            <span style={{ background: "var(--c4)" }} />
            <span style={{ background: "var(--c5)" }} />
            <span style={{ background: "var(--c6)" }} />
          </div>
        </div>
        <div className="auth-brand-foot">
          에이텍 · 에이텍컴퓨터 · 에이텍씨앤
          <br />
          에이텍시스템 · 에이텍모빌리티 · 에이텍오토
        </div>
      </div>
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h2>로그인</h2>
          <div className="sub">계정으로 로그인해 주세요.</div>
          {error && <div className="error-text">{error}</div>}
          <div className="field">
            <label>이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
            />
          </div>
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
          <div className="auth-foot-link">
            계정이 없으신가요? <a href="/signup"><b>회원가입</b></a>
          </div>
        </form>
      </div>
    </div>
  );
}
