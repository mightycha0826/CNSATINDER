type ReadResult<T> = { data: T; error: unknown };

/** 새 열부터 단계적으로 빼며 읽는다. 선택 열은 도입된 순서대로 묶어 둔다. */
export async function readWithFallback<T>(
	read: (columns: string) => PromiseLike<ReadResult<T>>,
	base: string,
	optional: readonly string[]
): Promise<ReadResult<T>> {
	let count = optional.length;
	let result = await read([base, ...optional].join(', '));
	while (result.error && count > 0) {
		result = await read([base, ...optional.slice(0, --count)].join(', '));
	}
	return result;
}
