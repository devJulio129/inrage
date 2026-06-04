# InRage CrossFit — Platform & Navigation Decision

## Platform

InRage has **two coordinated frontends**, each with a clear, separate audience:

| App | Tech | Audience | Role |
|-----|------|----------|------|
| **`mobile-new/`** | **React Native (Expo)** | Atletas / clientes | **Plataforma principal del capstone.** Servicio al cliente: ver el WOD, marcar entrada/salida, perfil. |
| `admin/` | React (Vite, web) | Dueño / staff del gym | Companion. Central de mando: aprobar inscripciones, publicar el WOD, ver quién está en el box, estadísticas. |

**Decisión de capstone:** la plataforma evaluada es **React Native (móvil)**, porque la app es de uso *on-the-go* dentro del gimnasio (check-in, consultar el WOD del día desde el celular). El panel **admin web** es un complemento porque administrar clientes y escribir entrenamientos se hace mejor en pantalla grande con teclado.

Ambos consumen el **mismo backend** (Express + MongoDB), así que comparten datos en vivo: lo que el admin publica/aprueba, el atleta lo ve en su celular.

---

## Navigation pattern

### Móvil (React Native) — **Bottom tab navigator**
Patrón pulgar-amigable, estándar móvil. Dos secciones principales + un gate de autenticación:

```
┌─────────────────────────┐
│  (Auth gate)            │
│  sin sesión → Login      │
│  con sesión → Tabs       │
└─────────────────────────┘
            │
   ┌────────┴────────┐
   │  Bottom Tabs     │
   │  [ Inicio ][ Perfil ]
   └──────────────────┘
```
- **Inicio**: contenido condicional — atleta *aprobado* ve check-in + WOD; atleta *pendiente* ve aviso + info del gym.
- **Perfil**: datos del miembro, visitas, cerrar sesión.

> Razón: 2–3 secciones → bottom tabs (no drawer). El detalle (WOD) vive dentro de Inicio, así que no se necesita stack profundo todavía. (Milestone 2: stack para historial/clases.)

### Admin (React web) — **Top navbar + tabs**
Estándar web para 3–5 secciones, aprovecha la pantalla ancha:

```
┌──────────────────────────────────────────────────────────┐
│ INRAGE ADMIN   [En el gym][Estadísticas][Atletas][WOD][Accesos]   Salir │
└──────────────────────────────────────────────────────────┘
```
- **En el gym** · **Estadísticas** · **Atletas** · **WOD del día** · **Accesos**

> Razón: 5 secciones de datos → top navbar con tabs (no sidebar, que es para 8+ secciones). El login es una pantalla aparte previa al dashboard.
