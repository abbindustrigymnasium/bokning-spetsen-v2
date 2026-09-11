import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const sessionCookie = 'bokning_session';
export const oauthCookie = 'bokning_oauth';

function required(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required for Microsoft login`);
	return value;
}

function sign(value: string) {
	return createHmac('sha256', required('SESSION_SECRET')).update(value).digest('base64url');
}

export function encodeSession(userId: string) {
	const value = Buffer.from(
		JSON.stringify({ userId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
	).toString('base64url');
	return `${value}.${sign(value)}`;
}

export function decodeSession(value?: string) {
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

export function cookies(request: FastifyRequest) {
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

export function setCookie(reply: FastifyReply, name: string, value: string, maxAge: number) {
	const cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
	const existing = reply.getHeader('Set-Cookie');
	reply.header('Set-Cookie', [
		...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []),
		cookie
	]);
}
