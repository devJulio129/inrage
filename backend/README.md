# InRage Backend

Express + MongoDB API.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set MONGODB_URI
npm run seed   # optional: creates sample data
npm run dev
```

Server runs on `http://localhost:4010`.

## Endpoints

| Method | Path                 | Description                       |
|--------|----------------------|-----------------------------------|
| GET    | `/health`            | Health check                      |
| GET    | `/api/workouts/today`| Today's WOD                       |
| GET    | `/api/workouts`      | Last 30 workouts                  |
| POST   | `/api/workouts`      | Create workout `{date,title,description}` |

## Models

- `Member` — name, email, joinedAt
- `WorkoutClass` — title, startsAt, capacity, coach
- `Workout` — date, title, description

## What's next

- Auth (members register, coaches log in to admin)
- Class booking endpoints
- Member CRUD endpoints
- Tests
