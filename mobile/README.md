# InRage Mobile

React Native (Expo) client for gym members.

## Setup

```bash
npm install
npm start
```

Then press `a` for Android emulator, `i` for iOS simulator, or scan the QR with Expo Go.

## Connecting to the backend

By default the app calls `http://localhost:4000`. From a phone, `localhost` is the phone itself, not your computer. You have two options:

1. **Expo Go on the same Wi-Fi:** set `EXPO_PUBLIC_API_URL` to your computer's LAN IP:
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.42:4000 npm start
   ```
2. **Web/simulator:** localhost works fine.

## Structure

```
src/
  screens/           # one file per screen
  components/        # reusable UI pieces
  api/               # API client
  theme/             # colors, spacing, typography
```

## What's done

- Theme system with InRage palette
- `TodayWorkoutScreen` — fetches and displays today's WOD with pull-to-refresh

## What's next

- Classes list screen
- Booking flow
- Member registration / login
- Navigation (react-navigation when there's more than one screen)
