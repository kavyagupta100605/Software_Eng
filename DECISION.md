# Architecture & Technical Decision Log (`DECISION.md`)

This document records key architectural, design, and library decisions taken during the development of the Appointment Booking System, detailing the choices evaluated and the rationale behind each decision.

---

## 1. Project Architecture & Monorepo Structure

* **Decision**: Single repository split into `/server` (Node.js/Express REST API) and `/client` (Vite + React SPA), connected via JSON over HTTPS (`/api/v1/...`).
* **Options Considered**:
  1. Next.js full-stack (SSR + API routes).
  2. Monorepo split with separate `/server` and `/client` directories.
* **Rationale**: The specification explicitly requests a 3-tier MERN stack architecture with a separate Express API server and React SPA frontend. Keeping client and server explicitly separated allows clear deployment options and accurate testing of REST endpoint contracts and CORS handling.

---

## 2. Styling System & Component UI Engine

* **Decision**: Tailwind CSS v3 with Lucide React icons, Framer Motion for micro-interactions/transitions, and custom styled glassmorphic/shadcn-inspired component primitives.
* **Options Considered**:
  1. Default Bootstrap / Plain CSS.
  2. Tailwind CSS v3 + Framer Motion + custom UI components.
  3. Pre-built heavy UI frameworks (e.g. Material UI / Ant Design).
* **Rationale**: Tailwind CSS combined with Framer Motion allows full utility control over modern visual aesthetics (gradients, smooth dark mode, card hover lifts, glassmorphism) while maintaining high performance and customized design consistency.

---

## 3. Client State Management & Data Fetching

* **Decision**: React Query (`@tanstack/react-query`) for server-side state, caching, and auto-invalidation, combined with React Context API + LocalStorage for client authentication and theme state.
* **Options Considered**:
  1. Redux Toolkit for all state.
  2. React Query + Auth/Theme Context.
  3. Raw `useEffect` + standard Axios calls.
* **Rationale**: React Query eliminates boilerplate for fetching, caching, loading skeletons, and background updates (such as slot availability changes). Light context handles user session and theme preference seamlessly.

---

## 4. Slot Picker & Calendar Component UI

* **Decision**: Custom interactive Framer Motion slot grid with weekday tab controls and slot status indicators.
* **Options Considered**:
  1. Heavy third-party calendar libraries like `react-big-calendar` or `FullCalendar`.
  2. Custom responsive Framer Motion slot grid & interactive date slider.
* **Rationale**: Custom slot grid provides superior mobile responsiveness, smooth tab animations, zero bundle bloat, and exact alignment with the custom `getAvailableSlots` API structure.

---

## 5. Availability Engine & Concurrency Control

* **Decision**:
  * Step-based candidate slot generation combining weekly hours, slot duration, provider buffer minutes, and blocked date ranges.
  * Server-side write-time conflict checks querying overlapping appointments `(slotStart < requestedSlotEnd AND slotEnd > requestedSlotStart)` with compound index `(providerId, slotStart)`.
* **Options Considered**:
  1. Optimistic slot creation on frontend only.
  2. Double-check validation on backend write path before insertion.
* **Rationale**: Client slot lists can easily become stale. Double validation on write prevents double bookings and enforces slot integrity.

---

## 6. Email Notifications & Reminder Job

* **Decision**: Nodemailer configured with Ethereal email test transport (with fallback console logging), triggered asynchronously on booking confirmation, alongside `node-cron` running every 15 minutes to send 24-hour reminders.
* **Options Considered**:
  1. Mandatory live SMTP credentials (e.g. SendGrid/Gmail OAuth).
  2. Nodemailer with auto-generated Ethereal transport / fallback.
* **Rationale**: Ethereal provides real preview URLs in development logs without requiring hardcoded personal credentials or failing if external SMTP is unreachable.

---

## 7. Password Hardening & Security Middleware

* **Decision**: `bcryptjs` with 10 salt rounds, standard JWT auth tokens, input validation schemas using `express-validator`, security headers via `helmet`, CORS policy via `cors`, and request throttling via `express-rate-limit`.
* **Rationale**: Meets all production hardening and non-functional requirements specified in `PROJECT_SPEC.md`.
