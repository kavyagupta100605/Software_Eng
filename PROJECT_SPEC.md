# Appointment Booking System — Full Build Specification

> Build target: a production-quality MERN web app. Follow this spec exactly for schema, API
> contracts, and business logic. Where UI is described, prioritize a modern, interactive,
> animated feel over a plain CRUD look — this is a portfolio/eval-grade deliverable, not a
> bare-bones prototype.

---

## 1. Tech Stack (use exactly this)

**Frontend**
- React 18 + Vite
- Tailwind CSS + `shadcn/ui` component primitives
- Framer Motion (page transitions, modals, micro-interactions)
- React Router v6
- React Query (`@tanstack/react-query`) for server state / caching
- `react-big-calendar` or `FullCalendar.js` for the slot/calendar UI
- Axios (API client, with an interceptor for JWT + 401 handling)
- `react-hot-toast` for notifications
- Zustand or Context API for lightweight client state (auth user)

**Backend**
- Node.js + Express.js
- MongoDB + Mongoose
- JWT (`jsonwebtoken`) + `bcrypt`
- `express-validator` for input validation
- `node-cron` for scheduled reminder jobs
- Nodemailer for email
- `helmet`, `cors`, `express-rate-limit` for baseline security/hardening
- `morgan` for request logging in dev

**Testing**: Jest + Supertest (backend), React Testing Library (frontend, optional)

---

## 2. Architecture

3-tier, monolithic Express backend, SPA frontend, MongoDB Atlas.

```
React SPA  <-- REST/JSON over HTTPS -->  Express API  <-- Mongoose -->  MongoDB
                                              |
                                        node-cron jobs
                                        (reminders)
```

All backend routes are versioned under `/api/v1/...`. All protected routes require
`Authorization: Bearer <jwt>`. Roles: `client`, `provider`, `admin`.

---

## 3. Database Schema (Mongoose)

### User
```js
{
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['client', 'provider', 'admin'], required: true },
  phone: String,
  createdAt: { type: Date, default: Date.now }
}
```

### Provider
```js
{
  userId: { type: ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true },
  category: { type: String, required: true }, // 'Salon' | 'Clinic' | 'Tutor' | 'Repair' | ...
  description: String,
  location: String,
  bufferMinutes: { type: Number, default: 10 },
  cancellationWindowHours: { type: Number, default: 2 },
  avgRating: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: true } // false if admin approval workflow is used
}
```

### Service
```js
{
  providerId: { type: ObjectId, ref: 'Provider', required: true },
  name: { type: String, required: true },
  durationMins: { type: Number, required: true },
  price: Number,
  isActive: { type: Boolean, default: true }
}
```

### Availability
```js
{
  providerId: { type: ObjectId, ref: 'Provider', required: true },
  weeklyHours: [{
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sunday
    startTime: String, // "09:00"
    endTime: String    // "18:00"
  }],
  blockedRanges: [{
    start: Date,
    end: Date,
    reason: String
  }]
}
```

### Appointment
```js
{
  clientId: { type: ObjectId, ref: 'User', required: true },
  providerId: { type: ObjectId, ref: 'Provider', required: true },
  serviceId: { type: ObjectId, ref: 'Service', required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  status: {
    type: String,
    enum: ['requested', 'confirmed', 'completed', 'cancelled', 'no-show'],
    default: 'confirmed'
  },
  cancelledBy: { type: String, enum: ['client', 'provider', null], default: null },
  notes: String,
  createdAt: { type: Date, default: Date.now }
}
```
**Index:** `{ providerId: 1, slotStart: 1 }` — compound index, critical for fast conflict checks.

### Review (optional/stretch)
```js
{
  appointmentId: { type: ObjectId, ref: 'Appointment', required: true, unique: true },
  clientId: { type: ObjectId, ref: 'User' },
  providerId: { type: ObjectId, ref: 'Provider' },
  rating: { type: Number, min: 1, max: 5 },
  comment: String
}
```

---

## 4. Core Business Logic

### 4.1 Availability Engine (the most important module — implement carefully)

**Function:** `getAvailableSlots(providerId, serviceId, dateRangeStart, dateRangeEnd)`

