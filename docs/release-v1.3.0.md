# InRage v1.3.0-RC2 Release Notes

Fecha objetivo: 2026-06-28

Estado RC2:

- QR check-in tiene cobertura automatizada y tolerancia de minuto anterior, pero requiere prueba final con camara en dispositivo fisico.
- Push requiere app real/dev build con credenciales correctas; el export no prueba entrega real.
- Email requiere Resend o SMTP configurado; sin proveedor debe fallar claro y no simular envio.
- Mobile muestra `1.3.0-RC2` en Cuenta > Acerca de mediante `extra.releaseLabel`.

## Incluye

- Reservas por sucursal para Torres y Central.
- Calendario de clases filtrable por sucursal.
- Clase especial destacada en Home con reserva y refresh.
- Recuperacion de acceso por email y soporte manual por WhatsApp.
- Notificaciones push reales con preferencias, prompt inicial, jobs internos y manejo de recibos.
- Check-in por QR rotativo por sucursal desde el panel admin.
- Check-in mobile por QR con auto-reserva cuando el atleta no tenia reserva previa.
- Roster admin con origen de asistencia: reserva previa o agregado por QR.
- Versiones backend/admin/mobile alineadas en `1.3.0`.

## No Incluye

- Stripe, pagos, wallet, NFC o facturacion automatica.
- Feed social grande o upload nuevo.
- Push notifications avanzadas con segmentacion compleja.
- Nuevos flujos de membresia pagada.

## Variables De Entorno

Backend:

```env
MONGO_URI=mongodb://localhost:27017/inrage
MONGODB_URI=mongodb://localhost:27017/inrage
JWT_SECRET=change_me
SUPPORT_WHATSAPP_NUMBER=528334305108

# Email: configurar Resend o SMTP.
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Inrage <no-reply@inrage.mx>"
PUBLIC_WEB_URL=https://tu-web
APP_PUBLIC_URL=inrage://
ADMIN_PUBLIC_URL=https://tu-admin

# Push.
PUSH_NOTIFICATIONS_ENABLED=true
EXPO_ACCESS_TOKEN=
NOTIFICATION_JOB_SECRET=

# QR rotativo.
CHECKIN_QR_SECRET=long_random_secret
CHECKIN_QR_WINDOW_MINUTES_BEFORE=45
CHECKIN_QR_WINDOW_MINUTES_AFTER=15
CHECKIN_QR_DEBUG=false
```

Notas:

- `.env` debe permanecer fuera de git. Usa `.env.example` como plantilla.
- `CHECKIN_QR_SECRET` debe ser largo, privado y distinto por ambiente.
- Cambiar `CHECKIN_QR_SECRET` invalida QRs activos.
- `CHECKIN_QR_DEBUG=true` imprime branch, token fingerprint, scannedAt, classId y status sin exponer secretos ni HMAC completo.
- Si `PUSH_NOTIFICATIONS_ENABLED=false`, los jobs no envian a Expo.
- En mobile, `extra.releaseLabel=1.3.0-RC2` controla la version visible de Cuenta.

## Pruebas Manuales

### WhatsApp

1. Configurar `SUPPORT_WHATSAPP_NUMBER=528334305108`.
2. Abrir `GET /api/support/whatsapp-link`.
3. Confirmar `configured=true`, URL `wa.me` y mensaje prellenado.
4. En mobile/admin, abrir "Contactar soporte por WhatsApp".
5. Confirmar que no se agregan tokens, passwords ni links de reset.

### Email

1. Configurar `RESEND_API_KEY` o SMTP.
2. Iniciar backend.
3. Como admin, llamar `POST /api/admin/test-email`.
4. Probar forgot password desde mobile y admin.
5. Confirmar email recibido, reset exitoso y token no reutilizable.
6. Si falta proveedor, debe responder "Email provider not configured".

### Calendario Por Sucursal

1. Crear clases en Torres y Central.
2. Probar `GET /api/classes?branch=Torres`.
3. Probar `GET /api/classes?branch=Central`.
4. Probar `GET /api/classes/calendar?branch=Torres`.
5. Confirmar que mobile muestra sucursal en cards y que reservas no cruzan sucursal.

### QR Check-In Rotativo

