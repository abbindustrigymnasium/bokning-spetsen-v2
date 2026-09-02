import {
	closePrisma,
	currentStockholmWeek,
	dayIndex,
	prisma,
	seedAdmin,
	stockholmDateTime
} from './seed-utils.js';

const sampleUsers = [
	{ email: 'alexandra.lind@example.com', name: 'Alexandra Lind' },
	{ email: 'erik.nilsson@example.com', name: 'Erik Nilsson' }
];

const sampleBookingTimes = [
	{ userIndex: 0, weekDay: 0, start: '09:00', end: '10:30' },
	{ userIndex: 0, weekDay: 2, start: '13:00', end: '14:00' },
	{ userIndex: 1, weekDay: 1, start: '11:00', end: '12:30' },
	{ userIndex: 1, weekDay: 3, start: '15:00', end: '16:00' }
];

try {
	await seedAdmin();

	const users = await Promise.all(
		sampleUsers.map((user) =>
			prisma.user.upsert({
				where: { email: user.email },
				update: { name: user.name },
				create: user
			})
		)
	);

	const week = currentStockholmWeek();
	await Promise.all(
		sampleBookingTimes.map(({ userIndex, weekDay, start, end }) => {
			const date = week[weekDay];
			return prisma.booking.upsert({
				where: {
					id: `00000000-0000-4000-8000-${(userIndex * 10 + weekDay + 1).toString().padStart(12, '0')}`
				},
				update: {
					userId: users[userIndex].id,
					dayIndex: dayIndex(date),
					startsAt: stockholmDateTime(date, start),
					endsAt: stockholmDateTime(date, end)
				},
				create: {
					id: `00000000-0000-4000-8000-${(userIndex * 10 + weekDay + 1).toString().padStart(12, '0')}`,
					userId: users[userIndex].id,
					dayIndex: dayIndex(date),
					startsAt: stockholmDateTime(date, start),
					endsAt: stockholmDateTime(date, end)
				}
			});
		})
	);

	console.log('Development seed completed.');
} finally {
	await closePrisma();
}
