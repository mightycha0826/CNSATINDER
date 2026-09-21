import type { MsgRow, ReportReason, RoomRow, RoomSnap, SendResult, VoteResult, VoteRow } from './types';

export type TransportHandlers = {
	onMessage(row: MsgRow): void;
	onRoom(row: RoomRow): void;
	onVote(row: VoteRow): void;
	onTyping(seat: number): void;
	onPresence(seats: number[]): void;
	/** 구독이 (재)성립했다. ★ 재연결마다 다시 호출된다 — 여기서 갭을 메운다. */
	onSubscribed(): void;
	/** 연결이 끊겼다. 재연결은 호출자가 결정한다. */
	onDown(reason: string): void;
};

/**
 * 실시간 전송 계층.
 *
 * 지금은 SupabaseTransport(postgres_changes) 하나지만, 동시 수백 명을 넘기면
 * Phase 7 에서 DurableObjectTransport 로 교체한다. ChatRoom 과 화면은 이 인터페이스만 알므로
 * 교체해도 한 줄도 바뀌지 않는다.
 */
export interface ChatTransport {
	connect(roomId: string, seat: 1 | 2, h: TransportHandlers): void;
	disconnect(): void;
	send(roomId: string, seat: 1 | 2, body: string, clientMsgId: string): Promise<SendResult>;
	/** id > afterId 인 메시지를 오름차순으로 전부 */
	fetchAfter(roomId: string, afterId: number): Promise<MsgRow[]>;
	/** 가장 최근 n 개 (커밋 순서 역전 보정용) */
	fetchRecent(roomId: string, n: number): Promise<MsgRow[]>;
	snapshot(roomId: string): Promise<RoomSnap>;
	/** 입장 확인 — 양쪽이 모두 부르면 pending → active, 10분 타이머 시작 */
	ack(roomId: string): Promise<RoomSnap>;
	/** 만료됐으면 닫고, 언제나 최신 스냅샷을 돌려준다 (서버 시계 기준 판정) */
	closeIfExpired(roomId: string): Promise<RoomSnap>;
	vote(roomId: string, agree: boolean): Promise<{ result: VoteResult; snap: RoomSnap }>;
	leave(roomId: string, skip: boolean): Promise<RoomSnap>;
	/** 신고 — 대화 사본 저장 + 자동 차단 + 방 종료. 닫힌 방에서도 동작한다. */
	report(roomId: string, reason: ReportReason, note: string): Promise<{ status: 'ok' | 'already'; snap: RoomSnap }>;
	block(roomId: string): Promise<RoomSnap>;
	markRead(roomId: string, lastId: number): Promise<void>;
	typing(seat: 1 | 2): void;
}
