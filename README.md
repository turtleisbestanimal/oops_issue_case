# OoPs 사례 관리 — 서버 자동 저장

기존 배포 사이트 https://oopsissuecase.vercel.app/ 의 124건을 기준으로 구현했습니다. 2026-10-27 확인 당시 배포 HTML과 저장소 main의 데이터는 동일했습니다. 본문 7개 요소, 확인 상태, 상태 유형 관리, 휴지통, 복원, 영구 삭제, JSON 백업/복구를 유지합니다.

## 바뀐 사용법

- 방문자는 사례를 읽고 검색합니다.
- 관리자는 상단 **관리자 로그인** 후 수정합니다. 본문은 입력 후 약 0.35초에 저장 요청합니다. 상태 변경과 휴지통 작업은 즉시 저장 요청합니다.
- **서버 저장 완료**를 확인하면 다른 기기에서도 다시 접속하거나 **최신 내용 불러오기**로 확인할 수 있습니다. 다른 기기의 열린 화면에 실시간으로 자동 반영하는 기능은 아닙니다.
- 동시에 다른 기기가 수정했다면 덮어쓰기를 차단합니다. 미저장 내용을 JSON 백업하고 최신 내용을 불러와 반영하세요.
- 네트워크 오류 시 편집을 잠그고 **저장 재시도**를 제공합니다. 실패한 변경은 메모리에 남습니다. 브라우저를 닫기 전에 JSON 백업을 보관하세요.
- 과거 브라우저의 로컬 수정은 자동 업로드하지 않습니다. 같은 기기에서 **이전 브라우저 수정 백업**으로 내려받아 관리자 로그인 후 JSON으로 불러오세요.

## 처음 한 번 필요한 설정

### 1. Supabase 프로젝트 만들기

https://supabase.com/dashboard 에서 프로젝트를 생성합니다. 이 작업의 계정 로그인과 프로젝트 생성은 사용자가 해야 합니다. 아래 코드에는 서비스 비밀 키나 관리자의 비밀번호를 넣지 않습니다.

### 2. 데이터베이스 만들기와 사례 이전

Supabase의 **SQL Editor → New query**에서 순서대로 실행합니다.

1. `supabase/schema.sql` 전체 내용을 복사해서 실행합니다.
2. `supabase/seed.sql` 전체 내용을 복사해서 실행합니다. 기존 124건을 처음 한 번 넣습니다. 다시 실행해도 서버 수정본을 덮어쓰지 않습니다.

### 3. 관리자 계정 지정

Supabase **Authentication → Users → Add user**에서 이메일/비밀번호 계정을 생성합니다. 이메일 확인이 완료된 사용자로 생성하고, 공개 회원가입은 필요하지 않으므로 비활성화하세요.

이후 SQL Editor에서 실제 관리자 이메일로 아래 구문을 실행합니다.

```sql
insert into public.oops_admins(user_id)
select id from auth.users where email = '여기에_관리자_이메일'
on conflict do nothing;

-- 등록 결과: 1건이어야 합니다.
select u.email from public.oops_admins a join auth.users u on a.user_id = u.id;
```

### 4. Vercel 연결 설정

Supabase 프로젝트의 **Connect/API Keys**에서 프로젝트 URL과 **Publishable key**를 확인합니다. 기존 프로젝트는 role이 anon인 공개 legacy anon key도 지원합니다.

Vercel에서 해당 프로젝트 **Settings → Environment Variables**에 두 값을 추가합니다.

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | `https://프로젝트ID.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` 공개 키 |

**service_role / sb_secret 키는 사용하지 마세요.** 빌드가 비밀 키 사용을 거부합니다. Publishable key는 브라우저에서 사용하도록 설계된 공개 키이며, 쓰기 권한은 DB 함수와 관리자 명단에서 통제합니다.

Production과 Preview에 필요한 환경을 선택합니다. Vercel의 수동 Build/Output override가 기존 빈 빌드를 고정하고 있다면 해제하세요. 저장소의 `vercel.json`은 Install `npm ci`, Build `npm run build`, Output `dist`로 설정합니다.

### 5. 배포 및 확인

설정 후 변경 브랜치를 main에 반영하거나 PR을 병합해 배포합니다. 환경 변수만 변경했다면 **Redeploy**하세요.

1. 비로그인 상태에서 사례가 보이고 편집 버튼이 비활성화되어야 합니다.
2. 관리자 로그인 후 사례를 수정하고 **서버 저장 완료**를 확인합니다.
3. 다른 브라우저에서 접속해 변경을 확인합니다.
4. 상태 변경·휴지통·복원을 확인합니다.

연결 설정이 없거나 서버를 읽지 못하면 배포 파일의 사례를 **읽기 전용**으로 표시합니다. 설정이 완료되기 전에는 자동 저장이 작동하지 않습니다.

## 데이터와 권한

- Supabase PostgreSQL의 `oops_workspace` 한 행에 현재 사례 상태를 JSONB로 저장합니다. 124건 규모에서 상태 유형 이동과 사례 변경을 하나의 트랜잭션으로 처리합니다. 행의 revision을 검사하므로 동시 수정이 조용히 덮어써지지 않습니다.
- 사례의 제목·원래 ID·출처·날짜 등 기존 비편집 메타데이터는 배포 HTML에 유지됩니다. 편집 대상인 7개 요소·상태·변경 기록·휴지통 상태는 DB를 우선합니다.
- 공개 읽기 RLS 정책, 관리자 명단, 보안 함수로 쓰기를 제한합니다. 로그인한 일반 사용자에게도 수정 권한이 없습니다. 테이블에 직접 쓰는 요청은 허용하지 않습니다.
- 영구 삭제는 현재 DB 본문/변경 기록에서 제거하고 재등장 방지를 위한 ID·시각만 남깁니다. 원래 GitHub HTML, Git 이력, 이전 백업에서 자료까지 지우는 기능은 아닙니다. 초기 124건이 포함된 HTML은 네트워크 장애 시 읽기용이므로 원본 저장소까지 제거해야 할 자료는 별도 정리가 필요합니다.
- JSON은 복원용 전체 백업입니다. HTML 백업은 스크립트와 서버 연결을 제거한 읽기 전용 보관본입니다.
- 과거 사례 맥락지도 생성 작업은 수행하지 않았습니다.

## 개발·검증

Node.js 22 이상을 사용합니다.

```sh
npm ci
npm run build
python3 -m http.server 8088 --directory dist
```

환경 변수 미설정 상태는 읽기 전용입니다. `.env`는 자동 로드되지 않으므로 로컬 빌드에서는 셸 환경 변수를 설정합니다. Vercel에서는 대시보드의 환경 변수를 사용합니다.

```sh
npm test
npx playwright install chromium
npx playwright test
```

- PostgreSQL 호환 PGlite에서 실제 SQL을 실행해 익명/일반 사용자 차단, 관리자 저장, revision 충돌, 형식 검사, 휴지통 후 삭제, 영구 삭제 복원 차단, 초기 데이터 재실행 보존을 검사합니다.
- Chromium에서 읽기 전용/관리자 편집/상태 변경/휴지통/복원/영구 삭제/다른 창에서 조회/충돌 후 백업을 검사합니다. 브라우저의 Supabase 응답은 테스트 대역을 사용합니다.
- 실제 사용자 Supabase 프로젝트와 배포 환경 연결은 위 설정 후 확인해야 합니다.

공식 문서: https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/docs/reference/javascript/auth-signinwithpassword
