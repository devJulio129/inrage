# Sprint 4 staging smoke test

Esta guia valida Sprint 4 contra MongoDB real sin borrar ni modificar miembros
existentes. El script usa datos marcados con nombres y correos que empiezan por
`[SMOKE S4 ...]` y `sprint4-smoke-...`.

## Seguridad

- Por defecto el script es de solo lectura.
- Para escribir exige estas tres variables:
  - `SPRINT4_SMOKE_ALLOW_WRITE=true`
  - `SPRINT4_SMOKE_TARGET=staging`
  - `SPRINT4_SMOKE_CONFIRM_DB` igual al nombre exacto de la base conectada.
- Se conecta con `autoIndex: false`; primero audita los documentos y despues
  crea solo el indice `reminderKey_1`, si no hay conflictos.
- El sweep recibe unicamente los IDs de los cinco miembros smoke. No procesa
  membresias reales.
- El cleanup normal borra solo notificaciones, login logs y miembros cuyos IDs
  fueron creados por esa ejecucion.
- No uses este script contra produccion.

## 0. PowerShell rapido

En Windows, abre una terminal PowerShell y entra al backend:

```powershell
cd C:\Users\Admin\OneDrive\Desktop\inrage\backend
```

Las variables se configuran asi:

```powershell
$env:NOMBRE_DE_VARIABLE = "valor"
```

No uses el formato `NOMBRE=valor npm run ...`; ese formato es de Linux/macOS y
PowerShell lo interpreta mal.

Para limpiar variables de esta terminal:

```powershell
Remove-Item Env:\SPRINT4_SMOKE_ALLOW_WRITE -ErrorAction SilentlyContinue
Remove-Item Env:\SPRINT4_SMOKE_TARGET -ErrorAction SilentlyContinue
Remove-Item Env:\SPRINT4_SMOKE_CONFIRM_DB -ErrorAction SilentlyContinue
Remove-Item Env:\SPRINT4_SMOKE_KEEP_DATA -ErrorAction SilentlyContinue
Remove-Item Env:\SPRINT4_SMOKE_API_URL -ErrorAction SilentlyContinue
Remove-Item Env:\SPRINT4_SMOKE_ADMIN_TOKEN -ErrorAction SilentlyContinue
```

## 1. Preflight de solo lectura

Apunta explicitamente a la base de staging:

```powershell
$env:MONGODB_URI = "mongodb+srv://usuario:password@cluster.mongodb.net/inrage-staging"
$env:SPRINT4_SMOKE_ALLOW_WRITE = "false"
npm.cmd run smoke:sprint4
```

La URI debe incluir el nombre de la base despues de `.net/`. Esta forma falla
porque no define base de datos:

```text
mongodb+srv://usuario:password@cluster.mongodb.net/?appName=Cluster0
```

Usa una forma como esta:

```text
mongodb+srv://usuario:password@cluster.mongodb.net/inrage-staging?appName=Cluster0
```

El resultado muestra:

- host y nombre de base;
- si la coleccion `notifications` existe;
- si existe un indice sobre `reminderKey`;
- si el indice es `unique+sparse`;
- documentos con `reminderKey` duplicado, nulo, vacio o no-string.

El preflight no crea coleccion, indice ni datos.

Si ves `No se pudo conectar a MongoDB`, revisa:

- que `MONGODB_URI` sea la URI de staging y no `mongodb://localhost:27017/...`;
- que el cluster de Atlas este encendido;
- que tu IP este autorizada en Atlas Network Access;
- que usuario y password sean correctos;
- que no necesites VPN.

El script tiene timeout de 8 segundos para no dejar la terminal colgada. Puedes
cambiarlo asi:

```powershell
$env:SPRINT4_SMOKE_MONGO_TIMEOUT_MS = "15000"
npm.cmd run smoke:sprint4
```

## 2. Resolver conflictos del indice

Los documentos antiguos sin campo `reminderKey` no son conflicto: el indice es
`sparse` y no los incluye.

El script se detiene si encuentra:

- dos documentos con el mismo `reminderKey`;
- `reminderKey: null`;
- `reminderKey: ""`;
- un valor que no sea string;
- un indice existente sobre `reminderKey` que no sea `unique+sparse`.

No hay reparacion automatica porque podria ocultar notificaciones reales.
Revisa los IDs impresos y decide por documento:

1. Conserva una sola notificacion si realmente son duplicadas.
2. En documentos antiguos donde la clave no aplica, elimina unicamente el campo
   con `$unset: { reminderKey: "" }`.
