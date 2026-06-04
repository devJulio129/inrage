# InRage CrossFit — Deployment

Tres piezas: **backend** (API), **admin** (web) y **mobile** (Expo). Backend y admin van a **Render**; el móvil se comparte por **Expo Go / EAS**.

---

## 0. Antes de empezar
- Sube el repo a GitHub.
- Ten a la mano tu `MONGODB_URI` de Atlas y un `JWT_SECRET`.
- En Atlas, en **Network Access**, permite el acceso (0.0.0.0/0 para pruebas).

## 1. Backend → Render (Web Service)
Opción rápida: usa el **Blueprint** (`render.yaml` en la raíz) → en Render: **New + → Blueprint**.

Manual:
- New + → **Web Service** → conecta el repo.
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/health`
- **Environment variables:**
  | key | value |
  |-----|-------|
  | `MONGODB_URI` | tu URI de Atlas |
  | `JWT_SECRET` | tu secreto |
  | `NODE_ENV` | `production` |
  | `CORS_ORIGIN` | la URL del admin desplegado (cuando la tengas) |
- Render asigna `PORT` solo — el server ya lo lee (`process.env.PORT`).
- Al terminar tendrás algo como `https://inrage-backend.onrender.com`. Pruébalo: `…/health`.

## 2. Admin → Render (Static Site)
- New + → **Static Site** → conecta el repo.
- **Root Directory:** `admin`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- **Environment variable:** `VITE_API_URL = https://inrage-backend.onrender.com`
- **Rewrite** (SPA): Source `/*` → Destination `/index.html`.
- Te dará algo como `https://inrage-admin.onrender.com`.

> Después de tener la URL del admin, ponla en `CORS_ORIGIN` del backend y vuelve a desplegar el backend.

## 3. Mobile → Expo
- En `mobile-new/app.json` → `expo.extra.apiUrl`, pon la URL del backend de Render:
  `"apiUrl": "https://inrage-backend.onrender.com"`
  (En dev se queda `http://localhost:4000`; el cliente auto-detecta la IP de la PC.)
- `npx expo start` → comparte el **link de Expo Go** (o el QR) para el capstone.
- Build nativo opcional: `eas build` (ver docs de Expo).

---

## Checklist previo al deploy
- [ ] Variables de entorno puestas en Render (no solo en `.env` local).
- [ ] `VITE_API_URL` (admin) y `extra.apiUrl` (móvil) apuntan al backend de Render.
- [ ] `CORS_ORIGIN` del backend incluye la URL del admin desplegado.
- [ ] Atlas permite conexiones entrantes.
- [ ] `/health` del backend responde `{ "status": "ok" }`.

## URLs en producción (rellenar al desplegar)
- Backend:  `https://__________.onrender.com`
- Admin:    `https://__________.onrender.com`
- Mobile:   Expo Go link / QR
