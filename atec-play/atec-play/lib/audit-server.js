// 서버 API 에서 작업 기록을 남깁니다. (서비스 키 클라이언트 전용 — DB 의 audit_write 는 서비스 키로만 호출 가능)
// 기록에 실패해도 원래 작업(비밀번호 초기화·백업)은 막지 않고 서버 로그에만 남깁니다.
export async function writeAudit(adminClient, { actor, action, targetType = null, targetId = null, targetLabel = null, detail = {} }) {
  try {
    const { error } = await adminClient.rpc("audit_write", {
      p_actor: actor,
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId == null ? null : String(targetId),
      p_target_label: targetLabel,
      p_detail: detail,
      p_source: "api",
    });
    if (error) console.error("[작업 기록 실패]", action, error.code, error.message);
    return !error;
  } catch (e) {
    console.error("[작업 기록 실패]", action, e?.message);
    return false;
  }
}
