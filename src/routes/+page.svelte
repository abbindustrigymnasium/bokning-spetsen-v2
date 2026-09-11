<script lang="ts">
	import Calendar from '$lib/calendar.svelte';
</script>

<svelte:head>
	<title>Bokningskalender | Bokaren</title>
	<meta name="description" content="Se bokningar för alla anläggningar i en gemensam kalender." />
</svelte:head>

<main>
	<header class="page-heading">
		<div>
			<p class="eyebrow">Bokaren</p>
			<h1>Bokningskalender</h1>
			<p>Se tillgänglighet och bokningar för alla anläggningar på ett ställe.</p>
		</div>
		<a class="book-link" href="/book">Skapa bokning</a>
	</header>

	<Calendar />
</main>
hello

<style>
	:global(body) {
		margin: 0;
		background: #f8fafc;
		color: #0f172a;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}
	main {
		width: min(96rem, calc(100% - 2rem));
		margin: 0 auto;
		padding: 1rem 0 3rem;
	}
	.page-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 0 1.5rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #2563eb;
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 4vw, 2.7rem);
		font-weight: 750;
		letter-spacing: -0.04em;
	}
	.page-heading p:last-child {
		margin: 0.45rem 0 0;
		color: #64748b;
	}
	.book-link {
		flex: 0 0 auto;
		border-radius: 0.7rem;
		background: #0f172a;
		padding: 0.7rem 1rem;
		color: white;
		font-size: 0.9rem;
		font-weight: 650;
		text-decoration: none;
	}
	.book-link:hover {
		background: #1e293b;
	}

	@media (max-width: 600px) {
		main {
			width: min(100% - 1rem, 96rem);
		}
		.page-heading {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
