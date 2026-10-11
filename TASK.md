# Project Task List (`TASK.md`)

This task list tracks all implementation milestones and subtasks for building the Appointment Booking System.

---

## Phase 1: Environment & Project Setup
- [x] Initialize backend (`/server`) with `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `express-validator`, `node-cron`, `nodemailer`, `cors`, `helmet`, `express-rate-limit`, `morgan`
- [x] Initialize frontend (`/client`) with Vite, React 18, Tailwind CSS, `@tanstack/react-query`, `react-router-dom`, `framer-motion`, `lucide-react`, `axios`, `react-hot-toast`
- [x] Establish standard directory structure for server and client

## Phase 2: Backend Database Schemas & Models
- [x] Implement `User` model (Client, Provider, Admin roles)
- [x] Implement `Provider` model (Business details, category, location, bufferMinutes, cancellationWindowHours)
- [x] Implement `Service` model (Provider ref, durationMins, price, isActive)
- [x] Implement `Availability` model (weeklyHours array, blockedRanges array)
- [x] Implement `Appointment` model (Client/Provider/Service ref, slotStart, slotEnd, status, cancelledBy, notes, reminderSent)
- [x] Create compound index on `Appointment` (`{ providerId: 1, slotStart: 1 }`)
- [x] Implement `Review` model (Optional/Stretch)

## Phase 3: Auth System & Middleware
- [x] Implement JWT auth middleware & role guard middleware
- [x] Implement `express-validator` auth schemas
- [x] Implement `/api/v1/auth/register`, `/api/v1/auth/login`, and `/api/v1/auth/me` endpoints

## Phase 4: Provider & Service Management API
- [x] Build `/api/v1/providers` list & profile search API (`?category=&location=&search=`)
- [x] Build Provider profile creation (`POST /api/v1/providers`) & patch endpoint
- [x] Build Service CRUD endpoints (`GET`, `POST`, `PATCH`, `DELETE` soft-delete)

## Phase 5: Availability Engine & Conflict System
- [x] Implement `services/availabilityEngine.js` (`getAvailableSlots` algorithm: weekly hours, slot duration, buffer minutes, blocked ranges, existing appointment filtering)
- [x] Implement Availability endpoints (`GET/PUT` availability, `POST` block date range, `GET` slots calculation)
- [x] Build unit test suite for Availability Engine edge cases (`server/tests/availabilityEngine.test.js`)

## Phase 6: Appointment State Machine & Concurrency Control
- [x] Implement `createAppointment` logic with write-time conflict check (`slotStart < requestedSlotEnd AND slotEnd > requestedSlotStart`)
- [x] Implement Appointment state machine transitions (`requested` -> `confirmed` -> `completed` / `cancelled` / `no-show`)
- [x] Enforce client cancellation window rule (`now > slotStart - cancellationWindowHours`)
- [x] Build Client and Provider appointment list endpoints (`/api/v1/appointments/me`, `/api/v1/providers/:id/appointments`)

## Phase 7: Background Cron & Email Notifications
- [x] Implement `services/notifyService.js` (Nodemailer Ethereal / test transporter)
- [x] Integrate booking confirmation email triggering on successful appointment creation
- [x] Implement `jobs/reminderCron.js` (cron running every 15 mins for 24h reminders)

## Phase 8: Client SPA Frontend UI & UX
- [x] Set up Tailwind theme, global styles, glassmorphism utilities, and dark mode toggle context
- [x] Build API Client (`services/api.js`) with Axios interceptors for JWT injection and 401 handling
- [x] Build Navigation bar, Footer, Skeleton loaders, and Toast system
- [x] Implement Landing / Provider Discovery (`/`) with search, animated category filters, and provider cards
- [x] Implement Provider Profile (`/providers/:id`) with selectable service cards & animated Framer Motion slot picker
- [x] Implement Booking Confirmation Modal with summary & checkmark animation
- [x] Implement Auth Pages (`/login`, `/register`) with role toggle segment control & validation animations
- [x] Implement Client Dashboard (`/dashboard`) with tabs (Upcoming / Past / Cancelled) & cancellation workflow
- [x] Implement Provider Dashboard (`/provider/dashboard`) with schedule timeline, stats, appointment table, and weekly availability grid editor
- [x] Implement Admin Dashboard (`/admin`) with provider approval queue & platform stats

## Phase 9: Quality Assurance & Polish Pass
- [x] Verify dark mode toggle, Framer Motion page transitions, and responsive mobile layout
- [x] Run full end-to-end integration test across all user roles
