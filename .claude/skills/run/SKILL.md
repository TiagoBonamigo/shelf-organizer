---
description: Launch the shelf-organizer dev server (Fastify API + Vite SPA)
---

# Run: shelf-organizer

Two servers run in parallel via `concurrently`:
- **Fastify API** on `http://127.0.0.1:3000`
- **Vite SPA** on `http://localhost:5173` (proxies `/api` → 3000)

## Steps

### 1. Kill any existing servers on these ports

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force; "Killed PID $_" }
```

### 2. Start both servers in the background

```bash
npm run dev
```

### 3. Wait ~6 seconds, then verify the API is up

```bash
curl -s http://127.0.0.1:3000/api/state | head -c 120
```

A JSON response starting with `{"cabinets":` means Fastify is healthy. Vite starts slightly before Fastify; if you see proxy errors in the Vite output they resolve once Fastify is up.

### 4. Report URLs to the user

- API: `http://127.0.0.1:3000`
- **UI (open in browser): `http://localhost:5173`**

## Notes

- `npm run dev:server` starts Fastify only (useful when debugging the API without Vite overhead).
- `npm run dev:web` starts Vite only (useful for pure frontend work; API calls will fail unless Fastify is already running).
- The app writes state to `~/.shelf-organizer/data.json`. A fresh run seeds the library with ~120 board games if the file is empty.
