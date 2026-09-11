import cors from '@fastify/cors';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createAuthorization } from './auth/authorization.js';
import { authRoutes } from './routes/auth.js';
import { bookingsRoutes } from './routes/bookings.js';
import { healthRoutes } from './routes/health.js';
import { sitesRoutes } from './routes/sites.js';
import { usersRoutes } from './routes/users.js';

export function buildApp() {
	const app = Fastify({ logger: true });
	const prisma = new PrismaClient();
	const authorization = createAuthorization(prisma);
	app.decorateRequest('user', null);

	app.register(cors, {
		origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
		credentials: true
	});

	app.register(healthRoutes);
	app.register(authRoutes, { prisma, authorization });
	app.register(usersRoutes, { prisma, authorization });
	app.register(sitesRoutes, { prisma, authorization });
	app.register(bookingsRoutes, { prisma, authorization });

	app.addHook('onClose', async () => prisma.$disconnect());

	return app;
}
