# InRage — Project Proposal

**Julio · Class 1 Submission**

---

## 1. Project Idea

InRage is a mobile application for CrossFit gym members to book classes, check the workout of the day (WOD), and track their attendance. It exists to replace the WhatsApp-and-spreadsheet system that small CrossFit boxes typically use to manage their members, giving a real gym (my brother's box in Tampico, Mexico) a tool built specifically for how it actually operates.

---

## 2. Features

- **User authentication** — members sign up and log in with email and password; each member only sees their own data.
- **Class schedule** — members see the week's class schedule with time, coach, and remaining capacity.
- **Class booking** — members reserve a spot in a class with one tap; the available capacity updates immediately.
- **Cancel booking** — members can cancel a reservation up to a configurable cutoff (default: 2 hours before the class starts).
- **WOD of the day** — members open the app and see today's workout: title, description, scoring type (For Time / AMRAP / etc.).
- **Personal bookings list** — each member sees a list of their upcoming and past bookings.
- **Admin web panel** — gym staff log in from a browser to add members, create classes, and publish the WOD.
- **Persistent storage** — all members, classes, bookings, and workouts are stored in MongoDB.

---

## 3. Target Audience

Members of small-to-medium independent CrossFit boxes in Mexico — typically 50 to 200 active members per gym. These are adults aged 20 to 50 who already use their phones for everything else in their day and expect class booking to work the same way they book a ride or order food. The first real user is my brother's gym, InRage CrossFit, which has roughly 80 active members managed today through WhatsApp groups and a paper roster. Members are the primary client; gym staff (one or two people) are a secondary audience served by a separate admin web panel.

---

## 4. Technology Stack

| Layer | Technology |
|-------|------------|
| Mobile client | React Native (Expo) |
| Admin web panel | React + Vite |
| Backend | Node.js + Express |
| Database | MongoDB Atlas (with Mongoose ODM) |
| Authentication | JWT + bcrypt for password hashing |
| Deployment — Backend | Render (web service) |
| Deployment — Admin web | Render (static site) |
| Deployment — Mobile | Expo Go for development; EAS Build for distribution |

**Scope:** the MVP does not include payments, push notifications, social features, or workout-history analytics. The app will be Spanish-first (the language of the gym), with a clean dark-mode UI matching the InRage brand (black + neon green).

---

## 5. Cost Estimate

### Free Tier — portfolio / personal project

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Render (admin web — static site) | Free | $0 |
| Render (backend web service) | Free | $0 |
| MongoDB Atlas | Free (M0 — 512 MB storage) | $0 |
| Expo (mobile development) | Free | $0 |
| Expo EAS Build | Free (30 builds/month) | $0 |
| Domain name | None (use Render subdomain) | $0 |
| **Total** | | **$0/month** |

> ⚠ Render's free backend tier spins down after 15 minutes of inactivity. The first request after a cold start can take 30–60 seconds. MongoDB Atlas M0 caps at 512 MB and shared CPU. Acceptable for a portfolio project, not for real gym members. Expo Go cannot be used by gym members outside of development — for real distribution the app would need to ship via TestFlight (iOS) or APK side-load (Android), both of which still cost $0 at this stage.

### Paid — small production app (one real gym, ~80 members)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Render (admin web — static site) | Starter | $0 |
| Render (backend web service) | Starter — always on | $7 |
| MongoDB Atlas | M10 dedicated cluster | $57 |
| Expo EAS Build | Production plan | $19 |
| Apple Developer account | Required to ship to App Store (annual / 12) | $8 |
| Google Play Console | One-time $25 (amortised, ~$0) | $0 |
| Domain name (.com via Namecheap) | inrage.app or similar | ~$1 |
| **Total** | | **~$92/month** |

> **Notes:** the Apple Developer account is $99/year (≈$8/month amortised). Google Play Console is a one-time $25, effectively $0/month after year one. If we skip iOS and ship Android only, the total drops to ~$84/month.

### Scaling — multiple gyms, ~5,000 active users

| Service | Concern at scale | Upgrade needed |
|---------|------------------|----------------|
| Render backend | CPU/memory limits under booking peaks (mornings, evenings) | Standard plan (~$25/month) or horizontal scaling |
| MongoDB Atlas | Storage and concurrent connections grow; bookings index grows fast | M20 or M30 cluster ($130–$200/month) |
| Expo EAS Build | More builds per month for over-the-air updates | Production plan still covers it (~$19) |
| Push notifications | Class reminders, WOD published alerts (Expo Push is free, but rate-limited at scale) | OneSignal free tier or Firebase Cloud Messaging (free) |
| Object storage (future) | Profile photos, gym logos | Render disk or Cloudflare R2 (~$5/month) |
| **Estimated total at scale** | | **~$180–280/month** |

**Cost-driven decisions made upfront:** MongoDB was chosen over a relational DB partly because the M0 free tier is generous enough to develop the entire MVP without spending anything. Render was chosen over AWS/GCP because deployment is simpler and the free tier is enough for the demo phase. The mobile-first decision (React Native instead of also building a member-facing web app) cuts hosting needs in half.