3. Vuelve a ejecutar el preflight hasta obtener cero conflictos.
4. Si existe un indice incompatible, revisa su uso antes de eliminarlo. El
   script nunca borra indices.

Ejemplo para inspeccionar una clave concreta en `mongosh`:

```javascript
db.notifications.find(
  { reminderKey: "member:type:2026-06-25" },
  { member: 1, type: 1, reminderKey: 1, metadata: 1, createdAt: 1 }
)
```

## 3. Smoke automatico con escritura acotada

Despues de confirmar el nombre mostrado por el preflight:

```powershell
$env:SPRINT4_SMOKE_ALLOW_WRITE = "true"
$env:SPRINT4_SMOKE_TARGET = "staging"
$env:SPRINT4_SMOKE_CONFIRM_DB = "inrage-staging"
npm.cmd run smoke:sprint4
```

El script crea cinco atletas:

- membresia activa;
- vence en 7 dias;
- vence manana;
- vencida;
- miembro legacy sin `membership`.

Despues:

1. valida estados y resumen de membresias;
2. ejecuta el sweep dos veces, limitado a esos cinco IDs;
3. exige 3 notificaciones en el primer sweep y 0 en el segundo;
4. agrupa por `reminderKey` y exige cero duplicados;
5. elimina sus propios datos;
6. imprime `PASS`.

## 4. Verificacion opcional contra la API desplegada

Para validar login, `/auth/me`, notificaciones y marcar como leida:

```powershell
$env:SPRINT4_SMOKE_API_URL = "https://staging-api.example.com"
npm.cmd run smoke:sprint4
```

`SPRINT4_SMOKE_API_URL` debe ser el origen, sin `/api` al final.

Para incluir endpoints admin, agrega un JWT admin temporal de staging:

```powershell
$env:SPRINT4_SMOKE_ADMIN_TOKEN = "<jwt-admin-staging>"
npm.cmd run smoke:sprint4
```

Esto valida:

- `GET /api/admin/memberships/overview`
- `GET /api/admin/memberships?search=<marker>`
- `GET /api/admin/business/overview`
- `GET /api/admin/business/athletes-risk`
- login de un miembro sin membership;
- `GET /api/auth/me`;
- `GET /api/notifications`;
- `PATCH /api/notifications/:id/read`.

El script no llama al endpoint global `run-reminders`; usa directamente el
servicio con los cinco IDs smoke.

## 5. Revision manual de admin y mobile

Para conservar temporalmente los datos:

```powershell
$env:SPRINT4_SMOKE_KEEP_DATA = "true"
npm.cmd run smoke:sprint4
```

El script imprime marker, correos, password temporal comun e IDs.

### Admin

1. Abre **Negocio** y confirma que carga sin error.
2. Abre **Membresias**.
3. Busca el marker `sprint4-smoke-...`.
4. Confirma los cinco casos, incluyendo el miembro sin `membership`.
5. Comprueba fechas, estado y listas vacias con filtros que no tengan resultados.

### Mobile

1. Inicia sesion con el miembro `NO MEMBERSHIP`.
2. Confirma que Home carga y no muestra banner.
3. Inicia sesion con `EXPIRES 7 DAYS` y confirma el banner.
4. Abre Ajustes > Notificaciones.
5. Confirma una notificacion, marcala como leida y verifica el cambio visual.

## 6. Cleanup cuando se uso KEEP_DATA

Usa exactamente los IDs impresos por el script. Primero inspecciona:

```javascript
const ids = [
  ObjectId("ID_1"),
  ObjectId("ID_2"),
  ObjectId("ID_3"),
  ObjectId("ID_4"),
  ObjectId("ID_5")
]

db.members.find(
  { _id: { $in: ids }, email: /^sprint4-smoke-/ },
  { name: 1, email: 1 }
)
```

Solo si los cinco documentos tienen el marker correcto:

```javascript
db.notifications.deleteMany({ member: { $in: ids } })
db.loginlogs.deleteMany({ member: { $in: ids } })
db.members.deleteMany({
  _id: { $in: ids },
  email: /^sprint4-smoke-/
})
```

No uses busquedas amplias ni borres por `membership.status`.

## Resultado esperado

```text
[smoke:s4] Conflictos reminderKey: 0
[smoke:s4] Keys invalidas reminderKey: 0
[smoke:s4] Primer sweep: ... created: 3
[smoke:s4] Segundo sweep: ... created: 0
[smoke:s4] PASS
```

Si el proceso termina con `FAIL`, el codigo de salida es distinto de cero y,
salvo `SPRINT4_SMOKE_KEEP_DATA=true`, intenta limpiar unicamente sus IDs.
