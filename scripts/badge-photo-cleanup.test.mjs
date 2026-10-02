import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const dataUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const { cleanupBadgePhotos } = await import(dataUrl(stripTypeScriptTypes(readFileSync(new URL('../src/lib/server/badgePhotoCleanup.ts',import.meta.url),'utf8'))));

await test('Storage 실패/예외/완료 기록 실패는 성공으로 처리하지 않는다', async () => {
	for (const failure of ['claim', 'remove', 'throw', 'complete']) {
		const calls=[];
		const client={
			rpc:async name => {
				calls.push(name);
				if (name==='admin_badge_photo_claim') return {data:[{path:'fake/photo.jpg',lease:'fake-lease'}],error:failure==='claim'?{}:null};
				return {data:null,error:failure==='complete'?{}:null};
			},
			storage:{from:()=>({remove:async()=> {
				if(failure==='throw') throw new Error('mock outage');
				return {data:[],error:failure==='remove'?{}:null};
			}})}
		};
		await assert.rejects(cleanupBadgePhotos(client));
		assert.equal(calls.includes('admin_badge_photo_complete'),failure==='complete');
	}
});

await test('여러 삭제 묶음 중 실패한 묶음은 완료 기록을 남기지 않는다', async () => {
	const calls=[], removed=[];
	const client={
		rpc:async(name,args)=> {
			if(name==='admin_badge_photo_claim') return {data:Array.from({length:25},(_,i)=>({path:'fake/'+i,lease:'fake-lease'})),error:null};
			calls.push(args);
			return {data:null,error:null};
		},
		storage:{from:()=>({remove:async paths=> {
			removed.push(paths);
			return {data:[],error:removed.length===2?{}:null};
		}})}
	};
	await assert.rejects(cleanupBadgePhotos(client));
	assert.deepEqual(removed.map(p=>p.length),[20,5]);
	assert.equal(calls.length,1);
	assert.deepEqual(calls[0],{p_paths:removed[0],p_lease:'fake-lease'});
});

await test('예약 작업은 기존 fetch를 유지하고 서버 키로 정리하며 다른 프로젝트를 거절한다', async () => {
	const calls=[];
	globalThis.workerFixture={
		fetch:()=>new Response('app'),
		createClient:(url,key,options)=>{calls.push({url,key,options});return {};},
		cleanup:async()=>{calls.push('cleanup');}
	};
	try {
		const appUrl=dataUrl('export default {fetch:(...args)=>globalThis.workerFixture.fetch(...args)};');
		const clientUrl=dataUrl('export const createClient=(...args)=>globalThis.workerFixture.createClient(...args);');
		const cleanupUrl=dataUrl('export const cleanupBadgePhotos=(...args)=>globalThis.workerFixture.cleanup(...args);');
		const source=readFileSync(new URL('./cloudflare-worker.mjs',import.meta.url),'utf8')
			.replace("'../.svelte-kit/cloudflare-tmp/app-worker.js'",JSON.stringify(appUrl))
			.replace("'@supabase/supabase-js'",JSON.stringify(clientUrl))
			.replace("'../src/lib/server/badgePhotoCleanup.ts'",JSON.stringify(cleanupUrl));
		const {default:worker}=await import(dataUrl(source));
		assert.equal(await worker.fetch().text(),'app');
		let pending;
		const ctx={waitUntil:p=>{pending=p;}};
		const env={SUPABASE_URL:'https://fake.supabase.co',PUBLIC_SUPABASE_URL:'https://fake.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock-key'};
		worker.scheduled({},env,ctx);
		await pending;
		assert.equal(calls[0].url,env.SUPABASE_URL);
		assert.equal(calls[0].key,'mock-key');
		assert.equal(calls[0].options.auth.persistSession,false);
		assert.equal(calls[1],'cleanup');
		worker.scheduled({},{},ctx);
		await assert.rejects(pending,/설정 누락/);
		worker.scheduled({},{...env,PUBLIC_SUPABASE_URL:'https://other.supabase.co'},ctx);
		await assert.rejects(pending,/프로젝트 불일치/);
		assert.equal(calls.length,2);
	} finally { delete globalThis.workerFixture; }
});
