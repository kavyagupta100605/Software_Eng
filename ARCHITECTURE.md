# BookEase — System Architecture & Feature Specification

## 1. Executive Summary & Process Runtime

**BookEase** is a full-stack MERN (MongoDB, Express, React, Node.js) web application designed for appointment scheduling with conflict detection, dynamic availability calculation, automated email notifications, and multi-role access control.

### Current Process Runtime Environment

| Process / Component | Technology | Command / Script | Port / URL |
|---|---|---|---|
| **Backend Web Server** | Express.js / Node.js | `node server.js` | `http://localhost:5000` |
| **Frontend SPA** | React 18 / Vite | `npm run dev` | `http://localhost:5173` |
| **Database** | MongoDB Atlas / Mongoose | Connection via `MONGODB_URI` | Standard Mongo Wire Protocol |
| **Scheduled Jobs** | `node-cron` daemon | Embedded in `server.js` | Runs every 15 minutes |

---

## 2. System Architecture

The application adopts a 3-tier decoupled architecture:

```
┌─────────────────────────────────────────────────────────┐
│                      Client Tier                        │
│                 React 18 SPA (Vite)                     │
│  • React Router v6 Page Transitions (Framer Motion)     │
│  • Server State & Cache (TanStack React Query v5)       │
│  • Axios HTTP Client with Auth & 401 Interceptors       │
│  • Dark / Light Theme & Auth Contexts                   │
└────────────────────────────┬────────────────────────────┘
                             │
                  RESTful JSON API (/api/v1)
                             │
┌────────────────────────────▼────────────────────────────┐
│                      Server Tier                        │
│                  Node.js + Express                      │
│  • Security: Helmet, CORS, Express-Rate-Limit           │
│  • Authentication: JWT + Bcrypt Passwords               │
│  • Services: Availability Engine & Nodemailer Transporter│
│  • Daemon: node-cron Reminder Job                       │
└────────────────────────────┬────────────────────────────┘
                             │
                       Mongoose ODM
                             │
┌────────────────────────────▼────────────────────────────┐
│                     Database Tier                       │
│                     MongoDB Atlas                       │
│  • Collection Models: User, Provider, Service,          │
│    Availability, Appointment, Review                    │
│  • Indexed on { providerId: 1, slotStart: 1 }           │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack Details

### Frontend Stack
* **UI Framework**: React 18 + Vite
* **Styling**: Tailwind CSS + Custom CSS Variables (Dark/Light mode support)
* **Animation Engine**: Framer Motion (page transitions, modals, interactive slot buttons)
* **State Management**:
  * **Server State**: `@tanstack/react-query` for query caching, automatic refetching, and optimistic UI.
  * **Client State**: React Context API (`AuthContext`, `ThemeContext`).
* **HTTP Client**: Axios with request headers interceptor for JWT injection and automated login redirect on `401 Unauthorized`.
* **Notifications**: `react-hot-toast`

### Backend Stack
* **Runtime**: Node.js v22+
* **Framework**: Express.js
* **Database**: MongoDB + Mongoose ODM
* **Security & Utility**:
  * `helmet` (HTTP headers security)
  * `cors` (Cross-origin configuration)
  * `express-rate-limit` (Auth route rate limiting)
  * `jsonwebtoken` (JWT bearer tokens)
  * `bcryptjs` (Password hashing)
  * `express-validator` (Input schema validation)
  * `morgan` (HTTP request logging)
* **Email & Scheduling**: Nodemailer (Ethereal test transport in dev) + `node-cron`

---

## 4. Database Schema & Data Models

### 1. `User`
```js
{
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['client', 'provider', 'admin'], default: 'client' },
  phone: String,
  createdAt: { type: Date, default: Date.now }
}
```

### 2. `Provider`
```js
{
  userId: { type: ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true },
  category: { type: String, required: true }, // 'Salon', 'Clinic', 'Tutor', 'Repair', etc.
  description: String,
  location: String,
  bufferMinutes: { type: Number, default: 10 },
  cancellationWindowHours: { type: Number, default: 2 },
  avgRating: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: true }
}
```

### 3. `Service`
```js
{
  providerId: { type: ObjectId, ref: 'Provider', required: true },
  name: { type: String, required: true },
  durationMins: { type: Number, required: true },
  price: Number,
  isActive: { type: Boolean, default: true }
}
```

### 4. `Availability`
```js
{
  providerId: { type: ObjectId, ref: 'Provider', required: true, unique: true },
  weeklyHours: [{
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sunday
    startTime: String, // "09:00"
    endTime: String    // "17:00"
  }],
  blockedRanges: [{
    start: Date,
    end: Date,
    reason: String
  }]
}
```

### 5. `Appointment`
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
  reminderSent: { type: Boolean, default: false },
  notes: String,
  createdAt: { type: Date, default: Date.now }
}
// Index: { providerId: 1, slotStart: 1 }
```

