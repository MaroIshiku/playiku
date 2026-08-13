# Direct dependency decisions

The generated standard profile supplies Fastify, React, TanStack Router, React Hook Form, Zod, SQLite/Drizzle, Vitest, Playwright, and axe-core. Versions are exact and the complete graph is locked by `package-lock.json`.

`@fastify/static` 10.1.3 is the only product-specific addition. It serves the Vite build from the same origin and is compatible with Fastify 5. The selected release includes the canonical-path security fix introduced after versions through 10.1.1. It is MIT licensed, maintained by the Fastify project, adds no external service, and can be removed if static delivery moves to a reverse proxy. The runtime CVE scan and npm audit are release gates.
