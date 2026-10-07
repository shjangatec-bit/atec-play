# Supabase 보안(RLS) 적용 가이드

현재 DB 는 RLS 가 모든 표에서 켜져 있고 정책이 39개 있습니다. 대부분 적절하지만, 아래 **실제로 악용 가능한 6곳**이 있어
그 부분만 고치는 SQL 을 만들었습니다. (전체 정책을 새로 만드는 방식은 `reference/` 에 보관만 합니다.)

## 발견된 문제 (로컬에서 재현·검증 완료)
| # | 정책 | 문제 | 수정 |
|---|---|---|---|
| 1 | `users_update_self` | 본인이 `status` 를 `approved` 로 바꿔 **스스로 가입 승인** 가능 | 정책 삭제 |
| 2 | `users_insert_self` | `approved` 상태로 가입 가능 | `pending` 만 허용 |
| 3 | `members_insert_self` | 동호회에 스스로 **회장·승인** 상태로 삽입 가능 | `pending` + `회원` 만 허용 |
| 4 | `members_update_self` | 본인 가입 상태·직책 변경 가능 | 트리거로 `탈회 신청` 표시만 허용 |
| 5 | `members_select` / `clubs_select` / `permissions_select` | 대상 역할이 지정되지 않았다면 로그인 없이도 조회 가능 (※ 실제 DB 에서는 이미 로그인 사용자 전용이었을 가능성이 높아 **확인하지 못한 추정**) | 대상을 로그인 사용자로 명시적으로 고정 (`members_select` 는 승인 회원·본인 행만으로도 축소) |
| 6 | `posts_insert` | 일반 글쓰기 권한만으로 **활동보고서(지원금 근거)** 작성 가능 | 보고서 작성 권한 요구 |

## 권한 중복 문제 (권한을 꺼도 회수되지 않던 버그)
`user_permissions` 에 같은 사용자의 같은 권한이 2~3줄씩 쌓여 있었습니다. 중복 방지 규칙이 `club_id` 가 비어 있는(전사·회사 범위)
행을 서로 다른 값으로 취급해, 가입 승인·권한 템플릿 적용 때마다 같은 행이 추가된 것이 원인입니다.
권한 설정 화면의 토글이 중복 행 중 **1개만** 지워서, 권한을 꺼도 나머지 행 때문에 권한이 유지됐습니다.
- 앱 코드: 토글 OFF 시 같은 권한의 중복 행을 모두 삭제하도록 수정 (`PermissionsManager.js`)
- DB: `05` 로 중복 정리 + 같은 행 재삽입 시 건너뛰는 트리거

## 파일
| 파일 | 용도 |
|---|---|
| `01_rls_audit.sql` | 현재 보안 상태 점검 (읽기 전용) |
| `02_fix_existing_policies.sql` | **필수** 수정 (위 6곳) |
| `03_fix_rollback.sql` | 원래 정책으로 되돌리기 (02·04 모두) |
| `04_optional_tighten_and_fix.sql` | **선택**: 지원금 조회 범위 축소, 회장·계정담당 업무가 DB 에서 막혀 있는 문제 해소 |
| `05_dedupe_user_permissions.sql` | **권장**: 같은 권한이 여러 줄로 중복 저장된 것 정리 + 재발 방지 (아래 '권한 중복 문제' 참고) |
| `tests/` | 로컬 PostgreSQL 검증 시나리오 (기존 39개 정책 재현 포함) |
| `reference/` | 참고용 보관본. **적용하지 마세요.** |

## 적용 순서
1. `/api/admin/backup` 으로 전체 백업.
2. (권장) 테스트 프로젝트에서 `02` 를 먼저 실행해 화면 확인.
3. 운영에서 `02_fix_existing_policies.sql` 실행. 이상이 있으면 `03_fix_rollback.sql`.
4. `04` 는 내용을 읽어 본 뒤 필요할 때만 적용.

## 자동 테스트 (선택)
```
createdb rlstest
psql -d rlstest -f supabase/tests/mock_schema.sql
psql -d rlstest -f supabase/tests/existing_policies_mock.sql
psql -d rlstest -f supabase/02_fix_existing_policies.sql
psql -d rlstest -v ex=deny -v optexp=deny -v optrev=allow -f supabase/tests/fix_scenarios.sql
```
04 까지 적용했다면 마지막 줄의 변수를 `-v optexp=allow -v optrev=deny` 로 바꾸세요.
`-v ex=allow` 로 02 적용 전에 실행하면 취약점이 실제로 뚫리는 것을 재현할 수 있습니다.

※ 테스트의 `has_global_perm` 등 도우미 함수는 **실제 DB 의 함수를 모의 구현**한 것입니다. 실제 함수 정의와 다를 수 있으므로
  운영 적용 전 화면 확인(관리자·회장·일반회원·가입대기 계정)은 생략하지 마세요.

## 알려진 한계
- 스토리지(`club-files`) 정책은 확인만 했습니다(버킷은 비공개).
- 승인 회원끼리는 서로의 이메일을 포함한 `users` 행을 조회할 수 있습니다.
- 가입 대기(게스트) 회원은 현재 정책상 게시글 조회가 불가합니다(`posts_select` 가 승인 회원만 허용).
