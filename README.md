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

It listens on `http://localhost:3001` by default. The API exposes
`GET /api/health`, `GET /api/users`, and `POST /api/users`. Set `PORT` or
`HOST` to change the bind address. User routes use the Prisma schema and
require `DATABASE_URL` to be set.

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
