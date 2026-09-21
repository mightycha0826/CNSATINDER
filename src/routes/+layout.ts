// 학생 앱은 전부 SPA — 모든 데이터를 클라이언트에서 Supabase 로 직접 가져온다.
// /admin 은 서버 라우트가 필요하므로 admin/+layout.ts 에서 ssr 을 다시 켠다.
export const ssr = false;
export const prerender = false;
