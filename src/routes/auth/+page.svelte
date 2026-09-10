<script lang="ts">
	import { onMount } from 'svelte';

	const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

	onMount(() => {
		// Entra redirects to the public frontend URI. The backend then performs
		// the confidential-client token exchange and creates the session cookie.
		window.location.replace(`${apiUrl}/api/auth/callback${window.location.search}`);
	});
</script>

<p class="p-6">Signing you in…</p>
