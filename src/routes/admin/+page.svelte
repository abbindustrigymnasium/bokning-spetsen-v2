<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	type Permission = { slug: string };
	type User = {
		id: string;
		email: string;
		name: string | null;
		createdAt: string;
		permissions: Permission[];
	};
	type Site = {
		id: string;
		name: string;
		active: boolean;
		createdAt: string;
		updatedAt: string;
	};

	const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
	let pageStatus = $state<'loading' | 'ready' | 'unauthenticated' | 'forbidden' | 'error'>(
		'loading'
	);
	let sites = $state<Site[]>([]);
	let users = $state<User[]>([]);
	let siteNames = $state<Record<string, string>>({});
	let newSiteName = $state('');
	let busySiteId = $state<string | null>(null);
	let creating = $state(false);
	let message = $state('');
	let error = $state('');

	async function request<T>(path: string, init?: RequestInit): Promise<T> {
		const response = await fetch(`${apiUrl}${path}`, {
			...init,
			credentials: 'include',
			headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers
		});
		if (response.status === 401) {
			pageStatus = 'unauthenticated';
			throw new Error('Logga in för att fortsätta.');
		}
		if (response.status === 403) {
			pageStatus = 'forbidden';
			throw new Error('Du saknar administratörsbehörighet.');
		}
		if (!response.ok) {
			const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
			throw new Error(body?.error ?? 'Ett oväntat fel uppstod.');
		}
		return response.json() as Promise<T>;
	}

	async function loadAdmin() {
		pageStatus = 'loading';
		error = '';
		try {
			const [loadedSites, loadedUsers] = await Promise.all([
				request<Site[]>('/api/sites'),
				request<User[]>('/api/users')
			]);
			sites = loadedSites;
			users = loadedUsers;
			siteNames = Object.fromEntries(loadedSites.map((site) => [site.id, site.name]));
			pageStatus = 'ready';
		} catch (cause) {
			if (pageStatus === 'loading') pageStatus = 'error';
			error = cause instanceof Error ? cause.message : 'Kunde inte läsa konfigurationen.';
		}
	}

	async function createSite(event: SubmitEvent) {
		event.preventDefault();
		const name = newSiteName.trim();
		if (!name) return;
		creating = true;
		error = '';
		message = '';
		try {
			const site = await request<Site>('/api/sites', {
				method: 'POST',
				body: JSON.stringify({ name })
			});
			sites = [...sites, site].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
			siteNames[site.id] = site.name;
			newSiteName = '';
			message = `${site.name} skapades.`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Kunde inte skapa anläggningen.';
		} finally {
			creating = false;
		}
	}

	async function updateSite(site: Site, changes: { name?: string; active?: boolean }) {
		busySiteId = site.id;
		error = '';
		message = '';
		try {
			const updated = await request<Site>(`/api/sites/${site.id}`, {
				method: 'PATCH',
				body: JSON.stringify(changes)
			});
			sites = sites.map((candidate) => (candidate.id === updated.id ? updated : candidate));
			siteNames[updated.id] = updated.name;
			message = `${updated.name} uppdaterades.`;
		} catch (cause) {
			siteNames[site.id] = site.name;
			error = cause instanceof Error ? cause.message : 'Kunde inte uppdatera anläggningen.';
		} finally {
			busySiteId = null;
		}
	}

	async function saveSiteName(site: Site) {
		const name = siteNames[site.id]?.trim();
		if (!name || name === site.name) {
			siteNames[site.id] = site.name;
			return;
		}
		await updateSite(site, { name });
	}

	async function deleteSite(site: Site) {
		if (!window.confirm(`Ta bort ${site.name}? Detta går inte att ångra.`)) return;
		busySiteId = site.id;
		error = '';
		message = '';
		try {
			await request<{ ok: true }>(`/api/sites/${site.id}`, { method: 'DELETE' });
			sites = sites.filter((candidate) => candidate.id !== site.id);
			delete siteNames[site.id];
			message = `${site.name} togs bort.`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Kunde inte ta bort anläggningen.';
		} finally {
			busySiteId = null;
		}
	}

	function effectiveRole(user: User) {
		const slugs = new Set(user.permissions.map((permission) => permission.slug));
		if (slugs.has('admin')) return 'Administratör';
		if (slugs.has('teacher')) return 'Lärare';
		if (slugs.has('student')) return 'Elev';
		return 'Ingen roll';
	}

	onMount(loadAdmin);
