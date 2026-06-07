# InRage CrossFit — User Flow

Dos audiencias, un backend compartido. El atleta usa la app móvil; el dueño usa el panel admin. Lo que el admin publica/aprueba aparece en vivo en el móvil.

---

## A) Flujo del Atleta (móvil — React Native)

```
App abre
  - Sin sesión   → Login
  - Con sesión   → Inicio (tabs)

Login
  - Iniciar sesión (correo + contraseña) → Inicio
  - Crear cuenta (nombre, correo, contraseña, teléfono, nacimiento) → Inicio (estado: PENDIENTE)
  - Continuar con Google → (si está configurado) → Inicio
  - ¿Olvidaste tu contraseña? → (Milestone 2)

Inicio (tab principal)
  - Si la cuenta está PENDIENTE de aprobación:
        → Aviso "cuenta pendiente" + Información del gimnasio (horarios, contacto)
        → (el admin la aprueba desde el panel; al refrescar, se desbloquea el WOD)
  - Si la cuenta está ACTIVA:
        → Marcar entrada al box  → "Estás en el box" → Marcar salida
        → Ver WOD del día (el que publicó el admin)
  - Pull-to-refresh → recarga estado, WOD y asistencia

Perfil (tab)
  - Ver datos: nombre, estado, teléfono, nacimiento, miembro desde, visitas totales, rol
  - Cerrar sesión → vuelve a Login

Bottom tabs (siempre visibles tras login): [ Inicio ] [ Perfil ]
```

**Acción principal del atleta:** ver el WOD del día y marcar su asistencia al gimnasio.

---

## B) Flujo del Admin (web — React)

```
App abre
  - Sin sesión   → Login (requiere rol admin)
  - Con sesión   → Dashboard (pestaña "En el gym")

Login
  - Correo + contraseña → si rol = admin → Dashboard
                        → si no → "Acceso denegado"

Dashboard (top navbar, 5 pestañas)
  - En el gym    → quién está físicamente en el box AHORA (en vivo, auto-refresh)
  - Estadísticas → KPIs (en el gym, por aprobar, atletas, logins…) + gráficas
  - Atletas      → lista con semáforo de actividad + estado
        · Atleta PENDIENTE → botón "Dar de alta" → queda ACTIVO (ya puede ver el WOD)
        · Crear / Editar / Eliminar atleta
  - WOD del día  → escribir/publicar el WOD → aparece en el móvil de los atletas activos
        · Editar / borrar / ver historial
  - Accesos      → historial en vivo: login / cuenta nueva / google

  - Salir → vuelve a Login
```

**Acción principal del admin:** administrar la app del móvil — aprobar inscripciones y publicar el WOD/contenido del día.

---

## Puente entre ambos (lo que conecta las dos apps)

```
Atleta (móvil)                 Backend                 Admin (web)
─────────────                  ───────                 ──────────
Crear cuenta        ───────►   status: pending   ───►  aparece en "Atletas" + "Accesos"
                                                        admin pulsa "Dar de alta"
Refrescar Inicio    ◄───────   status: active    ◄───  (queda aprobado)
Ver WOD             ◄───────   Workout (hoy)     ◄───  admin publica el WOD
Marcar entrada      ───────►   Attendance        ───►  aparece en "En el gym" (en vivo)
Login               ───────►   LoginLog          ───►  aparece en "Accesos" (en vivo)
```

> Cada pantalla del user flow tiene su wireframe en `WIREFRAMES.md`, y cada wireframe aparece aquí.
