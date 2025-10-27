# Render Keepalive

Minimal React + Vite runner that keeps Render-hosted backends awake by sending periodic pings through a single `useEffect`. There is no UI; everything happens as soon as the page loads.

## Requirements

- Node.js 18 or newer (tested with 22.14.0)
- npm (ships with Node)

## Quick start

```bash
npm install
npm run dev
```

Leave the dev server running. The effect will continuously ping the configured endpoints in the background and log the results to the browser console.

## Configuration

Create a `.env` file in the project root and set `VITE_PRESET_ENDPOINTS` to a comma, space, or newline separated list of URLs:

```env
VITE_PRESET_ENDPOINTS=https://service-1.onrender.com/health,https://service-2.onrender.com/ping
```

Optional: override the interval by adding `VITE_PING_INTERVAL_SECONDS` (defaults to 300 seconds, minimum 10 seconds).

```env
VITE_PING_INTERVAL_SECONDS=60
```

## Scripts

- `npm run dev` - Start the Vite dev server (runs the keepalive effect in development).
- `npm run build` - Build the production bundle.
- `npm run preview` - Preview the production build locally.

## Notes

- Requests use `fetch(url, { keepalive: true, mode: 'no-cors', cache: 'no-store' })`. Opaque responses still keep the backend warm even if they appear as failures in the console.
- Invalid URLs in `VITE_PRESET_ENDPOINTS` are skipped with a warning.
