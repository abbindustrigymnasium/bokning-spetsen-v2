import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const STOCKHOLM_TIME_ZONE = 'Europe/Stockholm';
const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: STOCKHOLM_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});
const stockholmDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: STOCKHOLM_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

type DateParts = { year: number; month: number; day: number };
type DateTimeParts = DateParts & { hour: number; minute: number; second: number };

function parts<T extends Record<string, number>>(formatter: Intl.DateTimeFormat, date: Date): T {
	return Object.fromEntries(
		formatter.formatToParts(date).map(({ type, value }) => [type, Number(value)])
	) as T;
}

function dateFromParts({ year, month, day }: DateParts): Date {
	return new Date(Date.UTC(year, month - 1, day));
}

export function stockholmDate(date: Date): string {
	const { year, month, day } = parts<DateParts>(stockholmDateFormatter, date);
	return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
		.toString()
		.padStart(2, '0')}`;
}

export function currentStockholmWeek(): string[] {
	const now = new Date();
	const current = parts<DateParts>(stockholmDateFormatter, now);
	const currentDate = dateFromParts(current);
	const weekday = currentDate.getUTCDay();
	const monday = new Date(currentDate);
	monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));

	return Array.from({ length: 7 }, (_, index) => {
		const date = new Date(monday);
		date.setUTCDate(date.getUTCDate() + index);
		return date.toISOString().slice(0, 10);
	});
}

export function stockholmDateTime(date: string, time: string): Date {
	const probe = new Date(`${date}T${time}:00.000Z`);
	const local = parts<DateTimeParts>(stockholmDateTimeFormatter, probe);
	const localAsUtc = Date.UTC(
		local.year,
		local.month - 1,
		local.day,
		local.hour,
		local.minute,
		local.second
	);
	const offset = localAsUtc - probe.getTime();

	return new Date(localAsUtc - offset);
}

export function dayIndex(date: string): Date {
	return new Date(`${date}T00:00:00.000Z`);
}

export async function seedAdmin() {
	const adminPermission = await prisma.permission.upsert({
		where: { slug: 'admin' },
		update: { name: 'Administrator' },
		create: { name: 'Administrator', slug: 'admin' }
	});

	return prisma.user.upsert({
		where: { email: 'gustav.pettersson.bjorklund@hitachigymnasiet.se' },
		update: {
			name: 'Gustav Pettersson Björklund',
			permissions: { connect: { id: adminPermission.id } }
		},
		create: {
			email: 'gustav.pettersson.bjorklund@hitachigymnasiet.se',
			name: 'Gustav Pettersson Björklund',
			permissions: { connect: { id: adminPermission.id } }
		}
	});
}

export async function closePrisma() {
	await prisma.$disconnect();
}
