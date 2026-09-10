<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';

	let { children } = $props();
	let user = $state<{ name: string | null; email: string } | null>(null);
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
		<span>{user.name ?? user.email}</span>
		<button onclick={logout}>Log out</button>
	{:else}
		<a href={`${apiUrl}/api/auth/login`}>Log in with Microsoft</a>
	{/if}
</nav>
{@render children()}
