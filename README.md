# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.17.0 create --template minimal --types ts --add eslint prettier playwright tailwindcss="plugins:typography,forms" sveltekit-adapter="adapter:node" --install pnpm ./bokning-spetsen-v2
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

The Fastify API runs separately from the SvelteKit frontend:

```sh
pnpm run dev:backend
```

It listens on `http://localhost:3001` by default. The API exposes health, user, site administration,
and authenticated site-aware booking routes. Bookings require `siteId`, `startsAt`, and `endsAt`;
overlapping bookings are rejected per site, so the same time can be booked at different sites. Set
`PORT` or `HOST` to change the bind address. User routes use the Prisma schema and require
`DATABASE_URL` to be set. Authenticated routes use Microsoft login and the signed session cookie in
every environment.

Regenerate the Prisma client after changing the schema with:

```sh
pnpm run db:generate
```

Seed the local development database with sample users and bookings for the current week:

```sh
nix-shell --run 'pnpm run db:seed:dev'
```

The production seed is intentionally explicit and creates only the administrator account and
permission. Run it only against the intended production database:

```sh
nix-shell --run 'pnpm run db:seed:prod'
```

## Microsoft Entra ID login

Create a **Web** redirect URI in the Entra app registration matching `ENTRA_REDIRECT_URI`, for
example `http://localhost:5173/auth`. Configure these backend environment variables:

```sh
ENTRA_CLIENT_ID=your-application-client-id
ENTRA_DIRECTORY_ID=your-directory-tenant-id
ENTRA_SECRET_ID=your-secret-id # informational only
ENTRA_VALUE=your-secret-value # the actual client secret value
ENTRA_REDIRECT_URI=http://localhost:5173/auth
SESSION_SECRET=use-a-long-random-value
FRONTEND_URL=http://localhost:5173
```

The frontend API origin can be changed with `VITE_API_URL`. The login flow uses authorization code
with PKCE, validates the token through MSAL, creates or updates the local user, and stores only a
signed, HTTP-only session cookie.

## Calendar configuration

The home page renders the reusable `src/lib/calendar.svelte` component. It loads active sites and
only the bookings in the visible date range. Day, week, month, agenda, and list views are enabled by
default, and users can combine or hide sites with the filter beside the calendar.

Pass a `config` prop to change the available views, timezone, visible hours, or site colors:

```svelte
<Calendar
	config={{
		defaultView: 'week',
		enabledViews: ['week', 'day', 'month-grid', 'month-agenda', 'list'],
		timezone: 'Europe/Stockholm',
		dayStart: '07:00',
		dayEnd: '22:00',
		siteColors: {
			'Site name': '#2563eb',
			'site-uuid': '#059669'
		}
	}}
/>
```

Colors can be keyed by site ID (preferred) or site name. The component uses a stable fallback
palette for sites without an explicit color.

## Building

To create a production version of your app:

```sh
npm run build
```

Build and start the API with:

```sh
pnpm run build:backend
pnpm run start:backend
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
