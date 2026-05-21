# InRage

Gym management platform. Three packages:

- **backend** — Node + Express + MongoDB + Mongoose. REST API consumed by both clients.
- **mobile** — React Native (Expo). Client-facing app for gym members.
- **admin** — React (Vite). Web panel for gym staff to manage members, classes, and workouts.

## Quick start

Each package has its own README. In short:

```bash
# Backend (port 4000)
cd backend && npm install && npm run dev

# Mobile (Expo)
cd mobile && npm install && npm start

# Admin (port 5173)
cd admin && npm install && npm run dev
```

You need a MongoDB instance. Easiest: MongoDB Atlas free tier. Copy `backend/.env.example` to `backend/.env` and fill in your `MONGODB_URI`.

## Data model (MVP)

Three collections, minimal:

- **Member** — name, email, joinedAt
- **WorkoutClass** — title, startsAt, capacity, coach
- **Workout** — date, title, description (the WOD of the day)

No auth yet. No relationships yet. Just enough to have one working endpoint and one working screen.

## Status

- [x] Monorepo structure
- [x] Backend with three models
- [x] `GET /api/workouts` returns today's workout
- [x] Mobile screen shows today's workout
- [ ] Admin UI (scaffolded only)
- [ ] Auth
- [ ] Member registration flow
- [ ] Class booking
- [ ] Deployment
