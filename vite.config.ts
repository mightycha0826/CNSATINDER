import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// adapter-cloudflare 고정 — 운영자 대시보드(/admin)가 서버 라우트를 쓰므로
// adapter-static 분기를 두지 않는다. 학생 앱 화면은 루트 +layout.ts 에서 ssr=false.
export default defineConfig(({ command }) => ({
	plugins: [
		sveltekit({
			compilerOptions: {
				// 프로젝트 코드는 전부 runes 모드. 라이브러리(node_modules)는 예외.
				runes: ({ filename }) => (filename.includes('node_modules') ? undefined : true)
			},
			adapter: cloudflareAdapter(),
			/**
			 * 콘텐츠 보안 정책 — 페이지가 불러오고 연결할 수 있는 곳을 우리 사이트와 Supabase 로만 묶는다.
			 * 스크립트는 SvelteKit 이 붙이는 nonce 로만 (외부 스크립트·주입된 인라인 스크립트는 실행 안 됨),
			 * 다른 사이트가 이 앱을 틀(iframe) 안에 띄우는 것도 막는다.
			 * ★ Supabase 를 *.supabase.co 가 아닌 주소(사용자 도메인)로 옮기면 connect-src 에 추가할 것.
			 * 개발 서버에서만 localhost(테스트용 가짜 Supabase)를 더 연다.
			 */
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte 전환 효과·편지 편집기(Tiptap)가 인라인 스타일을 쓴다
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': [
						'self',
						'https://*.supabase.co',
						'wss://*.supabase.co',
						...(command === 'serve' ? (['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*'] as const) : [])
					],
					'worker-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
}));