Algorithm:
1. Fetch the provider's `Availability` doc (weekly hours + blocked ranges).
2. Fetch the `Service` to get `durationMins`.
3. For each calendar day in the requested range:
   a. Look up that weekday's `weeklyHours` entry. If none, skip (closed that day).
   b. Generate candidate slots by stepping through `[startTime, endTime]` in
      `durationMins + bufferMinutes` increments.
   c. Discard any candidate slot that overlaps a `blockedRanges` entry.
   d. Discard any candidate slot that overlaps an existing `Appointment` for that provider
      with status in `['requested','confirmed']` (query using the compound index, range
      `[slotStart, slotStart + duration)`).
4. Return the remaining candidate slots as available.

**Function:** `createAppointment(clientId, providerId, serviceId, requestedSlotStart)`

This is the concurrency-sensitive write path — re-validate at write time, don't trust the
slot list the client fetched a few seconds earlier:
1. Compute `slotEnd = requestedSlotStart + service.durationMins`.
2. Inside a MongoDB session/transaction (or at minimum an atomic query), check for any
   existing appointment for `providerId` where
   `slotStart < requestedSlotEnd AND slotEnd > requestedSlotStart` and status is
   `requested` or `confirmed`. If found → reject with `409 Conflict`.
3. Also re-check against `blockedRanges` and `weeklyHours` (defensive — the frontend slot
   list could be stale).
