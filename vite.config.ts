import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// adapter-cloudflare 고정 — 운영자 대시보드(/admin)가 서버 라우트를 쓰므로
// adapter-static 분기를 두지 않는다. 학생 앱 화면은 루트 +layout.ts 에서 ssr=false.
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// 프로젝트 코드는 전부 runes 모드. 라이브러리(node_modules)는 예외.
				runes: ({ filename }) => (filename.includes('node_modules') ? undefined : true)
			},
			adapter: cloudflareAdapter()
		})
	]
});