### 6. `Review`
```js
{
  appointmentId: { type: ObjectId, ref: 'Appointment', required: true, unique: true },
  clientId: { type: ObjectId, ref: 'User', required: true },
  providerId: { type: ObjectId, ref: 'Provider', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: String
}
```

---

## 5. Core Engine & Business Logic

### A. Availability Computation Engine (`availabilityEngine.js`)
Calculates available slots dynamically for any given date range:
1. Retrieves Provider configuration (`bufferMinutes`) and active Service (`durationMins`).
2. Computes slot step interval: `stepMins = durationMins + bufferMinutes`.
3. Iterates day-by-day over requested date range, checking `weeklyHours`.
4. Filters candidate slots against:
   * **Past time check**: Discards candidate slots prior to `Date.now()`.
   * **Blocked Ranges**: Discards candidate slots overlapping `blockedRanges`.
   * **Active Appointments**: Discards candidate slots overlapping existing `requested` or `confirmed` appointments using range query `[slotStart < appt.slotEnd AND slotEnd > appt.slotStart]`.

### B. Write-Time Concurrency Protection (`checkSlotConflict`)
Before committing a new appointment to MongoDB, the backend re-validates slot availability synchronously to prevent double-booking caused by concurrent client requests.

### C. State Machine & Cancellation Rules
* Valid status transitions: `requested` $\rightarrow$ `confirmed` $\rightarrow$ `completed` / `cancelled` / `no-show`.
* **Client Cancellation Window**: Enforces client policy `slotStart - now >= cancellationWindowHours`. If violated, rejects with HTTP `403 Forbidden`. Providers can cancel at any time.

### D. Automated Reminder Cron (`reminderCron.js`)
* Executes every 15 minutes (`*/15 * * * *`).
* Queries confirmed appointments where `reminderSent == false` starting within the 24-hour window (`now + 23h45m` to `now + 24h15m`).
* Sends email notifications via Nodemailer and marks `reminderSent = true`.

---

## 6. Complete Feature Set

### 🌐 Public / Discovery Features
* **Provider Search & Filtering**: Live search by business name or location, plus interactive category chips (Salon, Clinic, Tutor, Repair).
* **Provider Profiles**: Detailed profile view showcasing provider overview, address, buffer policy, ratings, and service catalog.
* **Interactive Booking Picker**: Dynamic slot selection pill grid grouped by calendar day tabs.

### 👤 Client Features
* **Authentication**: JWT-backed Register & Login with client/provider role toggle.
* **Instant Booking**: One-click appointment booking with notes and automated confirmation email.
* **Client Dashboard**: Filterable appointment view (*Upcoming*, *Past*, *Cancelled*) with status badges and client cancellation dialog.

### 💼 Provider Features
* **Business Profile Editor**: Manage business details, category, location, buffer time, and cancellation policy.
* **Service Catalog Manager**: Add, edit, or toggle active/inactive status for services.
* **Availability & Blocked Windows**: Define recurring weekly operating hours per weekday and block custom date ranges for holidays.
* **Provider Dashboard**: Schedule overview, daily timeline, appointment status management (`completed`, `no-show`, `cancelled`), and weekly metric counters.

### 🛡️ Admin Features
* **Platform Control Dashboard**: Overview of system statistics (total users, providers, appointments) and provider approval queue management.

### 🎨 User Experience & Polish
* **Dark Mode Persistence**: Dark theme toggle with local storage persistence.
* **Framer Motion Micro-Interactions**: Page transition animations, modal overlays, and reactive button states.
* **Toast System**: Real-time feedback via `react-hot-toast`.
