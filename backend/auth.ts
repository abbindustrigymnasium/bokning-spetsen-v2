import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ConfidentialClientApplication } from '@azure/msal-node';
import type { PrismaClient } from '@prisma/client';

const sessionCookie = 'bokning_session';
const oauthCookie = 'bokning_oauth';
const defaultDevelopmentUserEmail = 'example@mail.com';
// Sign-in only. No Microsoft Graph permission is needed because identity claims
// from the ID token are sufficient to create the local session.
const scopes = ['openid', 'profile', 'email'];

function required(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required for Microsoft login`);
	return value;
}

function client() {
	return new ConfidentialClientApplication({
		auth: {
			clientId: required('ENTRA_CLIENT_ID'),
			clientSecret: required('ENTRA_VALUE'),
			authority: `https://login.microsoftonline.com/${required('ENTRA_DIRECTORY_ID')}`
		}
	});
}

function sign(value: string) {
	return createHmac('sha256', required('SESSION_SECRET')).update(value).digest('base64url');
}

function encodeSession(userId: string) {
	const value = Buffer.from(
		JSON.stringify({ userId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
	).toString('base64url');
	return `${value}.${sign(value)}`;
}

function decodeSession(value?: string) {
	if (!value) return undefined;
	const [payload, signature] = value.split('.');
	if (!payload || !signature) return undefined;
	const expected = sign(payload);
	if (
		signature.length !== expected.length ||
		!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
	)
		return undefined;
	try {
		const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
			userId: string;
			expiresAt: number;
		};
		return session.expiresAt > Date.now() ? session : undefined;
	} catch {
		return undefined;
	}
}

export async function authenticatedUser(request: FastifyRequest, prisma: PrismaClient) {
	if (process.env.NODE_ENV === 'development') {
		return prisma.user.findUnique({
			where: { email: process.env.DEV_USER_EMAIL ?? defaultDevelopmentUserEmail },
			include: { permissions: { select: { slug: true } } }
		});
	}

	const session = decodeSession(cookies(request)[sessionCookie]);
	if (!session) return undefined;
	return prisma.user.findUnique({
		where: { id: session.userId },
		include: { permissions: { select: { slug: true } } }
	});
}

export function isAdmin(user: { permissions: { slug: string }[] }) {
	return user.permissions.some((permission) => permission.slug === 'admin');
}

function cookies(request: FastifyRequest) {
	return Object.fromEntries(
		(request.headers.cookie ?? '')
			.split(';')
			.filter(Boolean)
			.map((part) => {
				const index = part.indexOf('=');
				return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
			})
	);
}

function setCookie(reply: FastifyReply, name: string, value: string, maxAge: number) {
	const cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
	const existing = reply.getHeader('Set-Cookie');
	reply.header('Set-Cookie', [
		...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []),
		cookie
	]);
}

export function registerAuth(app: FastifyInstance, prisma: PrismaClient) {
	app.get('/api/auth/login', async (_request: FastifyRequest, reply: FastifyReply) => {
		const state = randomBytes(24).toString('base64url');
		const codeVerifier = randomBytes(48).toString('base64url');
		const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
		const redirectUri = required('ENTRA_REDIRECT_URI');
		const url = await client().getAuthCodeUrl({
			scopes,
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
				const result = await client().acquireTokenByCode({
					code: request.query.code,
					scopes,
					redirectUri: required('ENTRA_REDIRECT_URI'),
					codeVerifier: oauth.codeVerifier
				});
				const claims = result?.idTokenClaims as
					{ oid?: string; preferred_username?: string; email?: string; name?: string } | undefined;
				const email = claims?.preferred_username ?? claims?.email;
				if (!email)
					return reply.code(400).send({ error: 'Microsoft account has no email address' });
				const user = await prisma.user.upsert({
					where: { email },
					update: { name: claims?.name },
					create: { email, name: claims?.name }
				});
				setCookie(reply, sessionCookie, encodeSession(user.id), 8 * 60 * 60);
				setCookie(reply, oauthCookie, '', 0);
				return reply.redirect(process.env.FRONTEND_URL ?? 'http://localhost:5173');
			} catch (error) {
				request.log.error(error);
				return reply.code(401).send({ error: 'Microsoft login failed' });
			}
		}
	);

	app.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
		const user = await authenticatedUser(request, prisma);
		return user ? { user } : reply.code(401).send({ user: null });
	});

	app.post('/api/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
		setCookie(reply, sessionCookie, '', 0);
		return { ok: true };
	});
}
