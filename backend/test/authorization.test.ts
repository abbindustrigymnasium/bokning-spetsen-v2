import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import {
	createAuthorization,
	isAdmin,
	isStudent,
	isTeacher,
	type AuthenticatedUser
} from '../auth/authorization.js';
import { permissionsForEntraRoles } from '../auth/entra.js';
import { bookingsRoutes } from '../routes/bookings.js';
import { sitesRoutes } from '../routes/sites.js';
import { usersRoutes } from '../routes/users.js';

function userWith(...permissions: string[]) {
	return {
		id: 'user-id',
		email: 'user@example.com',
		name: 'User',
		createdAt: new Date(),
		updatedAt: new Date(),
		permissions: permissions.map((slug) => ({ slug }))
	} satisfies AuthenticatedUser;
}

describe('role hierarchy', () => {
	it('lets higher roles satisfy lower role checks', () => {
		const student = userWith('student');
		const teacher = userWith('teacher');
		const admin = userWith('admin');

		assert.equal(isStudent(student), true);
		assert.equal(isTeacher(student), false);
		assert.equal(isStudent(teacher), true);
		assert.equal(isTeacher(teacher), true);
		assert.equal(isAdmin(teacher), false);
		assert.equal(isStudent(admin), true);
		assert.equal(isTeacher(admin), true);
		assert.equal(isAdmin(admin), true);
	});

	it('ignores non-role permissions', () => {
		const user = userWith('reports');
		assert.equal(isStudent(user), false);
		assert.equal(isTeacher(user), false);
		assert.equal(isAdmin(user), false);
	});
});

describe('Microsoft role mapping', () => {
	it('temporarily maps Teacher to admin', () => {
		assert.deepEqual(permissionsForEntraRoles(['Teacher']), ['admin']);
	});

	it('maps supported roles case-insensitively and ignores unknown roles', () => {
		assert.deepEqual(permissionsForEntraRoles([' student ', 'ADMIN', 'SomethingElse']), [
			'student',
			'admin'
		]);
	});
});

describe('authorization prehandlers', () => {
	it('returns 401 without a session and 403 for insufficient permissions', async () => {
		const prisma = {} as PrismaClient;
		const unauthenticated = Fastify();
		unauthenticated.decorateRequest('user', null);
		unauthenticated.get(
			'/student',
			{
				preHandler: createAuthorization(prisma, async () => undefined).requireStudent
			},
			async () => ({ ok: true })
		);
		assert.equal((await unauthenticated.inject('/student')).statusCode, 401);
		await unauthenticated.close();

		const student = Fastify();
		student.decorateRequest('user', null);
		student.get(
			'/admin',
			{
				preHandler: createAuthorization(prisma, async () => userWith('student')).requireAdmin
			},
			async () => ({ ok: true })
		);
		assert.equal((await student.inject('/admin')).statusCode, 403);
		await student.close();
	});

	it('allows an admin through student and teacher prehandlers', async () => {
		const app = Fastify();
		app.decorateRequest('user', null);
		const authorization = createAuthorization({} as PrismaClient, async () => userWith('admin'));
		app.get('/student', { preHandler: authorization.requireStudent }, async () => ({ ok: true }));
		app.get('/teacher', { preHandler: authorization.requireTeacher }, async () => ({ ok: true }));

		assert.equal((await app.inject('/student')).statusCode, 200);
		assert.equal((await app.inject('/teacher')).statusCode, 200);
		await app.close();
	});
});

describe('route authorization policy', () => {
	it('lets students view sites but not users', async () => {
		const prisma = {
			site: { findMany: async () => [] },
			user: { findMany: async () => [] }
		} as unknown as PrismaClient;
		const app = Fastify();
		app.decorateRequest('user', null);
		const authorization = createAuthorization(prisma, async () => userWith('student'));
		await app.register(sitesRoutes, { prisma, authorization });
		await app.register(usersRoutes, { prisma, authorization });

		assert.equal((await app.inject('/api/sites')).statusCode, 200);
		assert.equal((await app.inject('/api/users')).statusCode, 403);
		await app.close();
	});

	it("allows admins to delete another user's booking", async () => {
		let deletedBookingId: string | undefined;
		const prisma = {
			booking: {
				findUnique: async () => ({ id: 'booking-id', userId: 'someone-else' }),
				delete: async ({ where }: { where: { id: string } }) => {
					deletedBookingId = where.id;
				}
			}
		} as unknown as PrismaClient;
		const app = Fastify();
		app.decorateRequest('user', null);
		const authorization = createAuthorization(prisma, async () => userWith('admin'));
		await app.register(bookingsRoutes, { prisma, authorization });

		assert.equal(
			(await app.inject({ method: 'DELETE', url: '/api/bookings/booking-id' })).statusCode,
			200
		);
		assert.equal(deletedBookingId, 'booking-id');
		await app.close();
	});

	it("prevents students from deleting another user's booking", async () => {
		let deleteCalled = false;
		const prisma = {
			booking: {
				findUnique: async () => ({ id: 'booking-id', userId: 'someone-else' }),
				delete: async () => {
					deleteCalled = true;
				}
			}
		} as unknown as PrismaClient;
		const app = Fastify();
		app.decorateRequest('user', null);
		const authorization = createAuthorization(prisma, async () => userWith('student'));
		await app.register(bookingsRoutes, { prisma, authorization });

		assert.equal(
			(await app.inject({ method: 'DELETE', url: '/api/bookings/booking-id' })).statusCode,
			403
		);
		assert.equal(deleteCalled, false);
		await app.close();
	});
});