1. En admin, abrir Check-in.
2. Seleccionar Torres y confirmar QR grande con cuenta regresiva.
3. Cambiar a Central y confirmar token distinto.
4. Confirmar que el QR cambia al siguiente minuto y que fullscreen muestra el mismo valor.
5. Desde mobile, escanear QR con reserva vigente en la misma sucursal.
6. Confirmar check-in y roster con "Reserva previa".
7. Escanear sin reserva y confirmar auto-reserva a la clase disponible mas cercana.
8. Confirmar roster con "Agregado por QR".
9. Escanear 14 minutos despues del inicio: debe entrar a esa clase.
10. Escanear 16 minutos despues del inicio: debe ir a la siguiente clase disponible.
11. Confirmar que una clase llena se salta y se usa la siguiente disponible.
12. Escanear QR expirado: debe fallar con mensaje claro.
13. Escanear QR invalido: debe fallar con mensaje claro.
14. Escanear QR de sucursal incorrecta con reserva activa y confirmar error claro.
15. Confirmar que no se duplica asistencia al escanear otra vez.

### Visual Mobile RC2

1. Home/Hoy: fondo premium oscuro, nombre grande, INRAGE legible, WOD, stats y publicaciones claros.
2. Reservas: header RESERVAS, dias en cards, sucursal Torres/Central, cards de clases con hora grande y CTA verde.
3. WOD: header WOD, calendario, card del WOD y progreso.
4. WOD detalle: tabs Resumen/Detalle/Comentarios, bloques y registrar resultado.
5. Progreso: perfil atleta, badges, stats y acordeones por categoria.
6. Cuenta: header CUENTA, perfil, gimnasio, sesion, tema, notificaciones y version `1.3.0-RC2`.
7. Cambiar a dark: toda la pantalla debe verse dark.
8. Cambiar a light: fondos, cards, inputs, textos y tabbar deben cambiar sin mezcla rara.
9. No usar azul/rojo como colores principales; rojo solo para errores/logout.

### Push

1. Configurar `PUSH_NOTIFICATIONS_ENABLED=true`.
2. En mobile, hacer login y aceptar el prompt inicial de notificaciones.
3. Rechazar con "Ahora no" y confirmar que no pregunta en cada inicio.
4. Activar despues desde Cuenta > Notificaciones.
5. Confirmar dispositivo registrado en preferencias.
6. Correr recordatorios desde admin o `npm run jobs:notifications`.
7. Enviar notificacion de prueba desde admin.
8. Confirmar logs de notificacion en backend.
9. Si Expo reporta `DeviceNotRegistered`, el token debe quedar desactivado.

## Verificacion De Release

```bash
cd backend
npm test

cd ../admin
npm run build

cd ../mobile-new
npx expo export --platform android --output-dir .expo-v1-3-0-rc2-verify
```

Despues del export, borrar `.expo-v1-3-0-rc2-verify`.

## Notas Tecnicas

- El QR admin usa `GET /api/admin/checkin-qr?branch=Torres|Central`.
- El check-in mobile usa `POST /api/attendances/check-in/qr`.
- El token QR firma version, tipo, sucursal y minuto con HMAC SHA-256.
- La validacion acepta el minuto actual y el minuto anterior para tolerar latencia real de escaneo.
- La ventana de check-in es configurable antes/despues del inicio; para RC2 el default local es 45 minutos antes y 15 minutos despues.
- Si el atleta tiene reserva dentro de esa ventana, el QR prioriza esa clase reservada.
- Si la reserva esta demasiado lejos de la hora real de llegada, el QR busca una clase cercana disponible en la misma sucursal, cancela la reserva lejana y registra el check-in en la clase cercana.
- Las reservas creadas por QR se marcan con `source=qr_auto` y `autoReservedByQr=true`.
- Push usa los tickets/receipts de Expo para detectar errores permanentes.
- Los copies de mobile no mencionan Expo, FCM, APNs, tokens o dev builds al usuario final.

## Pendientes Sugeridos Para v1.4

- QA visual completo de dark/light en todos los screens legacy.
- Dashboard admin de salud de notificaciones y tokens desactivados.
- Mejoras de auditoria para cambios manuales en reservas.
- Pruebas E2E con dispositivo fisico para camara, push y links externos.
