import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { cookies, decodeSession, sessionCookie } from './session.js';

export const roleSlugs = ['student', 'teacher', 'admin'] as const;
export type RoleSlug = (typeof roleSlugs)[number];

export type AuthenticatedUser = Prisma.UserGetPayload<{
	include: { permissions: { select: { slug: true } } };
}>;

declare module 'fastify' {
	interface FastifyRequest {
		user: AuthenticatedUser | null;
	}
}

const roleRank: Record<RoleSlug, number> = {
	student: 1,
	teacher: 2,
	admin: 3
};

export async function authenticatedUser(request: FastifyRequest, prisma: PrismaClient) {
	const session = decodeSession(cookies(request)[sessionCookie]);
	if (!session) return undefined;
	return prisma.user.findUnique({
		where: { id: session.userId },
		include: { permissions: { select: { slug: true } } }
	});
}

function hasMinimumRole(user: Pick<AuthenticatedUser, 'permissions'>, requiredRole: RoleSlug) {
	return user.permissions.some((permission) => {
		const role = permission.slug as RoleSlug;
		return Object.hasOwn(roleRank, role) && roleRank[role] >= roleRank[requiredRole];
	});
}

export function isStudent(user: Pick<AuthenticatedUser, 'permissions'>) {
	return hasMinimumRole(user, 'student');
}

export function isTeacher(user: Pick<AuthenticatedUser, 'permissions'>) {
	return hasMinimumRole(user, 'teacher');
}

export function isAdmin(user: Pick<AuthenticatedUser, 'permissions'>) {
	return hasMinimumRole(user, 'admin');
}

type UserResolver = (
	request: FastifyRequest,
	prisma: PrismaClient
) => Promise<AuthenticatedUser | null | undefined>;

export function createAuthorization(
	prisma: PrismaClient,
	resolveUser: UserResolver = authenticatedUser
) {
	const requireAuthenticated: preHandlerHookHandler = async (request, reply) => {
		const user = await resolveUser(request, prisma);
		if (!user) return reply.code(401).send({ error: 'Authentication required' });
		request.user = user;
	};

	function requireRole(role: RoleSlug, error: string): preHandlerHookHandler {
		return async (request: FastifyRequest, reply: FastifyReply) => {
			const user = await resolveUser(request, prisma);
			if (!user) return reply.code(401).send({ error: 'Authentication required' });
			request.user = user;
			if (!hasMinimumRole(user, role)) return reply.code(403).send({ error });
		};
	}

	return {
		requireAuthenticated,
		requireStudent: requireRole('student', 'Student permission required'),
		requireTeacher: requireRole('teacher', 'Teacher permission required'),
		requireAdmin: requireRole('admin', 'Administrator permission required')
	};
}

export type Authorization = ReturnType<typeof createAuthorization>;
