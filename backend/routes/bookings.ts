import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { isAdmin, type Authorization } from '../auth/authorization.js';
import { parseDate, stockholmDayIndex } from '../lib/dates.js';

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

type BookingsRouteOptions = {
	prisma: PrismaClient;
	authorization: Authorization;
};

export async function bookingsRoutes(
	app: FastifyInstance,
	{ prisma, authorization }: BookingsRouteOptions
) {
	app.get<{ Querystring: { siteId?: string; from?: string; to?: string } }>(
		'/api/bookings',
		{ preHandler: authorization.requireStudent },
		async (request, reply) => {
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
		{ preHandler: authorization.requireStudent },
		async (request, reply) => {
			const startsAt = parseDate(request.body?.startsAt);
			const endsAt = parseDate(request.body?.endsAt);
			if (!request.body?.siteId || !startsAt || !endsAt || startsAt >= endsAt)
				return reply.code(400).send({
					error: 'siteId, startsAt, and endsAt are required; startsAt must be before endsAt'
				});
			const site = await prisma.site.findUnique({ where: { id: request.body.siteId } });
			if (!site) return reply.code(404).send({ error: 'Site not found' });
			if (!site.active) return reply.code(409).send({ error: 'Site is inactive' });
			try {
				return reply.code(201).send(
					await prisma.booking.create({
						data: {
							userId: request.user!.id,
							siteId: site.id,
							dayIndex: stockholmDayIndex(startsAt),
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
	}>('/api/bookings/:id', { preHandler: authorization.requireStudent }, async (request, reply) => {
		const existing = await prisma.booking.findUnique({ where: { id: request.params.id } });
		if (!existing) return reply.code(404).send({ error: 'Booking not found' });
		if (existing.userId !== request.user!.id && !isAdmin(request.user!))
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
				data: { siteId, startsAt, endsAt, dayIndex: stockholmDayIndex(startsAt) },
				select: bookingSelect
			});
		} catch (error) {
			if ((error as { code?: string }).code === 'P2004')
				return reply.code(409).send({ error: 'Booking conflicts with an existing booking' });
			throw error;
		}
	});

	app.delete<{ Params: { id: string } }>(
		'/api/bookings/:id',
		{ preHandler: authorization.requireStudent },
		async (request, reply) => {
			const booking = await prisma.booking.findUnique({ where: { id: request.params.id } });
			if (!booking) return reply.code(404).send({ error: 'Booking not found' });
			if (booking.userId !== request.user!.id && !isAdmin(request.user!))
				return reply.code(403).send({ error: 'You cannot delete this booking' });
			await prisma.booking.delete({ where: { id: booking.id } });
			return { ok: true };
		}
	);
}
