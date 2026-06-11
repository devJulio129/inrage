# InRage

Gym management platform for small CrossFit boxes. Mobile-first, with a separate web panel for gym staff.

Built as the capstone project for the Circuit Stream / UBC Extended Learning Full-Stack Software Development bootcamp. First real user: InRage CrossFit, a box in Tampico, Mexico.

---

## Live demo

| Piece | URL |
|-------|-----|
| Backend API | https://inrage-backend.onrender.com ([health check](https://inrage-backend.onrender.com/health)) |
| Admin panel | https://inrage-admin.onrender.com |
| Mobile app | Run with Expo Go — see [Quick start](#quick-start) — or build with EAS |

> Both services run on Render's free tier: the first request after a quiet period takes ~30–60 s to wake the service up. Hit the health check first.

📓 **[Development log (devlog)](docs/DEVLOG.md)** — weekly progress, challenges, and learnings across the four capstone weeks.

---

## What it does

**For members** (mobile app)
- Sign up (self-service) and log in — email/password or Google
- See today's WOD (workout of the day)
- Check in and check out of the gym
- View gym info: schedule, address, announcements
- Profile: photo, membership status, total visits
- Personal records — Olympic lifting, powerlifting, gymnastics movements

**For gym staff** (admin web panel)
- Log in
- Approve new member registrations ("Dar de alta")
- View all members and their last login
- Publish today's WOD
- Edit gym info: name, schedule, address, phone, Instagram, daily announcement
- Access log: view all login / register events in real time

---

## Architecture

Monorepo with three packages:

```
inrage/
├── backend/      → Node + Express + MongoDB + Mongoose. REST API.
├── mobile-new/   → React Native (Expo SDK 54). Members.
└── admin/        → React 18 + Vite. Gym staff.
```

Both clients consume the same REST API. JWT is used for authentication.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Mobile client | React Native 0.81, Expo SDK 54, React 19 |
| Admin web | React 18, Vite 5 |
| Backend | Node.js, Express 4 |
| Database | MongoDB Atlas + Mongoose 8 |
| Auth | JWT + bcrypt + Passport.js (passport-jwt) |
| Google sign-in | Expo Auth Session + Google tokeninfo endpoint |
| Testing | Node native test runner (`node --test`) |
| Containers | Docker + docker-compose (backend + admin/nginx) |
| Deployment (backend) | Render (web service) |
| Deployment (admin) | Render (static site) |
| Deployment (mobile) | Expo Go (dev), EAS Build (production) |

---

## Data model

Six collections:

- **Member** — `name`, `email`, `password` (hashed), `role` (`member` / `admin`), `status` (`pending` / `active`), `phone`, `birthDate`, `gender`, `avatar` (base64), timestamps
- **LoginLog** — `member` (ref), `name`, `email`, `role`, `event` (`login` / `register` / `google`), `ip`, `at`
- **Workout** — `date`, `title`, `description`, `type` (`For Time` / `AMRAP` / `EMOM` / etc.)
- **GymInfo** — `name`, `announcement`, `scheduleText`, `address`, `phone`, `instagram`
- **Attendance** — `member` (ref), `checkIn`, `checkOut`
- **PR** — `member` (ref), `movement` (slug), `value`, `unit` (`kg` / `lb` / `reps`), `setAt`; unique on `{ member, movement }`

---

## Quick start

You'll need: Node 20+, npm, and a MongoDB Atlas connection string (free M0 tier works).

### 1. Clone and set up env

```bash
git clone <repo-url> inrage
cd inrage
cp backend/.env.example backend/.env
# Fill in MONGODB_URI and JWT_SECRET
```

### 2. Backend (port 4000)

```bash
cd backend
npm install
npm run dev
```

Health check: `http://localhost:4000/health` → `{ "status": "ok" }`.

### 3. Mobile (Expo)

```bash
cd mobile-new
npm install
npx expo start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR with Expo Go.

> The app auto-detects your machine's LAN IP from the Metro host — no manual IP config needed on a real phone.

### 4. Admin web (port 5173)

```bash
cd admin
npm install
npm run dev
```

Open `http://localhost:5173`. Log in with an account that has `role: "admin"`.

### Alternative: Docker

Run the backend + admin with one command (still needs `backend/.env` with your Atlas URI):

```bash
docker compose up --build
```

Backend on `http://localhost:4000`, admin on `http://localhost:80`.

---

## Testing

The backend has a unit/integration test suite built on Node's native test runner — no extra test dependencies.

```bash
cd backend
npm test
```

What's covered:

- **Middleware in isolation** — `adminOnly` role gate, `errorHandler` status/message mapping, `notFound`.
- **JWT contract** — token round-trip, 7-day expiry, rejection of tampered / expired / wrong-secret tokens.
- **HTTP surface** — the real Express app on an ephemeral port: `/health`, 404 handling, 401 on every protected route without a token, and auth input validation. No database connection required.

---

## Environment variables

`backend/.env`:

```
PORT=4000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=replace-with-a-long-random-string
GOOGLE_CLIENT_ID=          # optional — only needed to validate Google tokens server-side
CORS_ORIGIN=               # optional — comma-separated prod URLs; dev allows all origins
```

---

## API reference

All routes are prefixed with `/api`. Routes marked 🔒 require `Authorization: Bearer <token>`. Routes marked 👑 also require `role: "admin"`.

### Auth

| Method | Route | Body | Returns |
|--------|-------|------|---------|
| `POST` | `/auth/register` | `{ name, email, password, phone, birthDate, gender }` | `{ user, token }` |
| `POST` | `/auth/login` | `{ email, password }` | `{ user, token }` |
| `POST` | `/auth/google` | `{ idToken }` | `{ user, token }` |
| `GET` | `/auth/me` | — | 🔒 current user object (includes avatar) |
| `PATCH` | `/auth/avatar` | `{ avatar }` (data-URI) | 🔒 `{ ok: true }` |

### Members

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/members` | 🔒 👑 List all members (no avatar, includes lastLogin) |
| `POST` | `/members` | 🔒 👑 Create member (admin-created, status: active) |
| `GET` | `/members/:id` | 🔒 Own profile or admin |
| `PUT` | `/members/:id` | 🔒 Update (non-admins cannot change role/status) |
| `DELETE` | `/members/:id` | 🔒 👑 |

### Workouts

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/workouts/today` | 🔒 Today's WOD |
| `POST` | `/workouts` | 🔒 👑 Publish a WOD |

### Gym Info

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/gym-info` | 🔒 Public gym info + daily announcement |
| `PUT` | `/gym-info` | 🔒 👑 Update gym info |

### Attendance

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/attendances/me` | 🔒 Own attendance history + total visits |
| `POST` | `/attendances/checkin` | 🔒 Check in |
| `POST` | `/attendances/checkout` | 🔒 Check out |

### Login Logs

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/login-logs` | 🔒 👑 Last 200 access events (member.status populated) |

### Personal Records (PRs)

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/prs` | 🔒 All PRs for the current user |
| `PUT` | `/prs/:movement` | 🔒 Upsert a PR. Body: `{ value, unit }` |
| `DELETE` | `/prs/:movement` | 🔒 Delete a PR |

---

## Project status

| Feature | Status |
|---------|--------|
| Backend — auth (email + Google) | ✅ |
| Backend — member approval flow | ✅ |
| Backend — WOD | ✅ |
| Backend — gym info + announcements | ✅ |
| Backend — attendance / check-in | ✅ |
| Backend — personal records (PRs) | ✅ |
| Backend — login logs | ✅ |
| Mobile — login + register (email + Google) | ✅ |
| Mobile — home / WOD / gym info | ✅ |
| Mobile — check-in / check-out | ✅ |
| Mobile — profile + avatar | ✅ |
| Mobile — personal records | ✅ |
| Admin — member approval ("Dar de alta") | ✅ |
| Admin — WOD management | ✅ |
| Admin — gym info editor | ✅ |
| Admin — access log (Accesos) | ✅ |
| Backend — unit tests (`npm test`) | ✅ |
| Docker (backend + admin + compose) | ✅ |
| Deployment to Render | ✅ |

---

## Future improvements

- Class scheduling and reservation system
- Payments and membership billing
- Push notifications (planned post-MVP via Expo Push)
- Social features (community feed, leaderboards)
- Multi-gym support (MVP runs one gym per deployment)
- A member-facing web app (members are mobile-only by design)

---

## Brand

Dark mode by default. Primary palette:

- `#0D0D0D` — base background
- `#1A1A1A` — surface alt
- `#2A2A2A` — surface (cards)
- `#46E22A` — neon green (accent / CTAs)
- `#E8D5B7` — beige (primary text)
- `#A47864` — mocha (secondary accent)

---

## License

Private project. Not open for redistribution at this stage.
