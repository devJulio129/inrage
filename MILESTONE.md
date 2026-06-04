# InRage CrossFit — Milestones

## ✅ Milestone 1 — Núcleo funcional (HECHO)

**Backend**
- Auth JWT (login / register / me) + login con Google (endpoint listo).
- Modelo Member con `status` (`pending` / `active`) y `joinedAt`.
- WOD (workout del día): CRUD admin + `GET /today` **gateado por aprobación**.
- Asistencia: check-in / check-out / "en el gym ahora".
- Registro de accesos (login / register / google) → historial admin.
- Stats agregadas (atletas, logins, asistencia, en el gym, por aprobar, género, etc).

**Admin (web)**
- Login con identidad INRAGE.
- Atletas: CRUD, semáforo de actividad, fecha de inscripción.
- **Aprobación de altas**: badge `pendiente` + botón "Dar de alta" + banner + KPI "Por aprobar".
- WOD del día: publicar / editar / borrar.
- Accesos en vivo (login / cuenta nueva / google).
- "En el gym" en vivo + Estadísticas con gráficas.

**Móvil (Expo)**
- Login / registro propios (con fecha autoformateada) + botón Google.
- **Navegación con tabs**: Inicio y Perfil.
- Inicio: si está **aprobado** → check-in + WOD; si **pendiente** → aviso + info del gym.
- Perfil: avatar, estado, datos, visitas, cerrar sesión.
- Auto-detección de IP del backend, timeouts, manejo de errores.

---

## 🔜 Milestone 2 — Por hacer (siguiente)

### A. Google Sign-In real (alta prioridad)
- Crear OAuth Client IDs en Google Cloud (Web + iOS/Android).
- Poner el Web Client ID en `mobile-new/app.json → extra.googleClientId` y en
  `backend/.env → GOOGLE_CLIENT_ID`.
- Probar primero en web (`expo start --web`); registrar el redirect URI.
- Hoy el botón está visible y, sin configurar, muestra un aviso amable (no truena).

### B. Info del gimnasio editable desde el admin
- Hoy `mobile-new/src/components/GymInfo.js` tiene horarios/contacto **fijos**.
- Crear modelo `GymInfo` + endpoint admin para editarlos → que el móvil los lea.

### C. Perfil más completo
- Editar perfil desde el móvil (teléfono, foto).
- Historial de asistencia del atleta (sus visitas, racha).

### D. Notificaciones
- Avisar al atleta cuando el admin lo aprueba (push / al refrescar).
- Avisar cuando se publica el WOD del día.

### E. Clases / reservas (opcional, scope grande)
- Horarios de clases con cupo y reserva desde el móvil.

---

## Cómo correr (resumen)
Ver `SETUP.md`. Recuerda **reiniciar el backend** tras cambios de rutas
(`npm run dev` recarga solo). Para sembrar datos demo: `npm run seed`.
