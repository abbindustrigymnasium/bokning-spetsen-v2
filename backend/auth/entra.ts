import { ConfidentialClientApplication } from '@azure/msal-node';
import type { RoleSlug } from './authorization.js';

export const entraScopes = ['openid', 'profile', 'email'];

export function requiredEnvironment(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required for Microsoft login`);
	return value;
}

export function entraClient() {
	return new ConfidentialClientApplication({
		auth: {
			clientId: requiredEnvironment('ENTRA_CLIENT_ID'),
			clientSecret: requiredEnvironment('ENTRA_VALUE'),
			authority: `https://login.microsoftonline.com/${requiredEnvironment('ENTRA_DIRECTORY_ID')}`
		}
	});
}

export function permissionsForEntraRoles(roles: string[] = []): RoleSlug[] {
	const permissions = roles
		.map((role) => role.trim().toLowerCase())
		// Temporary compatibility rule: teachers are administrators in this version.
		.map((role) => (role === 'teacher' ? 'admin' : role))
		.filter((role): role is RoleSlug => ['student', 'teacher', 'admin'].includes(role));

	return [...new Set(permissions)];
}
