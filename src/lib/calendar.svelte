<script lang="ts">
	import {
		createCalendar,
		createPreactView,
		createViewDay,
		createViewList,
		createViewMonthAgenda,
		createViewMonthGrid,
		createViewWeek,
		type CalendarEvent,
		type CalendarType
	} from '@schedule-x/calendar';
	import { ScheduleXCalendar } from '@schedule-x/svelte';
	import '@schedule-x/theme-default/dist/index.css';
	import 'temporal-polyfill/global';
	import { onMount } from 'svelte';

	type CalendarView = 'day' | 'week' | 'work-week' | 'month-grid' | 'month-agenda' | 'list';

	type Site = {
		id: string;
		name: string;
		active: boolean;
	};

	type Booking = {
		id: string;
		userId: string;
		siteId: string;
		startsAt: string;
		endsAt: string;
		user: { id: string; name: string | null; email: string };
		site: Site;
	};

	export type BookingCalendarConfig = {
		defaultView?: CalendarView;
		enabledViews?: CalendarView[];
		locale?: string;
		timezone?: string;
		firstDayOfWeek?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
		dayStart?: string;
		dayEnd?: string;
		siteColors?: Record<string, string>;
	};

	let { config = {} }: { config?: BookingCalendarConfig } = $props();

	const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
	const palette = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626'];
	function createWeekView(nDays: 5 | 7, name: 'week' | 'work-week', label: string) {
		const weekView = createViewWeek();

		return createPreactView({
			...weekView,
			name,
			label,
			setDateRange: (rangeConfig) => {
				rangeConfig.calendarConfig.weekOptions.value = {
					...rangeConfig.calendarConfig.weekOptions.value,
					nDays
				};
				return weekView.setDateRange(rangeConfig);
			}
		});
	}

	const viewFactories: Record<CalendarView, () => ReturnType<typeof createViewDay>> = {
		day: createViewDay,
		week: () => createWeekView(7, 'week', 'Week'),
		'work-week': () => createWeekView(5, 'work-week', 'Arbetsvecka'),
		'month-grid': createViewMonthGrid,
		'month-agenda': createViewMonthAgenda,
		list: createViewList
	};

	let calendarApp = $state<ReturnType<typeof createCalendar>>();
	let sites = $state<Site[]>([]);
	let bookings = $state<Booking[]>([]);
	let visibleSiteIds = $state<Set<string>>(new Set());
	let selectedBooking = $state<Booking>();
	let loading = $state(true);
	let loadingEvents = $state(false);
	let error = $state('');
	let unauthorized = $state(false);

	const timezone = $derived(config.timezone ?? 'Europe/Stockholm');

	function colorForSite(site: Site, index: number) {
		return (
			config.siteColors?.[site.id] ??
			config.siteColors?.[site.name] ??
			palette[index % palette.length]
		);
	}

	function withAlpha(hex: string, alpha: string) {
		return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex;
	}

	function calendarDefinitions() {
		return Object.fromEntries(
			sites.map((site, index) => {
				const color = colorForSite(site, index);
				return [
					site.id,
					{
						colorName: `site${index}`,
						label: site.name,
						lightColors: { main: color, container: withAlpha(color, '22'), onContainer: color },
						darkColors: { main: color, container: withAlpha(color, '33'), onContainer: '#ffffff' }
					} satisfies CalendarType
				];
			})
		);
	}

	function toCalendarEvent(booking: Booking): CalendarEvent {
		return {
			id: booking.id,
			title: booking.site.name,
			start: Temporal.Instant.from(booking.startsAt).toZonedDateTimeISO(timezone),
			end: Temporal.Instant.from(booking.endsAt).toZonedDateTimeISO(timezone),
			calendarId: booking.siteId,
			people: [booking.user.name ?? booking.user.email],
			location: booking.site.name
		};
	}

	function visibleEvents() {
		return bookings.filter((booking) => visibleSiteIds.has(booking.siteId)).map(toCalendarEvent);
	}

	async function fetchBookings(range: {
		start: Temporal.ZonedDateTime;
		end: Temporal.ZonedDateTime;
	}) {
		loadingEvents = true;
		error = '';
		try {
			const params = new URLSearchParams({
				from: range.start.toInstant().toString(),
				to: range.end.toInstant().toString()
			});
			const response = await fetch(`${apiUrl}/api/bookings?${params}`, { credentials: 'include' });
			if (response.status === 401) {
				unauthorized = true;
				return [];
			}
			if (!response.ok) throw new Error('Kunde inte hämta bokningar.');
			bookings = await response.json();
			return visibleEvents();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Ett oväntat fel uppstod.';
			return [];
		} finally {
			loadingEvents = false;
		}
	}

	function toggleSite(siteId: string) {
		const next = new Set(visibleSiteIds);
		next.has(siteId) ? next.delete(siteId) : next.add(siteId);
		visibleSiteIds = next;
		calendarApp?.events.set(visibleEvents());
	}

	function setAllSites(visible: boolean) {
		visibleSiteIds = visible ? new Set(sites.map((site) => site.id)) : new Set();
		calendarApp?.events.set(visibleEvents());
	}

	function formatDateTime(value: string) {
		return new Intl.DateTimeFormat(config.locale ?? 'sv-SE', {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone: timezone
		}).format(new Date(value));
	}

	onMount(async () => {
		try {
			const response = await fetch(`${apiUrl}/api/sites`, { credentials: 'include' });
			if (response.status === 401) {
				unauthorized = true;
				return;
			}
			if (!response.ok) throw new Error('Kunde inte hämta anläggningar.');
			sites = await response.json();
			visibleSiteIds = new Set(sites.map((site) => site.id));

			const enabledViews = config.enabledViews?.length
				? config.enabledViews
				: ([
						'week',
						'work-week',
						'day',
						'month-grid',
						'month-agenda',
						'list'
					] satisfies CalendarView[]);
			const defaultView = enabledViews.includes(config.defaultView ?? 'week')
				? (config.defaultView ?? 'week')
				: enabledViews[0];

			calendarApp = createCalendar({
				views: enabledViews.map((view) => viewFactories[view]()) as [
					ReturnType<typeof createViewDay>,
					...ReturnType<typeof createViewDay>[]
				],
				defaultView,
				selectedDate: Temporal.Now.plainDateISO(timezone),
				locale: config.locale ?? 'sv-SE',
				timezone,
				firstDayOfWeek: config.firstDayOfWeek ?? 1,
				dayBoundaries: { start: config.dayStart ?? '07:00', end: config.dayEnd ?? '22:00' },
				weekOptions: { gridStep: 30, eventOverlap: true },
				monthGridOptions: { nEventsPerDay: 4 },
				calendars: calendarDefinitions(),
				events: [],
				callbacks: {
					fetchEvents: fetchBookings,
					onEventClick: (event) => {
						selectedBooking = bookings.find((booking) => booking.id === String(event.id));
					}
				}
			});
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Ett oväntat fel uppstod.';
		} finally {
			loading = false;
		}
	});
