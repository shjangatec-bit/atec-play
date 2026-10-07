export default function NotFound() {
  return (
    <div className="auth-shell">
      <div className="auth-form-side" style={{ width: "100%" }}>
        <div className="auth-card">
          <h2>페이지를 찾을 수 없습니다</h2>
          <div className="sub">주소가 잘못되었거나 삭제된 페이지입니다.</div>
          <a className="btn btn-ghost" href="/dashboard" style={{ width: "100%" }}>
            대시보드로 이동
          </a>
        </div>
      </div>
    </div>
  );
}
