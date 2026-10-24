# @rentmate/api

TypeScript API skeleton. Production requests still go to
`legacy/functions/api/index.ts`.

This package:

- Documents REST routes
- Maps every legacy `action` to a future path (including known bugs)
- Serves `GET /api/health` so local `npm run dev:api` is real

Do not reimplement trip/meter logic here until it is extracted from the
Edge Function with tests.