</script>

<svelte:head>
	<title>Administration | Bokaren</title>
	<meta name="description" content="Hantera Bokarens anläggningar och användare." />
</svelte:head>

<main>
	<header class="page-heading">
		<div>
			<p class="eyebrow">Bokaren</p>
			<h1>Administration</h1>
			<p>Hantera anläggningar och se vilka som har tillgång till applikationen.</p>
		</div>
		<a class="back-link" href={resolve('/')}>Till kalendern</a>
	</header>

	{#if pageStatus === 'loading'}
		<section class="status-card" aria-live="polite">Laddar konfiguration…</section>
	{:else if pageStatus === 'unauthenticated'}
		<section class="status-card">
			<h2>Logga in</h2>
			<p>Du behöver logga in som administratör för att öppna den här sidan.</p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external API route -->
			<a class="primary-link" href={`${apiUrl}/api/auth/login`}>Logga in med Microsoft</a>
		</section>
	{:else if pageStatus === 'forbidden'}
		<section class="status-card">
			<h2>Åtkomst nekad</h2>
			<p>Den här sidan är endast tillgänglig för administratörer.</p>
			<a class="back-link" href={resolve('/')}>Till kalendern</a>
		</section>
	{:else if pageStatus === 'error'}
		<section class="status-card">
			<h2>Något gick fel</h2>
			<p>{error}</p>
			<button class="primary-button" type="button" onclick={loadAdmin}>Försök igen</button>
		</section>
	{:else}
		{#if message}<p class="notice success" aria-live="polite">{message}</p>{/if}
		{#if error}<p class="notice error" role="alert">{error}</p>{/if}

		<div class="summary-grid">
			<article><strong>{sites.length}</strong><span>Anläggningar</span></article>
			<article>
				<strong>{sites.filter((site) => site.active).length}</strong><span>Aktiva</span>
			</article>
			<article><strong>{users.length}</strong><span>Användare</span></article>
		</div>

		<section class="panel">
			<div class="panel-heading">
				<div>
					<p class="eyebrow">Konfiguration</p>
					<h2>Anläggningar</h2>
					<p>Aktiva anläggningar kan väljas när en bokning skapas.</p>
				</div>
			</div>

			<form class="create-form" onsubmit={createSite}>
				<label for="new-site">Ny anläggning</label>
				<div>
					<input id="new-site" bind:value={newSiteName} placeholder="Exempel: Spetsen C" />
					<button class="primary-button" type="submit" disabled={creating || !newSiteName.trim()}>
						{creating ? 'Skapar…' : 'Lägg till'}
					</button>
				</div>
			</form>

			<div class="site-list">
				{#each sites as site (site.id)}
					<div class="site-row">
						<div class="site-name">
							<label for={`site-${site.id}`}>Namn</label>
							<input
								id={`site-${site.id}`}
								bind:value={siteNames[site.id]}
								disabled={busySiteId === site.id}
								onblur={() => saveSiteName(site)}
								onkeydown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
							/>
						</div>
						<label class="toggle">
							<input
								type="checkbox"
								checked={site.active}
								disabled={busySiteId === site.id}
								onchange={() => updateSite(site, { active: !site.active })}
							/>
							<span>{site.active ? 'Aktiv' : 'Inaktiv'}</span>
						</label>
						<button
							class="danger-button"
							type="button"
							disabled={busySiteId === site.id}
							onclick={() => deleteSite(site)}>Ta bort</button
						>
					</div>
				{:else}
					<p class="empty">Inga anläggningar har skapats ännu.</p>
				{/each}
			</div>
		</section>

		<section class="panel">
			<div class="panel-heading">
				<div>
					<p class="eyebrow">Åtkomst</p>
					<h2>Användare</h2>
					<p>Roller synkroniseras automatiskt från Microsoft vid inloggning.</p>
				</div>
			</div>
			<div class="table-wrapper">
				<table>
					<thead><tr><th>Namn</th><th>E-post</th><th>Roll</th></tr></thead>
					<tbody>
						{#each users as user (user.id)}
							<tr>
								<td>{user.name ?? '—'}</td>
								<td>{user.email}</td>
								<td><span class="role-badge">{effectiveRole(user)}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f8fafc;
		color: #0f172a;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	main {
		width: min(74rem, calc(100% - 2rem));
		margin: 0 auto;
		padding: 1rem 0 4rem;
	}
	.page-heading,
	.panel-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.page-heading {
		align-items: end;
		padding: 1.25rem 0 1.75rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #2563eb;
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	h1,
	h2 {
		margin: 0;
		letter-spacing: -0.035em;
	}
	h1 {
		font-size: clamp(1.9rem, 4vw, 2.7rem);
	}
	h2 {
		font-size: 1.35rem;
	}
	.page-heading p:last-child,
	.panel-heading p:last-child {
		margin: 0.45rem 0 0;
		color: #64748b;
	}
	.back-link,
	.primary-link {
		color: #1d4ed8;
		font-weight: 650;
		text-decoration: none;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.summary-grid article,
	.panel,
	.status-card {
		border: 1px solid #e2e8f0;
		border-radius: 1rem;
		background: white;
		box-shadow: 0 8px 30px rgb(15 23 42 / 0.05);
	}
	.summary-grid article {
		display: flex;
		flex-direction: column;
		padding: 1.2rem 1.35rem;
	}
	.summary-grid strong {
		font-size: 1.8rem;
	}
	.summary-grid span {
		color: #64748b;
		font-size: 0.85rem;
	}
	.panel {
		margin-top: 1rem;
		padding: 1.4rem;
	}
	.status-card {
		padding: 2rem;
		text-align: center;
	}
	.create-form {
		margin: 1.4rem 0;
		padding: 1rem;
		border-radius: 0.8rem;
		background: #f8fafc;
	}
	.create-form > label,
	.site-name label {
		display: block;
		margin-bottom: 0.35rem;
		color: #475569;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.create-form > div {
		display: flex;
		gap: 0.7rem;
	}
	input {
		width: 100%;
		border: 1px solid #cbd5e1;
		border-radius: 0.6rem;
		background: white;
		padding: 0.62rem 0.75rem;
		color: #0f172a;
	}
	input:focus {
		border-color: #2563eb;
		outline: 2px solid rgb(37 99 235 / 0.15);
	}
	.primary-button,
	.danger-button {
		border: 0;
		border-radius: 0.6rem;
		padding: 0.65rem 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}
	.primary-button {
		background: #0f172a;
		color: white;
	}
	.danger-button {
		background: #fff1f2;
		color: #be123c;
	}
	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}
	.site-list {
		border-top: 1px solid #e2e8f0;
	}
	.site-row {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) 7rem auto;
		gap: 1rem;
		align-items: end;
		padding: 1rem 0;
		border-bottom: 1px solid #e2e8f0;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.65rem;
		font-size: 0.88rem;
		font-weight: 650;
	}
	.toggle input {
		width: auto;
	}
	.notice {
		margin: 0 0 1rem;
		border-radius: 0.7rem;
		padding: 0.8rem 1rem;
	}
	.notice.success {
		background: #ecfdf5;
		color: #047857;
	}
	.notice.error {
		background: #fff1f2;
		color: #be123c;
	}
	.table-wrapper {
		margin-top: 1.25rem;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}
	th,
	td {
		padding: 0.8rem 0.65rem;
		border-bottom: 1px solid #e2e8f0;
	}
	th {
		color: #64748b;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.role-badge {
		display: inline-flex;
		border-radius: 999px;
		background: #eff6ff;
		padding: 0.25rem 0.6rem;
		color: #1d4ed8;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.empty {
		color: #64748b;
		text-align: center;
	}
	@media (max-width: 650px) {
		main {
			width: min(100% - 1rem, 74rem);
		}
		.page-heading {
			align-items: start;
			flex-direction: column;
		}
		.summary-grid {
			grid-template-columns: 1fr;
		}
		.site-row {
			grid-template-columns: 1fr auto;
		}
		.site-name {
			grid-column: 1 / -1;
		}
	}
</style>
