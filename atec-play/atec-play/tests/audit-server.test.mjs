import { test } from "node:test";
import assert from "node:assert/strict";
import { writeAudit } from "../lib/audit-server.js";

const quiet = async (fn) => { const o = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = o; } };

test("기록 호출: DB 함수 이름·인자 이름이 SQL 과 일치, 출처는 api", async () => {
  let call;
  const client = { rpc: async (name, args) => { call = { name, args }; return { error: null }; } };
  const r = await writeAudit(client, { actor: "u1", action: "user.password_reset", targetType: "user", targetId: 7, targetLabel: "홍길동", detail: { a: 1 } });
  assert.equal(r, true);
  assert.equal(call.name, "audit_write");
  assert.deepEqual(Object.keys(call.args).sort(), ["p_action", "p_actor", "p_detail", "p_source", "p_target_id", "p_target_label", "p_target_type"]);
  assert.equal(call.args.p_source, "api");
  assert.equal(call.args.p_target_id, "7");
});

test("기록이 실패(오류 반환·예외)해도 던지지 않고 false", async () => {
  const bad = { rpc: async () => ({ error: { code: "42883", message: "no function" } }) };
  const boom = { rpc: async () => { throw new Error("network"); } };
  assert.equal(await quiet(() => writeAudit(bad, { actor: "u", action: "x" })), false);
  assert.equal(await quiet(() => writeAudit(boom, { actor: "u", action: "x" })), false);
});
