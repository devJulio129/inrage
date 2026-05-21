# InRage

Gym management platform for small CrossFit boxes. Mobile-first, with a separate web panel for gym staff.

Built as the capstone project for the Circuit Stream / UBC Extended Learning Full-Stack Software Development bootcamp. First real user: InRage CrossFit, a box in Tampico, Mexico.

---

## What it does

**For members** (mobile app)
- Sign up and log in
- See the week's class schedule with time, coach, and remaining capacity
- Reserve a spot in a class
- Cancel a reservation (up to 2 hours before the class starts)
- See today's WOD (workout of the day)
- See their own upcoming and past bookings

**For gym staff** (admin web panel)
- Log in
- Create, edit, and cancel classes
- Publish today's WOD
- Manage member accounts

---

## Architecture

Monorepo with three packages:

```
inrage/
├── backend/    → Node + Express + MongoDB + Mongoose. REST API.
├── mobile/     → React Native (Expo). Members.
└── admin/      → React + Vite. Gym staff.
```

Both clients consume the same REST API. JWT is used for authentication; the same token format works for both apps.

See `docs/InRage_Architecture.excalidraw` for the system, frontend, and backend diagrams.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Mobile client | React Native (Expo), React Navigation |
| Admin web | React 18, Vite, React Router |
| Backend | Node.js, Express |
| Database | MongoDB Atlas + Mongoose |
| Auth | JWT + bcrypt |
| Deployment (backend) | Render (web service) |
| Deployment (admin) | Render (static site) |
| Deployment (mobile) | Expo Go (dev), EAS Build (production) |

---

## Data model

Four collections:

- **User** — `name`, `email`, `password` (hashed), `role` (`member` / `admin`)
- **Class** — `title`, `coach`, `startsAt`, `capacity`, `bookings` (array of User refs)
- **Booking** — `userId`, `classId`, `createdAt`, `status` (`confirmed` / `cancelled`)
- **Workout** — `date`, `title`, `description`, `type` (`For Time` / `AMRAP` / `EMOM` / etc.)

---

## Quick start

You'll need: Node 20+, npm, and a MongoDB Atlas connection string (the free M0 tier works).

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

Health check: `http://localhost:4000/api/health` should return `{ "status": "ok" }`.

### 3. Mobile (Expo)

```bash
cd mobile
npm install
npm start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR with Expo Go.

> **Connecting from a real phone:** `localhost` from the phone means the phone itself, not your laptop. Set `EXPO_PUBLIC_API_URL` to your laptop's LAN IP:
> ```bash
> EXPO_PUBLIC_API_URL=http://192.168.1.42:4000 npm start
> ```

### 4. Admin web (port 5173)

```bash
cd admin
npm install
npm run dev
```

Open `http://localhost:5173`. Log in with an account that has `role: "admin"`.

---

## Environment variables

`backend/.env`:

```
PORT=4000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

`mobile/.env` (optional):

```
EXPO_PUBLIC_API_URL=http://localhost:4000
```

`admin/.env` (optional):

```
VITE_API_URL=http://localhost:4000
```

---

## API reference (MVP)

All routes are prefixed with `/api`. Routes marked 🔒 require a valid JWT in the `Authorization: Bearer <token>` header. Routes marked 👑 also require `role: "admin"`.

### Auth

| Method | Route | Body | Returns |
|--------|-------|------|---------|
| `POST` | `/auth/register` | `{ name, email, password }` | `{ user, token }` |
| `POST` | `/auth/login` | `{ email, password }` | `{ user, token }` |

### Classes

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/classes` | 🔒 List upcoming classes (next 7 days by default) |
| `POST` | `/classes` | 🔒 👑 Create a class |
| `PUT` | `/classes/:id` | 🔒 👑 Edit a class |
| `DELETE` | `/classes/:id` | 🔒 👑 Cancel a class |

### Bookings

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/bookings/me` | 🔒 The current user's bookings |
| `POST` | `/bookings` | 🔒 Reserve a spot. Body: `{ classId }` |
| `DELETE` | `/bookings/:id` | 🔒 Cancel a reservation (must be ≥ 2h before class) |

### Workouts (WOD)

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/workouts/today` | 🔒 Today's WOD |
| `POST` | `/workouts` | 🔒 👑 Publish a WOD |

---

## Project status

| Milestone | Status |
|-----------|--------|
| Project proposal (Class 1) | ✅ |
| Architecture diagrams (Class 2) | ✅ |
| Monorepo scaffolding | ✅ |
| Backend — models + auth routes | 🟡 In progress |
| Backend — classes + bookings | ⬜ |
| Mobile — login + schedule screen | ⬜ |
| Admin — class management page | ⬜ |
| Deployment to Render | ⬜ |
| First real user (brother's gym) | ⬜ |

---

## Out of scope (for now)

- Payments and membership billing
- Push notifications (planned post-MVP via Expo Push)
- Social features (community feed, friends, leaderboards)
- Workout history and progress tracking
- Multi-gym support (the MVP runs one gym per deployment)
- A member-facing web app (members are mobile-only by design)

---

## Brand

Dark mode by default. Primary palette:

- `#0D0D0D` — base background
- `#1A1A1A` — surface
- `#00FF41` — neon green (accent / CTAs)
- `#E8D5B7` — beige (secondary text)
- `#A47864` — mocha (labels, decorative)

---

## License

Private project. Not open for redistribution at this stage.
