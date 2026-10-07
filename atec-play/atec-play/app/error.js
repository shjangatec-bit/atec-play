"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="auth-shell">
      <div className="auth-form-side" style={{ width: "100%" }}>
        <div className="auth-card">
          <h2>문제가 발생했습니다</h2>
          <div className="sub">
            화면을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
            <br />
            계속되면 통합관리자에게 문의해 주세요.
          </div>
          <button className="btn btn-primary" onClick={() => reset()} style={{ marginBottom: 10 }}>
            다시 시도
          </button>
          <a className="btn btn-ghost" href="/dashboard" style={{ width: "100%" }}>
            대시보드로 이동
          </a>
        </div>
      </div>
    </div>
  );
}
