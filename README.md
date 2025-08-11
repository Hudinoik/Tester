# Shul Directory (Node + SQLite)

Mobile-friendly directory of shuls with minyan times.
- Public list/search
- Manager portal (edit only their shul)
- Admin portal (create shuls and managers)
- Single service deploy (serves frontend + backend)

## Local Run

```bash
cd backend
npm install
npm start
# open http://localhost:3000
```

Seed admin and shul are created automatically on first run if you set env vars.
Create a `.env` (optional for local) or set environment variables:

- `SECRET=some_long_random_string`
- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD=StrongPass123`
- `ADMIN_SHUL_NAME="My First Shul"`
- `ADMIN_SHUL_ADDRESS="123 Road"`
- `DB_PATH` (optional, default is ./db.sqlite)

## Render.com Deploy (single service)

- Build Command: `cd backend && npm install`
- Start Command: `cd backend && npm start`
- Add environment variables as above.
- (Recommended) Add a **Persistent Disk** and set `DB_PATH=/data/db.sqlite`.

## Pages

- `/` — public directory
- `/login.html` — manager login
- `/manager.html` — edit own shul
- `/admin.html` — admin dashboard (login, add shul, create managers)
