# Week 3 — Capstone (Frontend) · Estado

| Ítem | Estado | Dónde |
|------|--------|-------|
| Platform decided (React web / React Native) | ✅ | `docs/PLATFORM_AND_NAVIGATION.md` — móvil (RN) como plataforma principal + admin web companion |
| User flow diagram complete | ✅ | `docs/USER_FLOW.md` (atleta + admin + puente entre apps) |
| Navigation pattern decided | ✅ | `docs/PLATFORM_AND_NAVIGATION.md` — bottom tabs (móvil), top navbar (admin) |
| Wireframes (one per screen) | ✅ | `docs/WIREFRAMES.md` (10 pantallas) |
| Wireframe PDF en `/docs` | ✅ | `docs/InRage-Wireframes.pdf` |
| All screens built | ✅ | `mobile-new/src/screens/*`, `admin/src/App.jsx` |
| Connected to backend (datos reales) | ✅ | API real (JWT) — `mobile-new/src/api/client.js`, `admin/src/api.js` |
| Loading / empty / error states | ✅ | ver tabla abajo |
| App deployed (URL en vivo) | ⏳ | listo para deploy — `docs/DEPLOYMENT.md` + `render.yaml` (falta pulsar deploy con tus cuentas) |

## Plataforma elegida
**React Native (Expo)** es la plataforma evaluada (app del atleta, uso on-the-go dentro del gym). El **panel admin (React web)** es un complemento para administrar la app del móvil.

## Cobertura de estados (happy / loading / empty / error)
| Pantalla | Loading | Empty | Error |
|----------|:------:|:-----:|:-----:|
| Móvil · Login/Registro | spinner en botón | — | banner rojo |
| Móvil · Inicio (WOD) | spinner | "Aún no hay WOD para hoy" | "No se pudo cargar el WOD" |
| Móvil · Inicio (pendiente) | spinner | aviso + info gym | — |
| Móvil · Perfil | spinner | — | usa datos en caché |
| Admin · Atletas | "Cargando atletas…" | banner aprobación | error rojo |
| Admin · En el gym | "Cargando…" | "Nadie ha marcado entrada" | error rojo |
| Admin · Estadísticas | "Cargando…" | — | error rojo |
| Admin · WOD | — | "Sin WODs aún" | mensaje error |
| Admin · Accesos | "Cargando…" | "Sin registros aún" | error rojo |

## Lo único que falta (requiere tus cuentas)
Apretar **deploy** en Render (backend + admin) y compartir el **link de Expo Go** del móvil. Todo el código y la config ya están listos — sigue `docs/DEPLOYMENT.md`.
