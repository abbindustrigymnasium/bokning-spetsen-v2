<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	let { children } = $props();
	let user = $state<{
		name: string | null;
		email: string;
		permissions: { slug: string }[];
	} | null>(null);
	const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

	onMount(async () => {
		const response = await fetch(`${apiUrl}/api/auth/me`, { credentials: 'include' });
		if (response.ok) user = (await response.json()).user;
	});

	async function logout() {
		await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' });
		user = null;
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<nav class="flex justify-end gap-3 p-4">
	{#if user}
		{#if user.permissions.some((permission) => permission.slug === 'admin')}
			<a href={resolve('/admin')}>Admin</a>
		{/if}
		<span>{user.name ?? user.email}</span>
		<button onclick={logout}>Log out</button>
	{:else}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external API route -->
		<a href={`${apiUrl}/api/auth/login`}>Log in with Microsoft</a>
	{/if}
</nav>
{@render children()}
