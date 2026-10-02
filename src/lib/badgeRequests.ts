import { rpc } from './rpc';
import { supabase } from './supabase';

/**
 * 뱃지 제출 (Phase 84) — CNSA 뱃지를 운영진에게 보낸다. 서버: supabase/schema.sql Phase 84 (private.badge_requests).
 *   proof — 앱에 있는 CNSA 뱃지 인증 (뱃지와 학번 · 이름이 함께 보이는 사진)
 *   club  — 동아리 기장이 동아리 뱃지를 부원까지 한 번에 (기장 인증 사진 + 부원 학번)
 *   new   — 앱에 없는 뱃지 추가 요청 (뱃지 사진 · 이름 · 설명)
 * 사진은 이 기기에서 줄여(긴 변 1600 · JPEG) Storage 비공개 버킷 badge-proofs/{내 id}/ 에 올리고, 그 경로로 요청을 남긴다.
 * 학번 · 이름이 보이는 사진이라 관리자만 보고, 결정하면 지운다. 요청이 안 되면 올린 사진을 바로 지운다.
 */
export type RequestKind = 'proof' | 'club' | 'new';
type RequestStatus = 'pending' | 'approved' | 'rejected' | 'canceled';
export type MyBadgeRequest = {
	id: number;
	kind: RequestKind;
	code: string | null;
	title: string | null;
	members: number;
	status: RequestStatus;
	staff_note: string | null;
	created_at: string;
	decided_at: string | null;
};
type SubmitStatus = 'ok' | 'bad_input' | 'not_club' | 'already' | 'too_many' | 'rate' | 'restricted';

export const BUCKET = 'badge-proofs';
export const MAX_PHOTOS = 3;
const MAX_SIDE = 1600;

export const KIND_LABEL: Record<RequestKind, string> = { proof: '내 뱃지 인증', club: '동아리 기장 제출', new: '새 뱃지 요청' };
export const STATUS_LABEL: Record<RequestStatus, string> = { pending: '확인 중', approved: '승인', rejected: '반려', canceled: '거둠' };
export const SUBMIT_ERROR: Record<Exclude<SubmitStatus, 'ok'>, string> = {
	bad_input: '빠진 내용이 있어요 — 뱃지 · 사진 · 이름을 확인해 주세요',
	not_club: '동아리 뱃지는 기장이 "동아리 기장 제출"로 보내요',
	already: '이미 가진 뱃지예요',
	too_many: '확인을 기다리는 요청이 3개예요 · 결과가 나오면 다시 보내 주세요',
	rate: '오늘은 요청을 더 보낼 수 없어요 · 내일 다시 보내 주세요',
	restricted: '이용이 제한된 계정은 요청을 보낼 수 없어요'
};

/** 사진 줄이기 — 긴 변 1600 · JPEG. 못 읽는 형식이면 원본(사진 형식 · 5MB 아래일 때만) */
export async function shrink(file: File): Promise<Blob> {
	try {
		const bmp = await createImageBitmap(file);
		const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
		const w = Math.max(1, Math.round(bmp.width * k));
		const h = Math.max(1, Math.round(bmp.height * k));
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
		bmp.close?.();
		const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
		if (blob) return blob;
	} catch {
		/* 아래로 */
	}
	if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 5 * 1024 * 1024) return file;
	throw new Error('이 사진은 올릴 수 없어요 · 다른 사진을 골라 주세요');
}

const extOf = (b: Blob) => (b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : 'jpg');
const rid = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);

/** 내 폴더에 올리고 경로를 돌려준다 */
async function upload(uid: string, blobs: Blob[]): Promise<string[]> {
	const done: string[] = [];
	try {
		for (const b of blobs) {
			const path = `${uid}/${rid()}.${extOf(b)}`;
			const { error } = await supabase.storage.from(BUCKET).upload(path, b, { contentType: b.type || 'image/jpeg', upsert: false });
			if (error) throw error;
			done.push(path);
		}
		return done;
	} catch (e) {
		await removePhotos(done);
		throw e;
	}
}

/** 즉시 삭제를 시도한다. 실패한 경로는 DB 원장에 남아 예약 작업이 재시도한다. */
async function removePhotos(paths: string[]) {
	if (!paths.length) return;
	try {
		const { error } = await supabase.storage.from(BUCKET).remove(paths);
		if (error) console.warn('사진 삭제를 예약 작업에서 다시 시도합니다.');
	} catch {
		console.warn('사진 삭제를 예약 작업에서 다시 시도합니다.');
	}
}

type SubmitInput = { kind: RequestKind; code: string | null; title: string | null; note: string; nos: number[]; photos: Blob[] };

/** 제출 — 사진을 올리고 요청을 남긴다. ok 가 아니면 올린 사진을 지운다 */
export async function submitBadgeRequest(uid: string, v: SubmitInput): Promise<SubmitStatus> {
	const paths = await upload(uid, v.photos);
	try {
		const r = await rpc<{ status: SubmitStatus }>('badge_request_submit', {
			p_kind: v.kind,
			p_code: v.code,
			p_title: v.title,
			p_note: v.note,
			p_nos: v.nos,
			p_photos: paths
		});
		if (r.status !== 'ok') await removePhotos(paths);
		return r.status;
	} catch (e) {
		await removePhotos(paths);
		throw e;
	}
}

export const myBadgeRequests = () => rpc<MyBadgeRequest[]>('my_badge_requests');

/** 요청을 거둔다. 사진 삭제는 DB에 함께 예약되며 즉시 삭제 실패 시 재시도된다. */
export async function cancelBadgeRequest(id: number): Promise<boolean> {
	const r = await rpc<{ status: 'ok' | 'not_found'; photos?: string[] }>('badge_request_cancel', { p_id: id });
	if (r.status === 'ok') await removePhotos(r.photos ?? []);
	return r.status === 'ok';
}

/** 학번 목록 — 쉼표 · 띄어쓰기 · 줄바꿈 어느 것으로 나눠도 된다 (같은 학번은 한 번) */
export const parseNos = (s: string) => [...new Set((s.match(/\d{4,9}/g) ?? []).map(Number))];
