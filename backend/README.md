# InRage Backend

Express + MongoDB API.

## Setup

```powershell
npm install
Copy-Item .env.example .env
# Edita .env y configura MONGODB_URI
npm.cmd run seed   # opcional: crea datos de ejemplo
npm.cmd run dev
```

Server runs on `http://localhost:4010`.

## Sprint 4 staging smoke test

Run the read-only MongoDB preflight:

```powershell
npm.cmd run smoke:sprint4
```

The write-enabled staging procedure and safety guards are documented in
[`docs/sprint4-smoke-test.md`](../docs/sprint4-smoke-test.md).

## Endpoints

| Method | Path                 | Description                       |
|--------|----------------------|-----------------------------------|
| GET    | `/health`            | Health check                      |
| GET    | `/api/workouts/today`| Today's WOD                       |
| GET    | `/api/workouts`      | Last 30 workouts                  |
| POST   | `/api/workouts`      | Create workout `{date,title,description}` |

## Models

- `Member` - name, email, joinedAt
- `WorkoutClass` - title, startsAt, capacity, coach
- `Workout` - date, title, description

## What's next

- Auth (members register, coaches log in to admin)
- Class booking endpoints
- Member CRUD endpoints
- Tests