</script>

<section class="calendar-layout" aria-label="Bokningskalender">
	<aside class="site-panel">
		<div class="site-panel__heading">
			<div>
				<p class="eyebrow">Anläggningar</p>
				<h2>Visas i kalendern</h2>
			</div>
			<button class="text-button" type="button" onclick={() => setAllSites(true)}>Visa alla</button>
		</div>

		{#if sites.length}
			<div class="site-list">
				{#each sites as site, index (site.id)}
					<label class="site-option">
						<input
							type="checkbox"
							checked={visibleSiteIds.has(site.id)}
							onchange={() => toggleSite(site.id)}
						/>
						<span class="site-dot" style:background={colorForSite(site, index)}></span>
						<span>{site.name}</span>
					</label>
				{/each}
			</div>
			<button class="clear-button" type="button" onclick={() => setAllSites(false)}
				>Dölj alla</button
			>
		{:else if !loading && !unauthorized}
			<p class="muted">Det finns inga aktiva anläggningar ännu.</p>
		{/if}
	</aside>

	<div class="calendar-column">
		{#if loading}
			<div class="status-card" aria-live="polite">Laddar kalendern…</div>
		{:else if unauthorized}
			<div class="status-card">
				<h2>Logga in för att se kalendern</h2>
				<p>Bokningar och anläggningar visas när du har loggat in.</p>
				<a class="primary-link" href={`${apiUrl}/api/auth/login`}>Logga in med Microsoft</a>
			</div>
		{:else if calendarApp}
			<div class="calendar-status" aria-live="polite">
				{#if loadingEvents}Uppdaterar bokningar…{/if}
			</div>
			<div class="calendar-wrapper">
				<ScheduleXCalendar {calendarApp} />
			</div>
		{/if}

		{#if error}<p class="error-message" role="alert">{error}</p>{/if}
	</div>
</section>

{#if selectedBooking}
	<div class="dialog-backdrop" role="presentation" onclick={() => (selectedBooking = undefined)}>
		<div
			class="booking-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="booking-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.key === 'Escape' && (selectedBooking = undefined)}
		>
			<button
				class="dialog-close"
				type="button"
				aria-label="Stäng"
				onclick={() => (selectedBooking = undefined)}>×</button
			>
			<p class="eyebrow">Bokning</p>
			<h2 id="booking-title">{selectedBooking.site.name}</h2>
			<dl>
				<div>
					<dt>Från</dt>
					<dd>{formatDateTime(selectedBooking.startsAt)}</dd>
				</div>
				<div>
					<dt>Till</dt>
					<dd>{formatDateTime(selectedBooking.endsAt)}</dd>
				</div>
				<div>
					<dt>Bokad av</dt>
					<dd>{selectedBooking.user.name ?? selectedBooking.user.email}</dd>
				</div>
			</dl>
		</div>
	</div>
{/if}

<style>
	.calendar-layout {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}
	.site-panel,
	.status-card,
	.calendar-wrapper {
		border: 1px solid #e2e8f0;
		border-radius: 1rem;
		background: white;
		box-shadow: 0 8px 30px rgb(15 23 42 / 0.06);
	}
	.site-panel {
		padding: 1.1rem;
		position: sticky;
		top: 1rem;
	}
	.site-panel__heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.eyebrow {
		margin: 0 0 0.2rem;
		color: #64748b;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		color: #0f172a;
		font-size: 1rem;
		font-weight: 700;
	}
	.text-button,
	.clear-button {
		color: #2563eb;
		font-size: 0.78rem;
		font-weight: 650;
		cursor: pointer;
	}
	.clear-button {
		margin-top: 0.8rem;
	}
	.site-list {
		display: grid;
		gap: 0.2rem;
		margin-top: 1rem;
	}
	.site-option {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0.4rem;
		border-radius: 0.55rem;
		color: #334155;
		cursor: pointer;
	}
	.site-option:hover {
		background: #f8fafc;
	}
	.site-option input {
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
	}
	.site-dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		flex: 0 0 auto;
	}
	.muted {
		color: #64748b;
		font-size: 0.9rem;
	}
	.calendar-column {
		min-width: 0;
	}
	.calendar-status {
		height: 1.25rem;
		padding-right: 0.25rem;
		color: #64748b;
		font-size: 0.75rem;
		text-align: right;
	}
	.calendar-wrapper {
		height: min(76vh, 54rem);
		min-height: 36rem;
		padding: 0.6rem;
		overflow: hidden;
	}
	.calendar-wrapper :global(.sx-svelte-calendar-wrapper) {
		width: 100%;
		height: 100%;
	}
	.calendar-wrapper :global(.sx-calendar) {
		border: 0;
	}
	.status-card {
		display: grid;
		justify-items: start;
		gap: 0.65rem;
		min-height: 18rem;
		padding: 2rem;
		place-content: center;
		color: #475569;
	}
	.status-card p {
		margin: 0;
	}
	.primary-link {
		display: inline-flex;
		border-radius: 0.6rem;
		background: #2563eb;
		padding: 0.65rem 1rem;
		color: white;
		font-weight: 650;
		text-decoration: none;
	}
	.error-message {
		margin: 0.75rem 0;
		border-radius: 0.6rem;
		background: #fef2f2;
		padding: 0.8rem 1rem;
		color: #b91c1c;
	}
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(15 23 42 / 0.45);
	}
	.booking-dialog {
		position: relative;
		width: min(28rem, 100%);
		border-radius: 1rem;
		background: white;
		padding: 1.5rem;
		box-shadow: 0 24px 60px rgb(15 23 42 / 0.25);
	}
	.dialog-close {
		position: absolute;
		top: 0.75rem;
		right: 0.9rem;
		color: #64748b;
		font-size: 1.5rem;
		cursor: pointer;
	}
	.booking-dialog dl {
		display: grid;
		gap: 0.9rem;
		margin: 1.25rem 0 0;
	}
	.booking-dialog dl div {
		display: grid;
		grid-template-columns: 5rem 1fr;
		gap: 0.75rem;
	}
	.booking-dialog dt {
		color: #64748b;
		font-size: 0.85rem;
	}
	.booking-dialog dd {
		margin: 0;
		color: #1e293b;
	}

	@media (max-width: 800px) {
		.calendar-layout {
			grid-template-columns: 1fr;
		}
		.site-panel {
			position: static;
		}
		.site-list {
			grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		}
		.calendar-wrapper {
			height: 72vh;
			min-height: 32rem;
			padding: 0.25rem;
		}
	}
</style>
