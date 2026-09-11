import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Authorization } from '../auth/authorization.js';

type UsersRouteOptions = {
	prisma: PrismaClient;
	authorization: Authorization;
};

export async function usersRoutes(
	app: FastifyInstance,
	{ prisma, authorization }: UsersRouteOptions
) {
	app.get('/api/users', { preHandler: authorization.requireAdmin }, async () =>
		prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
	);

	app.post<{ Body: { email: string; name?: string } }>(
		'/api/users',
		{ preHandler: authorization.requireAdmin },
		async (request, reply) => {
			const { email, name } = request.body;

			if (!email || !email.includes('@')) {
				return reply.code(400).send({ error: 'A valid email is required' });
			}

			return reply.code(201).send(await prisma.user.create({ data: { email, name } }));
		}
	);
}
