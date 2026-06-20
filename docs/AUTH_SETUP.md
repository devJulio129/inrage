# Login con Google y Apple — pasos para activarlo

El **código ya está completo** (móvil + backend). Falta solo pegar tus credenciales
y hacer un build nuevo. Google y Apple **no funcionan en Expo Go** — necesitas un
build de desarrollo o standalone (`eas build`).

Bundle ID iOS / package Android: `com.devjulio129.inrage`

---

## 1. Apple (Sign in with Apple)

Ya estás inscrito, así que es lo más rápido:

1. **Capacidad del App ID**: en [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list),
   abre `com.devjulio129.inrage` y activa **Sign In with Apple**.
   (EAS también puede activarla solo al correr `eas build -p ios` y aceptar la
   gestión de credenciales.)
2. **Backend**: nada obligatorio. El `aud` del token es el bundle ID y ya es el
   default. Si algún día agregas un Services ID (login web), ponlos así:
   ```
   APPLE_CLIENT_ID=com.devjulio129.inrage,com.devjulio129.inrage.web
   ```
3. Ya está: `app.json` tiene `ios.usesAppleSignIn: true` y el plugin
   `expo-apple-authentication`. El botón sale solo en iOS.

> Recordatorio de App Store: ofrecer Google en iOS **obliga** a ofrecer Apple.
> Por eso el botón de Apple va arriba del de Google. Ya cumple.

---

## 2. Google

En [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
en el mismo proyecto donde ya creaste el client de Android:

### a) Client de iOS
- **Create credentials → OAuth client ID → iOS**
- Bundle ID: `com.devjulio129.inrage`
- Copia el **iOS client ID** → `mobile-new/app.json` → `extra.googleIosClientId`
- Copia el **iOS URL scheme** (el "reversed client ID", algo como
  `com.googleusercontent.apps.123456-abc`) y agrégalo a `app.json`:
  ```json
  "ios": {
    "infoPlist": {
      "CFBundleURLTypes": [
        { "CFBundleURLSchemes": ["com.googleusercontent.apps.TU-REVERSED-ID"] }
      ]
    }
  }
  ```

### b) Client Web (para Expo Go / web y para que el backend valide el token)
- **Create credentials → OAuth client ID → Web application**
- Copia el **Web client ID** → `app.json` → `extra.googleClientId`

### c) Backend — audiencias permitidas
En el `.env` del backend (y en Render) pon **los tres** IDs separados por coma:
```
GOOGLE_CLIENT_ID=<ANDROID_ID>,<IOS_ID>,<WEB_ID>
```
El server acepta el token venga de la plataforma que venga.

---

## 3. Variables de entorno (resumen)

`backend/.env` y **Render → backend → Environment**:
```
GOOGLE_CLIENT_ID=<android>,<ios>,<web>
APPLE_CLIENT_ID=com.devjulio129.inrage   # opcional (es el default)
```

`mobile-new/app.json → expo.extra`:
```
"googleClientId":        "<web client ID>",
"googleIosClientId":     "<iOS client ID>",
"googleAndroidClientId": "<android client ID>"   // ya está puesto
```

---

## 4. Build para probar

```
cd mobile-new
eas build --profile development --platform ios      # o android
```
Instala el build (no Expo Go), abre Login y verás:
- **iOS**: botón negro/blanco de Apple + botón de Google.
- **Android**: botón de Google.

En la pestaña **Accesos** del admin cada entrada sale etiquetada
`apple ✓` / `google ✓` / `login ✓`.
