# InRage CrossFit — Wireframes

Low-fidelity, una por pantalla. Para cada una: qué es lo principal, qué acciones hay, dónde vive la navegación, y los estados (loading / empty / error).

> Prompt estilo Uizard (para regenerar visualmente si se quiere):
> *Design a prototype for a CrossFit gym app called InRage. Dark theme, neon green accent, bold italic logo. Mobile (athlete): Login/Register toggle, Home with a "Check in" button and the workout-of-the-day card, Profile with avatar and stats, bottom tab bar [Inicio, Perfil]. Web admin dashboard with top navbar [En el gym, Estadísticas, Atletas, WOD, Accesos]: live presence list, KPI cards + bar charts, athlete list with status badges and an "Approve" button, a WOD editor, and a login history feed.*

---

## MÓVIL (React Native)

### 1. Login / Registro
```
┌───────────────────────────┐
│           INRAGE          │  ← logo (jerarquía #1)
│         C R O S S F I T    │
│                           │
│  [ Iniciar sesión | Crear ]│  ← toggle segmentado
│                           │
│  Correo                   │
│  [_______________________]│
│  Contraseña        [Ver]  │
│  [_______________________]│
│  (registro: Nombre, Tel,  │
│   Nacimiento DD/MM/AAAA)   │
│                           │
│  [   INICIAR SESIÓN   ]   │  ← acción principal
│  ¿Olvidaste tu contraseña?│
│  ───────── o ───────────  │
│  [  G  Continuar c/Google]│
│                           │
│  ¿No eres miembro? Crear  │
└───────────────────────────┘
Principal: entrar / crear cuenta.   Nav: ninguna (pre-auth).
Estados: error → banner rojo bajo los campos; loading → spinner en el botón.
```

### 2. Inicio — atleta APROBADO
```
┌───────────────────────────┐
│ Hola,                     │
│ Leonardo Test 💪          │
│ ┌───────────────────────┐ │
│ │  MARCAR ENTRADA AL BOX│ │ ← acción principal (verde)
│ └───────────────────────┘ │
│ WOD · MIÉRCOLES 3 JUN     │
│ ┌───────────────────────┐ │
│ │ FRAN                  │ │ ← contenido principal
│ │ 21-15-9 Thrusters /   │ │
│ │ Pull-ups · cap 10 min │ │
│ └───────────────────────┘ │
│                           │
│ [ ⌂ Inicio ] [ ◍ Perfil ] │ ← bottom tabs
└───────────────────────────┘
Tras marcar entrada: la tarjeta cambia a "ESTÁS EN EL BOX · Marcar salida".
Estados: loading → spinner; error WOD → caja "No se pudo cargar el WOD"; pull-to-refresh.
```

### 3. Inicio — atleta PENDIENTE
```
┌───────────────────────────┐
│ Hola, Pendiente Demo 💪   │
│ ┌───────────────────────┐ │
│ │ ⏳ Cuenta pendiente   │ │ ← estado/empty explicado
│ │ En revisión. Cuando   │ │
│ │ el gym te dé de alta  │ │
│ │ verás el WOD aquí.    │ │
│ └───────────────────────┘ │
│ INFORMACIÓN DEL GIMNASIO  │
│ Horarios  L-V 06-22 ...   │
│ Contacto  dirección/tel   │
│ [ ⌂ Inicio ] [ ◍ Perfil ] │
└───────────────────────────┘
Principal: avisar que falta aprobación. No hay WOD ni check-in hasta ser aprobado.
```

### 4. Perfil
```
┌───────────────────────────┐
│          ( LT )           │ ← avatar con iniciales
│       Leonardo Test       │
│      leo@inrage.dev       │
│   ● Miembro activo        │ ← chip de estado
│ ┌───────────────────────┐ │
│ │ Teléfono     833...   │ │
│ │ Nacimiento   05 may   │ │
│ │ Miembro desde 03/2025 │ │
│ │ Visitas totales  12   │ │
│ │ Rol          Atleta   │ │
│ └───────────────────────┘ │
│ [    Cerrar sesión    ]   │ ← acción
│ [ ⌂ Inicio ] [ ◍ Perfil ] │
└───────────────────────────┘
Estados: loading → spinner mientras carga /me y visitas.
```

---

## WEB ADMIN (React)

### 5. Login Admin
```
┌──────────────────────────────────────┐
│              INRAGE / ADMIN          │
│   Correo   [____________________]    │
│   Contraseña [__________]  [👁]      │
│   [        INICIAR SESIÓN        ]   │
│   Usa una cuenta con rol admin       │
└──────────────────────────────────────┘
Estados: error → "Acceso denegado: se requiere rol admin".
```

