# Sprint 10 Push Notifications Design

Scope: prepare real push notifications without adding them in Sprint 8.

## Existing Base

- Mobile already has an API client method for saving push tokens.
- Backend already has notification routes and internal notification records.
- Sprint 8 keeps email delivery separate from push delivery.

## Proposed Delivery Model

- Store Expo/device push tokens per member with platform, deviceId, createdAt and lastUsedAt.
- Send push only from backend jobs or explicit admin actions.
- Keep notification records as the source of truth, then fan out push attempts.
- Treat push delivery as best effort: notification creation must not fail just because Expo/APNs/FCM rejects a token.

## Sprint 10 Work Items

- Add provider adapter for Expo Push API first.
- Add token pruning for invalid/expired push tokens.
- Add rate limiting and retry policy for transient provider failures.
- Add opt-in/opt-out settings per member.
- Add admin-safe logs that show provider status without exposing tokens.
- Add tests for token save, invalid token pruning and failed delivery isolation.

## Non-Goals

- No payments, wallet, NFC or social feed.
- No client-side background notification handling until delivery is stable.
