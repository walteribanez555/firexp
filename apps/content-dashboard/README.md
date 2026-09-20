# content-dashboard — Firexp CMS

React + shadcn/ui content-management app for Firexp: manage series/episodes,
build the branching **flow** visually (React Flow), simulate flags, and upload
each branch's video. It talks to the **content-api** and is deployed to
**S3 + CloudFront** (`FirexpDashboardStack`).

## Run locally

```bash
npm run dev -w content-dashboard      # Vite dev server on http://localhost:5174
```

It reads the backend URL from `VITE_CONTENT_API_URL`. **Important:** the value
must **include the `/api/v1` prefix** (the dashboard hits routes directly, unlike
the relay which uses the base origin). Set it in `apps/content-dashboard/.env`:

```dotenv
# local content-api
VITE_CONTENT_API_URL=http://localhost:3003/api/v1
# or the deployed content-api
# VITE_CONTENT_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/api/v1
```

With a deployed content-api + `CONTENT_BUCKET`, uploads presign against the real
S3 bucket and serve via CloudFront (no `stub://` URLs).

## Build & host

```bash
npm run build -w content-dashboard    # tsc -b + vite build → dist/
```

The SPA bakes `VITE_CONTENT_API_URL` at **build time**, so build with the target
content-api URL before hosting. Hosting is CDK:

```bash
# builds against the deployed content-api and uploads dist/ to S3 + CloudFront
cd infra/cdk && npx cdk deploy FirexpDashboardStack -c dashboard=true --require-approval never
```

The `Deploy (CDK)` GitHub Action does this automatically after the content stack.
See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

## Structure

```
src/
  app/            Layout + Sidebar (series accordion, search, category tabs) + router
  features/
    series/       series/episode CRUD (dialogs, schema)
    flow/         React Flow editor (nodes, NodeEditPanel, SimulatePanel, node-actions)
    uploads/      S3 presign + multipart upload hook + VariantUploader (used in the flow)
  components/ui/  shadcn primitives
  lib/            api-client, query-client, utils
```

The flow editor uses the shared `@fire-stick/story-graph` engine for the flag
simulator and static validation ("fake choice" / shadowed-variant warnings).