### 6. En el gym (en vivo)
```
┌──────────────────────────────────────────────────────────┐
│ INRAGE ADMIN  [En el gym][Estadísticas][Atletas][WOD][Accesos]  Salir │ ← top navbar
├──────────────────────────────────────────────────────────┤
│ En el gimnasio ahora  (2)  ● en vivo        [Actualizar]  │
│ ┌──────────────┐  ┌──────────────┐                        │
│ │● Leonardo    │  │● Ana Pérez   │  ← tarjetas presentes  │
│ │ entrada 4:11 │  │ entrada 4:28 │                        │
│ └──────────────┘  └──────────────┘                        │
└──────────────────────────────────────────────────────────┘
Principal: quién está físicamente en el box. Auto-refresca cada 8s.
Estados: empty → "Nadie ha marcado entrada hoy"; loading/error manejados.
```

### 7. Estadísticas
```
┌──────────────────────────────────────────────────────────┐
│ navbar...                                                 │
│ Estadísticas                              [Actualizar]    │
│ [En el gym][Por aprobar][Atletas][Logins 7d][WODs]  ← KPIs│
│ ┌── Logins últimos 14 días ──┐ ┌── Altas 6 meses ──┐      │
│ │ ▁▃▂▅▁▃▂  (barras)          │ │ ▂▁▁▁▅▅ (barras)    │     │
│ └────────────────────────────┘ └────────────────────┘     │
│ ┌ Estado actividad (🟢🟡🔴) ┐ ┌ Género (barras) ┐         │
└──────────────────────────────────────────────────────────┘
Principal: salud del gym de un vistazo. Estados: loading/error manejados.
```

### 8. Atletas (acceso a clientes + aprobar)
```
┌──────────────────────────────────────────────────────────┐
│ navbar...                                                 │
│ Atletas (4)                          [+ Crear atleta]     │
│ ⏳ 1 atleta esperando aprobación para ver el WOD          │ ← banner
│ ● Activo  ● Inactivo  ● Ausente   (leyenda semáforo)      │
│ ┌──────────────────────────────────────────────────────┐ │
│ │🔴 Pendiente Demo [SIN ACCESO][PENDIENTE]              │ │
│ │   correo · tel · inscrito   [Dar de alta][Editar][🗑] │ │ ← aprobar
│ ├──────────────────────────────────────────────────────┤ │
│ │🟢 Leonardo Test [ACTIVO][ALTA ✓]   [Editar][Eliminar]│ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
Principal: gestionar clientes y APROBAR inscripciones. Modal para crear/editar.
Estados: loading "Cargando atletas…"; error; (lista nunca vacía: hay admin).
```

### 9. WOD del día (publicar contenido para el móvil)
```
┌──────────────────────────────────────────────────────────┐
│ navbar...                                                 │
│ WOD del día                                               │
│ ┌── Publicar WOD de hoy ──────────────────────────────┐  │
│ │ Título   [_________________________]                │  │
│ │ Descripción [______________________]                │  │
│ │ Fecha (vacío = hoy) [______]   [Guardar WOD]        │  │
│ └─────────────────────────────────────────────────────┘  │
│ Historial reciente                                        │
│ │ 3/6  FRAN  21-15-9 …        [Editar][Eliminar]       │  │
└──────────────────────────────────────────────────────────┘
Principal: escribir el entrenamiento que verán los atletas. Estados: ok/error msg.
```

### 10. Accesos (en vivo)
```
┌──────────────────────────────────────────────────────────┐
│ navbar...                                                 │
│ Historial de accesos  ● en vivo          [Actualizar]     │
│ │ Cliente Nuevo  [CUENTA NUEVA ✦]   correo · IP   4:07   │ │
│ │ Leonardo Test  [LOGIN ✓]          correo · IP   3:08   │ │
│ │ Ana Google     [GOOGLE ✓]         correo · IP   2:08   │ │
└──────────────────────────────────────────────────────────┘
Principal: ver quién entró (login/registro/google) en vivo (auto-refresh 12s).
Estados: empty → "Sin registros aún"; loading/error manejados.
```

---

## Checklist wireframe ↔ user flow
| Pantalla | En user flow | Wireframe |
|---|---|---|
| Login/Registro (móvil) | ✓ | #1 |
| Inicio aprobado | ✓ | #2 |
| Inicio pendiente | ✓ | #3 |
| Perfil | ✓ | #4 |
| Login admin | ✓ | #5 |
| En el gym | ✓ | #6 |
| Estadísticas | ✓ | #7 |
| Atletas | ✓ | #8 |
| WOD del día | ✓ | #9 |
| Accesos | ✓ | #10 |
