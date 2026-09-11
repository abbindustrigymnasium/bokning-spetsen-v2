export function parseDate(value: unknown) {
	if (typeof value !== 'string') return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function stockholmDayIndex(value: Date) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Stockholm',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(value);
	const result = Object.fromEntries(parts.map(({ type, value: part }) => [type, Number(part)]));
	return new Date(Date.UTC(result.year, result.month - 1, result.day));
}
