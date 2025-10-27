# Render Keepalive

Small React + Vite frontend that keeps Render-hosted backends awake by sending periodic pings. The UI is optional—endpoints can be pre-seeded through configuration so the page starts monitoring as soon as it loads.

## Requirements

- Node.js 18 or newer (tested with 22.14.0)
- npm (ships with Node)

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL and add any Render backend URLs you want to keep warm. The app will regularly ping each endpoint and show the most recent status, latency, and errors.

## Preloading endpoints (recommended)

Create a `.env` file in the project root and set `VITE_PRESET_ENDPOINTS` to a comma, space, or newline separated list of URLs:

```env
VITE_PRESET_ENDPOINTS=https://service-1.onrender.com/health,https://service-2.onrender.com/ping
```

Preset URLs are merged with anything stored in `localStorage`, so they reappear after refresh or deployments. Clearing the list from the UI reverts back to the preset values.

## Scripts

- `npm run dev` – Start the Vite dev server with hot reload.
- `npm run build` – Type-check with TypeScript and build the production bundle.
- `npm run preview` – Preview the production build locally.

## Notes

- Requests are sent with `fetch(..., { keepalive: true, mode: 'no-cors' })`. Some services may report failures in the UI due to CORS, but the ping still reaches the backend.
- The minimum interval is 10 seconds to avoid overwhelming downstream services.
