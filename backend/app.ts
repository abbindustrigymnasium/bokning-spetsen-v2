import cors from '@fastify/cors';
import Fastify, { type FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticatedUser, isAdmin, registerAuth } from './auth.js';

const bookingSelect = {
	id: true,
	userId: true,
	siteId: true,
	dayIndex: true,
	startsAt: true,
	endsAt: true,
	createdAt: true,
	updatedAt: true,
	user: { select: { id: true, name: true, email: true } },
	site: { select: { id: true, name: true, active: true } }
} as const;

function parseDate(value: unknown) {
	if (typeof value !== 'string') return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function dayIndex(value: Date) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Stockholm',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(value);
	const result = Object.fromEntries(parts.map(({ type, value: part }) => [type, Number(part)]));
	return new Date(Date.UTC(result.year, result.month - 1, result.day));
}

async function requireUser(
	request: Parameters<typeof authenticatedUser>[0],
	prisma: PrismaClient,
	reply: FastifyReply
) {
	const user = await authenticatedUser(request, prisma);
	if (!user) {
		reply.code(401).send({ error: 'Authentication required' });
		return undefined;
	}
	return user;
}

export function buildApp() {
	const app = Fastify({ logger: true });
	const prisma = new PrismaClient();

	app.register(cors, {
		origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
		credentials: true
	});

	app.get('/api/health', async () => ({ status: 'ok' }));
	registerAuth(app, prisma);

	app.get('/api/users', async () => prisma.user.findMany({ orderBy: { createdAt: 'desc' } }));

	app.post<{ Body: { email: string; name?: string } }>('/api/users', async (request, reply) => {
		const { email, name } = request.body;

		if (!email || !email.includes('@')) {
			return reply.code(400).send({ error: 'A valid email is required' });
		}

		return reply.code(201).send(await prisma.user.create({ data: { email, name } }));
	});

	app.get('/api/sites', async (request, reply) => {
		const user = await requireUser(request, prisma, reply);
		if (!user) return;
		return prisma.site.findMany({
			where: isAdmin(user) ? undefined : { active: true },
			orderBy: { name: 'asc' }
		});
	});

	app.post<{ Body: { name?: string } }>('/api/sites', async (request, reply) => {
		const user = await requireUser(request, prisma, reply);
		if (!user) return;
		if (!isAdmin(user)) return reply.code(403).send({ error: 'Administrator permission required' });
		const name = request.body?.name?.trim();
		if (!name) return reply.code(400).send({ error: 'A site name is required' });
		try {
			return reply.code(201).send(await prisma.site.create({ data: { name } }));
		} catch (error) {
			if ((error as { code?: string }).code === 'P2002')
				return reply.code(409).send({ error: 'A site with that name already exists' });
			throw error;
		}
	});

	app.patch<{ Params: { id: string }; Body: { name?: string; active?: boolean } }>(
		'/api/sites/:id',
		async (request, reply) => {
			const user = await requireUser(request, prisma, reply);
			if (!user) return;
			if (!isAdmin(user))
				return reply.code(403).send({ error: 'Administrator permission required' });
			const data: { name?: string; active?: boolean } = {};
			if (request.body.name !== undefined) {
				data.name = request.body.name.trim();
				if (!data.name) return reply.code(400).send({ error: 'A site name is required' });
			}
			if (request.body.active !== undefined) data.active = request.body.active;
			try {
				return await prisma.site.update({ where: { id: request.params.id }, data });
			} catch (error) {
				const code = (error as { code?: string }).code;
				if (code === 'P2025') return reply.code(404).send({ error: 'Site not found' });
				if (code === 'P2002')
					return reply.code(409).send({ error: 'A site with that name already exists' });
				throw error;
			}
		}
	);

	app.delete<{ Params: { id: string } }>('/api/sites/:id', async (request, reply) => {
		const user = await requireUser(request, prisma, reply);
		if (!user) return;
		if (!isAdmin(user)) return reply.code(403).send({ error: 'Administrator permission required' });
		try {
			await prisma.site.delete({ where: { id: request.params.id } });
			return { ok: true };
		} catch (error) {
			const code = (error as { code?: string }).code;
			if (code === 'P2025') return reply.code(404).send({ error: 'Site not found' });
			if (code === 'P2003')
				return reply.code(409).send({ error: 'Cannot delete a site with bookings' });
			throw error;
		}
	});

	app.get<{ Querystring: { siteId?: string; from?: string; to?: string } }>(
		'/api/bookings',
		async (request, reply) => {
			const user = await requireUser(request, prisma, reply);
			if (!user) return;
			const from = request.query.from ? parseDate(request.query.from) : undefined;
			const to = request.query.to ? parseDate(request.query.to) : undefined;
			if ((request.query.from && !from) || (request.query.to && !to))
				return reply.code(400).send({ error: 'from and to must be valid dates' });
			return prisma.booking.findMany({
				where: {
					siteId: request.query.siteId,
					startsAt:
						from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined
				},
				select: bookingSelect,
				orderBy: { startsAt: 'asc' }
			});
		}
	);

	app.post<{ Body: { siteId?: string; startsAt?: string; endsAt?: string } }>(
		'/api/bookings',
		async (request, reply) => {
			const user = await requireUser(request, prisma, reply);
			if (!user) return;
			const startsAt = parseDate(request.body?.startsAt);
			const endsAt = parseDate(request.body?.endsAt);
			if (!request.body?.siteId || !startsAt || !endsAt || startsAt >= endsAt)
				return reply
					.code(400)
					.send({
						error: 'siteId, startsAt, and endsAt are required; startsAt must be before endsAt'
					});
			const site = await prisma.site.findUnique({ where: { id: request.body.siteId } });
			if (!site) return reply.code(404).send({ error: 'Site not found' });
			if (!site.active) return reply.code(409).send({ error: 'Site is inactive' });
			try {
				return reply.code(201).send(
					await prisma.booking.create({
						data: {
							userId: user.id,
							siteId: site.id,
							dayIndex: dayIndex(startsAt),
							startsAt,
							endsAt
						},
						select: bookingSelect
					})
				);
			} catch (error) {
				if ((error as { code?: string }).code === 'P2004')
					return reply.code(409).send({ error: 'Booking conflicts with an existing booking' });
				throw error;
			}
		}
	);

	app.patch<{
		Params: { id: string };
		Body: { siteId?: string; startsAt?: string; endsAt?: string };
	}>('/api/bookings/:id', async (request, reply) => {
		const user = await requireUser(request, prisma, reply);
		if (!user) return;
		const existing = await prisma.booking.findUnique({ where: { id: request.params.id } });
		if (!existing) return reply.code(404).send({ error: 'Booking not found' });
		if (existing.userId !== user.id && !isAdmin(user))
			return reply.code(403).send({ error: 'You cannot modify this booking' });
		const startsAt = request.body.startsAt ? parseDate(request.body.startsAt) : existing.startsAt;
		const endsAt = request.body.endsAt ? parseDate(request.body.endsAt) : existing.endsAt;
		const siteId = request.body.siteId ?? existing.siteId;
		if (!startsAt || !endsAt || startsAt >= endsAt)
			return reply.code(400).send({ error: 'Invalid booking time range' });
		const site = await prisma.site.findUnique({ where: { id: siteId } });
		if (!site) return reply.code(404).send({ error: 'Site not found' });
		if (!site.active && siteId !== existing.siteId)
			return reply.code(409).send({ error: 'Site is inactive' });
		try {
			return await prisma.booking.update({
				where: { id: existing.id },
				data: { siteId, startsAt, endsAt, dayIndex: dayIndex(startsAt) },
				select: bookingSelect
			});
		} catch (error) {
			if ((error as { code?: string }).code === 'P2004')
				return reply.code(409).send({ error: 'Booking conflicts with an existing booking' });
			throw error;
		}
	});

	app.delete<{ Params: { id: string } }>('/api/bookings/:id', async (request, reply) => {
		const user = await requireUser(request, prisma, reply);
		if (!user) return;
		const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
		if (!booking) return reply.code(404).send({ error: 'Booking not found' });
		if (booking.userId !== user.id && !isAdmin(user))
			return reply.code(403).send({ error: 'You cannot delete this booking' });
		await prisma.booking.delete({ where: { id: booking.id } });
		return { ok: true };
	});

	app.addHook('onClose', async () => prisma.$disconnect());

	return app;
}
