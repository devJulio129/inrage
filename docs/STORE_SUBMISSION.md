# Publicar InRage CrossFit en App Store y Google Play

Todo lo que depende del código ya está listo (icono, `app.json`, `eas.json`, política de
privacidad, gráfico de Play). Lo que falta son pasos que **solo tú puedes hacer** con tus
cuentas y tarjetas. Esta guía los lista en orden.

---

## 0. Resumen de costos y cuentas

| | Google Play | Apple App Store |
|---|---|---|
| Cuenta | Google Play Console | Apple Developer Program |
| Costo | **$25 USD** (una sola vez) | **$99 USD / año** |
| Formato del build | `.aab` (App Bundle) | build iOS de EAS |
| Equipo necesario | Cualquier PC | Cualquier PC (EAS compila en la nube; **no** necesitas Mac) |
| Tiempo de revisión | horas – 3 días | 1 – 3 días |

> El icono, los identificadores (`com.devjulio129.inrage`), la versión (1.0.0) y la firma ya
> están configurados. EAS guarda la keystore (Android) y los certificados (iOS) por ti.

---

## 1. Política de privacidad (ambas tiendas la exigen) ✅

Ya está publicada y servida por el panel admin:

**https://inrage-admin.onrender.com/privacy.html**

Usa esa URL en los formularios de ambas tiendas. (Si cambias de dominio, actualiza
`admin/public/privacy.html` y vuelve a desplegar.)

---

## 2. Capturas de pantalla (las pide ambas tiendas)

Tómalas desde la app instalada (APK) o con un simulador. Necesitas **mínimo**:

- **Android:** 2–8 capturas de teléfono (mínimo 1080×1920 aprox.).
- **iOS:** capturas de iPhone 6.7" (1290×2796) y 6.5". El asistente de App Store Connect te
  deja generar tamaños desde una sola.

Pantallas recomendadas: Inicio (clases + feed), WOD del día, Perfil (récords), Mensajes, Reservar clase.

El **feature graphic** de Google Play ya está hecho: `docs/store-assets/play-feature-graphic.png`.

---

## 3. Texto del listado (copia y pega)

**Nombre:** InRage CrossFit
**Subtítulo / frase corta (30–80 car.):** Tu box de CrossFit en el bolsillo.

**Descripción:**

> InRage CrossFit es la app oficial de nuestra comunidad. Todo lo que necesitas para tu día
> de entrenamiento, en un solo lugar:
>
> • WOD del día con tu dosis personalizada según tus récords
> • Reserva tu lugar en las clases y mira cuántos cupos quedan
> • Registra tus récords personales, tests de rendimiento y medidas
> • Marca tu entrada al box (check-in)
> • Comenta y reacciona los WODs y las publicaciones del gimnasio
> • Mensajes directos con tu coach
> • Publicaciones de educación deportiva del box
>
> Hecho con 💚 para la comunidad InRage, Tampico.

**Categoría:** Salud y forma física (Health & Fitness)
**Palabras clave (iOS):** crossfit, gimnasio, wod, fitness, entrenamiento, box, clases, records
**Email de soporte:** inragecrossfit@gmail.com
**Clasificación de contenido:** apta para todos / 4+

---

## 4. Iniciar sesión en EAS (una vez)

```bash
cd mobile-new
eas login   # si no estás logueado (usuario: schoolyardjujus)
```

---

## 5. Google Play (lo más fácil — empieza por aquí)

1. Crea la cuenta en **https://play.google.com/console** y paga los $25 USD.
2. **Create app** → nombre "InRage CrossFit", idioma español (MX), tipo App, gratis.
3. Llena: política de privacidad (URL del paso 1), categoría, capturas, feature graphic,
   cuestionario de contenido y de seguridad de datos (declara lo que dice el aviso de privacidad:
   nombre, correo, teléfono, fotos, mensajes; cifrado en tránsito; el usuario puede pedir baja).
4. Genera el build de producción (App Bundle):

   ```bash
   eas build --platform android --profile production
   ```

5. Sube el `.aab` a Play (pista **Internal testing** primero para probar, luego **Production**).
   O automatízalo:

   ```bash
   eas submit --platform android --profile production --latest
   ```
   (La primera vez te pedirá una cuenta de servicio de Google; EAS te guía:
   https://docs.expo.dev/submit/android/)

> Nota: cuentas personales nuevas de Play requieren una **prueba cerrada con 12 testers
> durante 14 días** antes de poder publicar en producción. Empieza esa prueba cuanto antes.

---

## 6. Apple App Store

1. Inscríbete en **https://developer.apple.com/programs** ($99/año).
2. En **App Store Connect** (https://appstoreconnect.apple.com) → **+ → New App**:
   - Plataforma iOS, nombre "InRage CrossFit", idioma español (México)
   - Bundle ID: `com.devjulio129.inrage` (regístralo en Certificates, Identifiers & Profiles si no aparece)
   - SKU: `inrage-crossfit`
3. Llena la ficha: descripción, capturas, política de privacidad (URL del paso 1),
   categoría, y la sección **App Privacy** (mismos datos que el aviso).
4. Completa en `mobile-new/eas.json` → `submit.production.ios` tu `appleId`, `ascAppId` y
   `appleTeamId` (los ves en App Store Connect y en Membership).
5. Compila y envía:

   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios --profile production --latest
   ```
   EAS crea los certificados y el perfil por ti. El build aparece en **TestFlight**; pruébalo
   en tu iPhone y luego mándalo a revisión desde App Store Connect.

---

## 7. Actualizaciones futuras

Para una nueva versión: sube `version` en `app.json` (p. ej. 1.0.1) y vuelve a correr
`eas build` + `eas submit`. EAS incrementa `buildNumber`/`versionCode` solo (perfil production
tiene `autoIncrement`).

---

## Checklist final

- [x] Icono y splash con la marca InRage
- [x] `app.json`: identificadores, versión, permisos, cifrado declarado
- [x] `eas.json`: perfil production (AAB) + plantilla de `submit`
- [x] Política de privacidad publicada
- [x] Feature graphic de Google Play
- [ ] Cuenta Google Play ($25) — **tú**
- [ ] Cuenta Apple Developer ($99) — **tú**
- [ ] Capturas de pantalla — **tú**
- [ ] `eas build --profile production` (Android e iOS)
- [ ] `eas submit` a cada tienda