4. If clear, insert the `Appointment` document with status `confirmed`.
5. Trigger confirmation email (async, don't block the response).

### 4.2 Appointment State Machine

```
requested --> confirmed --> completed
                 |
                 +--> cancelled (by client or provider)
                 +--> no-show (marked by provider after slot passes)
```

Transition rules (enforce server-side, reject invalid transitions with `400`):
- Only `confirmed` appointments can move to `completed`, `cancelled`, or `no-show`.
- Client-initiated cancellation is blocked if `now > slotStart - cancellationWindowHours`
  (return `403` with a clear message).
- Provider-initiated cancellation has no time restriction.
- Cancelling/no-show frees the slot immediately (no separate action needed — the
  availability engine already excludes non-`requested`/`confirmed` statuses).

### 4.3 Reminder Job (node-cron)

Runs every 15 minutes:
```
SELECT appointments WHERE status = 'confirmed'
  AND slotStart BETWEEN now+23h45m AND now+24h
  AND reminderSent = false
```
Send reminder email via Nodemailer, then set `reminderSent = true` (add this boolean field
to the Appointment schema to avoid duplicate sends).

---

## 5. API Specification

Base path: `/api/v1`

### Auth
| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{name, email, password, role}` | role limited to client/provider at signup |
| POST | `/auth/login` | — | `{email, password}` | returns `{token, user}` |
| GET | `/auth/me` | JWT | — | returns current user |

### Providers
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/providers` | — | list/search; query params `?category=&location=&search=` |
| GET | `/providers/:id` | — | provider public profile + services |
| POST | `/providers` | JWT (provider) | create own provider profile |
| PATCH | `/providers/:id` | JWT (owner) | update profile |

### Services
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/providers/:id/services` | — | list active services |
| POST | `/providers/:id/services` | JWT (owner) | create service |
| PATCH | `/services/:id` | JWT (owner) | edit |
| DELETE | `/services/:id` | JWT (owner) | soft delete (`isActive=false`) |

### Availability
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/providers/:id/availability` | — | raw weekly hours + blocked ranges |
| PUT | `/providers/:id/availability` | JWT (owner) | replace weekly hours |
| POST | `/providers/:id/availability/block` | JWT (owner) | add a blocked range |
| GET | `/providers/:id/slots?serviceId=&from=&to=` | — | **computed** available slots (calls Availability Engine) |

### Appointments
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/appointments` | JWT (client) | `{providerId, serviceId, slotStart}` → conflict-checked create |
| GET | `/appointments/me` | JWT (client) | client's own appointments |
| GET | `/providers/:id/appointments` | JWT (owner) | provider's schedule; query `?date=&status=` |
| PATCH | `/appointments/:id/cancel` | JWT (client or provider) | enforces cancellation window for clients |
| PATCH | `/appointments/:id/status` | JWT (provider) | mark `completed` / `no-show` |

### Admin (optional)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/providers` | JWT (admin) | all providers, approval status |
| PATCH | `/admin/providers/:id/approve` | JWT (admin) | toggle `isApproved` |
| GET | `/admin/appointments` | JWT (admin) | platform-wide view |

**Standard error shape:** `{ "error": { "code": "SLOT_CONFLICT", "message": "..." } }`
**Standard success shape:** `{ "data": ... }`

---

## 6. Frontend — Pages & Interaction Requirements

Build with a cohesive, modern SaaS look — not default Bootstrap styling. Use a consistent
color system (e.g. a deep indigo/teal primary + neutral grays), rounded-lg cards, soft
shadows, and consistent spacing via Tailwind's scale.

### 6.1 Global interaction requirements
- **Page transitions**: fade/slide via Framer Motion's `AnimatePresence` on route change.
- **Loading states**: skeleton loaders (not spinners) for lists/cards while React Query fetches.
- **Toasts**: success/error toasts on every mutation (booking created, cancelled, etc.).
- **Empty states**: illustrated/friendly empty states ("No appointments yet") not blank pages.
- **Dark mode toggle**: persisted via a theme context, Tailwind `dark:` classes throughout.
- **Micro-interactions**: buttons scale slightly on hover/press (`whileHover`, `whileTap` in
  Framer Motion), calendar slot cells highlight on hover, selected slot animates into a
  confirmation panel.
- **Responsive**: mobile-first; booking flow must work cleanly on a phone-width viewport.

### 6.2 Pages

**Landing / Provider Discovery (`/`)**
- Hero section, search bar with category filter chips (animated selection state)
- Grid of provider cards (image, name, category, rating) with hover-lift animation

**Provider Profile (`/providers/:id`)**
- Provider info header, list of services (selectable cards)
- On selecting a service → animated calendar/slot picker appears (Framer Motion layout
  animation, not an abrupt re-render)
- Slot grid: available slots as pill buttons, grouped by day tabs; booked/unavailable
  slots visually distinct (muted, disabled)
- Booking confirmation as a modal/drawer with a summary + confirm button; success state
  shows an animated checkmark

**Auth Pages (`/login`, `/register`)**
- Role toggle (client/provider) as an animated segmented control
- Inline validation, shake animation on invalid submit

**Client Dashboard (`/dashboard`)**
- Tabs: Upcoming / Past / Cancelled — animated underline indicator on tab switch
- Appointment cards with provider info, status badge (color-coded), cancel button
  (confirmation dialog before cancelling)

**Provider Dashboard (`/provider/dashboard`)**
- Today's schedule as a timeline view
- Stats row (bookings this week, cancellation rate) as animated count-up numbers
- Appointment management table with inline status-update actions
- Availability editor: weekly hours as a draggable/toggleable grid (day × time blocks),
  "block a date" via a date-range picker in a modal

**Admin Dashboard (`/admin`)** *(if built)*
- Provider approval queue, platform stats

### 6.3 Suggested component library additions
`shadcn/ui`: Button, Card, Dialog, Tabs, Badge, Calendar, Skeleton, Toast, Select,
Sheet (for mobile drawers). Compose these rather than hand-rolling primitives.

---

## 7. Folder Structure

```
appointment-booking-system/
├── client/
│   └── src/
│       ├── components/       (ui/, calendar/, booking/, dashboard/)
│       ├── pages/
│       ├── context/          (AuthContext, ThemeContext)
│       ├── hooks/             (useAuth, useProviderSlots, ...)
│       ├── services/           (api.js — axios instance + endpoint wrappers)
│       ├── lib/                 (utils, date helpers)
│       └── App.jsx
├── server/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── services/               (availabilityEngine.js, notifyService.js)
│   ├── middleware/             (auth.js, role.js, errorHandler.js)
│   ├── jobs/                    (reminderCron.js)
│   ├── validators/              (express-validator schemas)
│   ├── config/                   (db.js)
│   └── server.js
└── tests/
```

---

## 8. Build Order (recommended milestones for the agent to follow)

1. Scaffold client + server, DB connection, base models
2. Auth (register/login/JWT middleware) end-to-end
3. Provider profile + service CRUD
4. Availability engine (slot computation) + unit tests for edge cases (overlapping
   blocked ranges, back-to-back bookings, buffer enforcement)
5. Appointment creation with conflict checking + state machine
6. Client booking UI (discovery → slot picker → confirm)
7. Client + provider dashboards
8. Notifications (email confirm + cron reminders)
9. Polish pass: animations, dark mode, empty/loading states, responsive check
10. (Optional) Admin module, reviews module

---

## 9. Non-Functional Requirements

- Passwords: bcrypt, min 10 salt rounds
- JWT: short-lived access token (e.g. 2h); consider refresh token if time allows
- Rate limit auth endpoints (`express-rate-limit`)
- All list endpoints paginated (`?page=&limit=`)
- Input validation on every POST/PATCH via `express-validator`
- Compound DB index on `(providerId, slotStart)` is mandatory, not optional
