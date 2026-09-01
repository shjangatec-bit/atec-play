"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PasswordChangeForm() {
  const router = useRouter();
  const supabase = createClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (next.length < 8) {
      setError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setSaving(true);

    // 본인 확인: 현재 비밀번호로 다시 로그인을 시도해서 맞는지 검증합니다.
    // (관리자가 초기화해준 임시 비밀번호를 입력하는 경우에도 이 값이 "현재 비밀번호"입니다.)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      setSaving(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (verifyError) {
      setError("현재 비밀번호가 올바르지 않습니다.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (updateError) {
      setError("비밀번호 변경 실패: " + updateError.message);
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    alert("비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용해 주세요.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error-text">{error}</div>}
      <div className="field">
        <label>현재 비밀번호</label>
        <input
          type="password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="관리자가 초기화해줬다면 그 임시 비밀번호"
        />
      </div>
      <div className="field">
        <label>새 비밀번호</label>
        <input
          type="password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="8자 이상"
        />
      </div>
      <div className="field">
        <label>새 비밀번호 확인</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="한 번 더 입력"
        />
      </div>
      <button className="btn btn-primary" disabled={saving}>
        {saving ? "변경 중..." : "비밀번호 변경"}
      </button>
    </form>
  );
}
