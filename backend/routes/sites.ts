import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { isAdmin, type Authorization } from '../auth/authorization.js';

type SitesRouteOptions = {
	prisma: PrismaClient;
	authorization: Authorization;
};

export async function sitesRoutes(
	app: FastifyInstance,
	{ prisma, authorization }: SitesRouteOptions
) {
	app.get('/api/sites', { preHandler: authorization.requireStudent }, async (request) =>
		prisma.site.findMany({
			where: isAdmin(request.user!) ? undefined : { active: true },
			orderBy: { name: 'asc' }
		})
	);

	app.post<{ Body: { name?: string } }>(
		'/api/sites',
		{ preHandler: authorization.requireAdmin },
		async (request, reply) => {
			const name = request.body?.name?.trim();
			if (!name) return reply.code(400).send({ error: 'A site name is required' });
			try {
				return reply.code(201).send(await prisma.site.create({ data: { name } }));
			} catch (error) {
				if ((error as { code?: string }).code === 'P2002')
					return reply.code(409).send({ error: 'A site with that name already exists' });
				throw error;
			}
		}
	);

	app.patch<{ Params: { id: string }; Body: { name?: string; active?: boolean } }>(
		'/api/sites/:id',
		{ preHandler: authorization.requireAdmin },
		async (request, reply) => {
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

	app.delete<{ Params: { id: string } }>(
		'/api/sites/:id',
		{ preHandler: authorization.requireAdmin },
		async (request, reply) => {
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
		}
	);
}
