# InRage CrossFit — Guía de ejecución

Tres piezas: **backend** (API + MongoDB Atlas), **admin** (panel web React/Vite) y **mobile-new** (app Expo).

## 1. Backend (`backend/`)
```bash
cd backend
npm install
npm run seed     # crea usuarios demo, WOD de hoy e historial de accesos
npm start        # http://localhost:4000
```
`.env` ya contiene `MONGODB_URI` (Atlas) y `JWT_SECRET`.

**Credenciales demo:**
| Rol     | Email                | Password    |
|---------|----------------------|-------------|
| Admin   | `admin@inrage.dev`   | `admin123`  |
| Atleta  | `leo@inrage.dev`     | `member123` |

## 2. Panel admin (`admin/`)
```bash
cd admin
npm install
npm run dev      # http://localhost:5173
```
Pestañas: **Estadísticas** (KPIs + gráficas), **Atletas** (CRUD con semáforo 🟢🟡🔴 por
último acceso y fecha de inscripción), **WOD del día** (publicar/editar), **Accesos**
(historial de logins en vivo).

## 3. App móvil (`mobile-new/`)
```bash
cd mobile-new
npm install
npx expo start   # escanea el QR con Expo Go
```
- Login por **JWT** (email + password) con sesión persistente.
- Tras iniciar sesión muestra el **WOD del día** (el que publica el admin).
- Botón **Continuar con Google** (ver sección 4).

> 📱 **Dispositivo físico:** en `mobile-new/app.json` cambia `extra.apiUrl` por la IP LAN
> de tu PC, p. ej. `http://192.168.1.20:4000` (en el equipo, `localhost` apunta al teléfono).

## 4. Activar Google Sign-In (opcional)
El backend (`POST /api/auth/google`) ya valida el token de Google y crea/loguea al usuario.
Solo falta darle credenciales al cliente:

1. En **Google Cloud Console → APIs & Services → Credentials**, crea OAuth Client IDs
   (Web, y iOS/Android si harás build nativo).
2. En `mobile-new/app.json` → `expo.extra`:
   ```json
   "googleClientId": "<Web client ID>",
   "googleIosClientId": "<iOS client ID>",
   "googleAndroidClientId": "<Android client ID>"
   ```
3. En `backend/.env` añade `GOOGLE_CLIENT_ID=<Web client ID>` (valida la audiencia del token).
4. Reinicia Expo. Sin estas credenciales el botón muestra "no configurado" y nada se rompe.

## Notas
- El proyecto vive bajo **OneDrive**. Si Metro falla con `Unable to resolve module ./src/...`
  aunque el archivo exista, es porque OneDrive convirtió la carpeta en *placeholder*
  (reparse point) que Metro ignora. Solución: reconstruir esas carpetas como locales
  (mkdir + copiar los archivos dentro). Ya está corregido para `mobile-new/src`.
- La carpeta antigua `mobile/` quedó obsoleta; la app vigente es `mobile-new/`.
