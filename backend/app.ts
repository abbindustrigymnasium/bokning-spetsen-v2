import cors from '@fastify/cors';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { registerAuth } from './auth.js';

export function buildApp() {
	const app = Fastify({ logger: true });
	const prisma = new PrismaClient();

	app.register(cors, { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true });

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

	app.addHook('onClose', async () => prisma.$disconnect());

	return app;
}
