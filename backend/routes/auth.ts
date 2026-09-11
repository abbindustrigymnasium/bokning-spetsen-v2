import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { roleSlugs, type Authorization, type RoleSlug } from '../auth/authorization.js';
import {
	entraClient,
	entraScopes,
	permissionsForEntraRoles,
	requiredEnvironment
} from '../auth/entra.js';
import { cookies, encodeSession, oauthCookie, sessionCookie, setCookie } from '../auth/session.js';

type AuthRouteOptions = {
	prisma: PrismaClient;
	authorization: Authorization;
};

type EntraClaims = {
	oid?: string;
	preferred_username?: string;
	email?: string;
	name?: string;
	roles?: string[];
};

async function syncUserPermissions(
	prisma: PrismaClient,
	identity: { email: string; name?: string },
	permissions: RoleSlug[]
) {
	const user = await prisma.user.upsert({
		where: { email: identity.email },
		update: { name: identity.name },
		create: {
			email: identity.email,
			name: identity.name,
			permissions: { connect: permissions.map((slug) => ({ slug })) }
		},
		include: { permissions: true }
	});

	const unmanagedPermissions = user.permissions
		.filter((permission) => !roleSlugs.includes(permission.slug as RoleSlug))
		.map((permission) => ({ id: permission.id }));

	return prisma.user.update({
		where: { id: user.id },
		data: {
			permissions: {
				set: [...unmanagedPermissions, ...permissions.map((slug) => ({ slug }))]
			}
		},
		include: { permissions: { select: { slug: true } } }
	});
}

async function revokeManagedRoles(prisma: PrismaClient, email: string) {
	const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
	if (!user) return;
	await prisma.user.update({
		where: { id: user.id },
		data: { permissions: { disconnect: roleSlugs.map((slug) => ({ slug })) } }
	});
}

export async function authRoutes(
	app: FastifyInstance,
	{ prisma, authorization }: AuthRouteOptions
) {
	app.get('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
		request.log.trace('Microsoft login started');
		const state = randomBytes(24).toString('base64url');
		const codeVerifier = randomBytes(48).toString('base64url');
		const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
		const redirectUri = requiredEnvironment('ENTRA_REDIRECT_URI');
		const url = await entraClient().getAuthCodeUrl({
			scopes: entraScopes,
			redirectUri,
			state,
			codeChallenge,
			codeChallengeMethod: 'S256'
		});
		setCookie(
			reply,
			oauthCookie,
			Buffer.from(JSON.stringify({ state, codeVerifier })).toString('base64url'),
			600
		);
		return reply.redirect(url);
	});

	app.get(
		'/api/auth/callback',
		async (
			request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
			reply: FastifyReply
		) => {
			request.log.trace(
				{ hasCode: Boolean(request.query.code), hasError: Boolean(request.query.error) },
				'Microsoft login callback received'
			);
			const saved = cookies(request)[oauthCookie];
			let oauth: { state: string; codeVerifier: string } | undefined;
			try {
				oauth = saved
					? (JSON.parse(Buffer.from(saved, 'base64url').toString()) as {
							state: string;
							codeVerifier: string;
						})
					: undefined;
			} catch {
				return reply.code(400).send({ error: 'Invalid OAuth state' });
			}
			if (
				!oauth ||
				!request.query.state ||
				oauth.state.length !== request.query.state.length ||
				!timingSafeEqual(Buffer.from(oauth.state), Buffer.from(request.query.state))
			)
				return reply.code(400).send({ error: 'Invalid OAuth state' });
			if (request.query.error || !request.query.code)
				return reply.code(401).send({ error: 'Microsoft login was not completed' });

			try {
				const result = await entraClient().acquireTokenByCode({
					code: request.query.code,
					scopes: entraScopes,
					redirectUri: requiredEnvironment('ENTRA_REDIRECT_URI'),
					codeVerifier: oauth.codeVerifier
				});
				const claims = result?.idTokenClaims as EntraClaims | undefined;
				request.log.trace({ roles: claims?.roles ?? [] }, 'Microsoft roles returned');
				const email = claims?.preferred_username ?? claims?.email;
				if (!email)
					return reply.code(400).send({ error: 'Microsoft account has no email address' });

				const permissions = permissionsForEntraRoles(claims?.roles);
				if (!permissions.length) {
					await revokeManagedRoles(prisma, email);
					setCookie(reply, oauthCookie, '', 0);
					setCookie(reply, sessionCookie, '', 0);
					return reply.code(403).send({ error: 'Microsoft account has no authorized role' });
				}

				const user = await syncUserPermissions(prisma, { email, name: claims?.name }, permissions);
				setCookie(reply, sessionCookie, encodeSession(user.id), 8 * 60 * 60);
				setCookie(reply, oauthCookie, '', 0);
				return reply.redirect(process.env.FRONTEND_URL ?? 'http://localhost:5173');
			} catch (error) {
				request.log.error(error);
				return reply.code(401).send({ error: 'Microsoft login failed' });
			}
		}
	);

	app.get('/api/auth/me', { preHandler: authorization.requireAuthenticated }, async (request) => ({
		user: request.user
	}));

	app.post('/api/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
		setCookie(reply, sessionCookie, '', 0);
		return { ok: true };
	});
}
