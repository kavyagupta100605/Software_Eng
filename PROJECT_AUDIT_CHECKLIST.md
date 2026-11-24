# BookEase project audit and fix checklist

Reviewed: 30 October 2026. Scope: the current local React client and Express/Mongoose server, routes, models, validators, notifications, tests and project specification. Selected fixes were applied on 30 October 2026; see the implementation update below.

This source-based audit does not guarantee that every possible defect has been found. Findings describe observable code paths; concurrency, deployment and delivery risks require the acceptance tests below. No application server was started, no live data was changed, and no email was intentionally sent. Local environment secrets were not read or included.

## Priority and interpretation

- P0: block deployment; exploitable configuration or serious data durability risk.
- P1: major correctness, authorization or reliability fix.
- P2: functional, operational or usability fix.
- P3: presentation or scope clarity.
- Unchecked items are proposed work, not completed fixes. Configuration-dependent risks do not imply a demonstrated exploit.

## Current cancellation behavior

Cancellation exists: PATCH /api/v1/appointments/:id/cancel calls cancelAppointment. It accepts the client, provider owner or admin and allows confirmed/requested states. Ordinary clients have a provider-configurable cutoff (default two hours); providers/admins bypass it. Cancelled records remain stored and stop blocking slots. The provider dashboard uses PATCH /:id/status instead. The findings below address gaps in this implementation.

## Detailed checklist

### 01. Remove the predictable JWT signing-secret fallback

- [ ] **P0 — Security**
- **Evidence:** `server/middleware/auth.js:3`.
- **Problem and importance:** If JWT_SECRET is absent, authentication uses a secret embedded in source. Anyone knowing that value could forge an administrator token in that configuration.
- **How I would solve it:** Require a strong secret at startup, reject the fallback in every deployed environment, rotate affected secrets and invalidate old tokens. Validate issuer, audience and permitted algorithm.
- **Acceptance checks:** Startup without a secret fails clearly; valid tokens work; forged, expired and wrong-audience tokens fail.

### 02. Disable automatic demo administrator creation in deployed environments

- [ ] **P0 — Deployment/security**
- **Evidence:** `server/server.js; server/config/seedData.js:7-27`.
- **Problem and importance:** Every empty database is seeded automatically, including an admin with a publicly defined shared demo password. This becomes especially dangerous after the database fallback.
- **How I would solve it:** Move seeding into an explicit development-only command. Provision the first admin through a controlled one-time process. Remove demo credentials from deployment logs and rotate any deployed demo accounts.
- **Acceptance checks:** Production startup never creates demo users; an explicit development seed remains repeatable.

### 03. Fail safely instead of silently replacing the database

- [ ] **P0 — Data durability**
- **Evidence:** `server/config/db.js:8-30`.
- **Problem and importance:** Missing configuration or a failed real database connection triggers MongoMemoryServer. Users can write into a different temporary database and lose that data on restart while the app appears healthy.
- **How I would solve it:** Require MONGODB_URI in production; permit temporary databases only under an explicit development/test flag. Fail startup on connection failure and provide readiness checks and documented backup/restore procedures.
- **Acceptance checks:** Missing or unreachable production DB prevents readiness; a restart preserves records in the configured persistent DB.

### 04. Make reservation creation atomic

- [ ] **P1 — Booking integrity**
- **Evidence:** `server/controllers/appointmentController.js:createAppointment; server/models/Appointment.js:index`.
- **Problem and importance:** The conflict lookup and appointment save are separate. Two concurrent requests can both see no conflict and both succeed. The compound index is non-unique and cannot prevent interval overlap.
- **How I would solve it:** Serialize booking and availability changes per provider using a database-enforced lock/version document inside a retried transaction, or use uniquely reserved time units covering the appointment and buffer. A transaction around unrelated inserts alone is insufficient.
- **Acceptance checks:** Parallel overlapping requests yield exactly one successful reservation and deterministic 409 responses for the others, including across multiple app instances.

### 05. Validate the service belongs to the selected provider

- [ ] **P1 — Booking integrity**
- **Evidence:** `server/controllers/appointmentController.js:createAppointment; server/services/availabilityEngine.js:getAvailableSlots`.
- **Problem and importance:** Provider and service are looked up separately without comparing service.providerId. A request can book provider A using provider B's service, duration and price.
- **How I would solve it:** Find the active service by both its ID and provider ID, and apply the same ownership check to slot discovery.
- **Acceptance checks:** A cross-provider service request is rejected for both slots and booking; valid combinations succeed.

### 06. Enforce working hours and future dates when writing bookings

- [ ] **P1 — Booking integrity**
- **Evidence:** `server/controllers/appointmentController.js:createAppointment; server/services/availabilityEngine.js:checkSlotConflict`.
- **Problem and importance:** The booking API checks overlap and blocked ranges but not future time, weekly opening hours, closing boundaries or the allowed slot grid. Direct requests can book a past date or a closed Sunday.
- **How I would solve it:** Create one authoritative booking-policy validator shared by slot computation and reservation writes. Require future start, full containment in opening hours and the chosen slot-grid policy, revalidated under the reservation lock.
- **Acceptance checks:** Past, closed-day, after-hours and crossing-closing requests fail even when sent directly to the API.

### 07. Enforce provider approval throughout public booking

- [ ] **P1 — Approval/security**
- **Evidence:** `server/models/Provider.js:isApproved; server/controllers/providerController.js:getProviderById; appointmentController.js:createAppointment`.
- **Problem and importance:** Providers default to approved. Revocation only removes them from list search; direct profile, service, slot and booking paths remain usable.
- **How I would solve it:** Default new providers to pending when moderation is intended. Enforce approval on every public booking path, retaining authenticated owner/admin previews and access to existing bookings.
- **Acceptance checks:** A revoked provider cannot receive new bookings via a saved URL or direct API request; existing appointments remain manageable.

### 08. Respect a zero-minute buffer and enforce buffers across services

- [ ] **P1 — Availability**
- **Evidence:** `server/services/availabilityEngine.js:getAvailableSlots/checkSlotConflict`.
- **Problem and importance:** bufferMinutes || 10 changes an intentional zero to ten. Conflict checks compare appointment times without buffer, so a different service grid or direct request can violate turnaround time.
- **How I would solve it:** Use nullish defaults and nonnegative numeric constraints. Define the buffer policy explicitly and include buffered occupied intervals in candidate generation and write-time checks.
- **Acceptance checks:** Zero remains zero; mixed-duration services cannot intrude into the configured buffer; exact valid boundaries succeed.

### 09. Use the same normalized date range for queries and generation

- [ ] **P1 — Availability**
- **Evidence:** `server/services/availabilityEngine.js:getAvailableSlots`.
- **Problem and importance:** Existing appointments are queried using the raw from/to instants, but generation expands to whole calendar days. Bookings later on the final day can be omitted and their occupied slots advertised as free.
- **How I would solve it:** Choose documented instant-range or whole-date semantics; normalize bounds once and reuse them in the database query, iteration and output filtering. Add stable ordering and deduplication.
- **Acceptance checks:** A booking late on the final day is always excluded from results; exact from/to boundary behavior is tested.

### 10. Validate availability and blocked intervals

- [ ] **P1 — Validation**
- **Evidence:** `server/controllers/availabilityController.js; server/models/Availability.js; server/routes/v1/providerRoutes.js`.
- **Problem and importance:** Weekly hours and blocked ranges lack robust route validation. Time strings, reversed ranges, duplicate/overlapping hours and noninteger weekdays can produce incorrect or duplicate slots.
- **How I would solve it:** Validate array sizes, integer weekdays, strict HH:mm values, ordered times, unique/nonoverlapping intervals and valid start < end block dates. Reject or explicitly support overnight hours; enforce constraints at model level too.
- **Acceptance checks:** Malformed/reversed/overlapping ranges return 400; valid split shifts and blocked boundaries produce expected slots.

### 11. Apply validation to every update and bound numeric policies

- [ ] **P1 — Validation**
- **Evidence:** `server/controllers/providerController.js:updateProvider; serviceController.js:updateService; server/validators/providerValidator.js`.
- **Problem and importance:** Create validators do not protect update routes. Negative buffer/cancellation values and negative prices can be persisted; extreme values can disrupt scheduling. parseInt silently truncates fractional durations.
- **How I would solve it:** Add dedicated update schemas, type checks and practical maxima; use explicit numeric conversion and matching schema min/max constraints. Validate registration's provider fields through the same shared schema.
- **Acceptance checks:** Create and update reject the same invalid values; negative prices and policies, fractional durations and oversized inputs cannot be saved.

### 12. Validate IDs, filters, pagination and slot-query limits

- [ ] **P1 — API robustness**
- **Evidence:** `server/routes/v1/providerRoutes.js; server/routes/v1/adminRoutes.js; providerController.js:listProviders; availabilityController.js:getSlots`.
- **Problem and importance:** Many IDs and dates are unchecked. Page/limit accept invalid, zero or negative values, and slot ranges are unbounded. Public regex filters use raw patterns, enabling malformed or expensive queries.
- **How I would solve it:** Validate Mongo IDs and enum filters; cap positive page size and date horizon; escape literal search input, limit its length and define indexed search for growth. Return 400 for invalid dates/ranges.
- **Acceptance checks:** Invalid IDs, regex-like search text, excessive ranges and invalid pagination fail cheaply and consistently; limit=0 cannot bypass caps.

### 13. Enforce time-aware, atomic status transitions

- [ ] **P1 — Appointment lifecycle**
- **Evidence:** `server/controllers/appointmentController.js:updateAppointmentStatus/cancelAppointment`.
- **Problem and importance:** Providers can mark a future appointment completed or no-show. Status changes read then save without a current-state condition, so competing cancellation/completion actions can overwrite each other. requested can become terminal despite the specification's confirmed-only rule.
- **How I would solve it:** Define a single transition matrix and time rules; use conditional updates matching the expected previous status, and return 409 for concurrent changes. Decide whether requested is supported; either add confirmation/rejection transitions or remove the unused state.
- **Acceptance checks:** Future no-show/completion is rejected; terminal states cannot be overwritten; concurrent transitions produce one winner; implementation matches the documented state machine.

### 14. Snapshot booked service details and cancellation terms

- [ ] **P1 — History integrity**
- **Evidence:** `server/models/Appointment.js; appointmentController.js; dashboard populated service/provider fields`.
- **Problem and importance:** Appointment displays read the current service name, price and duration. Editing a service changes the apparent details of old bookings. Cancellation checks also use the provider's current policy, which can change after booking.
- **How I would solve it:** Store immutable service name, duration, price/currency and cancellation policy snapshots when booking, while retaining references. Migrate historical records carefully with an explicit unknown/legacy policy.
- **Acceptance checks:** Changing a service or provider policy leaves existing booking terms and displayed historical amounts unchanged.

### 15. Do not mark failed reminder delivery as successful

- [ ] **P1 — Notifications**
- **Evidence:** `server/services/notifyService.js:sendReminderEmail; server/jobs/reminderCron.js`.
- **Problem and importance:** The mail service catches and suppresses delivery errors. The cron job then sets reminderSent=true regardless, including when the client has no usable email. Those reminders will never retry.
- **How I would solve it:** Return a delivery outcome or throw on failure; mark sent only after acceptance by the configured mail provider. Record failures, use bounded retries/backoff and surface operational failures.
- **Acceptance checks:** A simulated mail failure leaves the reminder retryable; a missing recipient is recorded explicitly; a successful send sets sent metadata.

### 16. Make reminder processing resilient to downtime and multiple workers

- [ ] **P1 — Notifications**
- **Evidence:** `server/jobs/reminderCron.js:initReminderCron`.
- **Problem and importance:** A narrow 24-hour window misses reminders after downtime. Separate find/send/save operations allow duplicate sends when jobs overlap or multiple server instances run; cancellation can race with delivery.
- **How I would solve it:** Use a durable due-time queue/outbox with atomic claims and expiring leases. Recheck booking state before delivery, catch up overdue work under a documented late-send policy, and deduplicate with a stable event key; acknowledge unavoidable provider-delivery ambiguity.
- **Acceptance checks:** Restart and two-worker tests avoid missed work and unnecessary duplicates; cancelled bookings do not normally receive pending reminders.

### 17. Separate test email from actual delivery and report truthful status

- [ ] **P1 — Notifications/deployment**
- **Evidence:** `server/services/notifyService.js:getTransporter; client/src/pages/ProviderProfilePage.jsx:246`.
- **Problem and importance:** Only Ethereal or JSON transport is configured. Production users will not receive real mail, while the booking UI claims a notification was dispatched before delivery is known.
- **How I would solve it:** Configure production SMTP/provider credentials through environment validation; explicitly label demo mode. Return queued notification status and use wording consistent with actual delivery state; escape user-controlled HTML template values.
- **Acceptance checks:** Test mode never claims real inbox delivery; staging sends to a controlled inbox; failures are visible without undoing a valid booking.

### 18. Make provider registration and profile setup recoverable

- [ ] **P1 — Account consistency**
- **Evidence:** `server/controllers/authController.js:register; providerController.js:createProvider`.
- **Problem and importance:** User and provider writes are separate; a provider-creation failure leaves an existing account but a failed registration response. Registration does not create the availability document that the other creation path creates.
- **How I would solve it:** Unify provisioning in a transaction where supported, or implement an idempotent compensating workflow. Create the same explicit initial availability in every path and provide repair/setup handling for incomplete profiles.
- **Acceptance checks:** Injected failure leaves no orphan account or has a documented recoverable state; retry succeeds without duplicates; registered providers get consistent initial hours.

### 19. Prevent stale provider/slot results from winning request races

- [ ] **P1 — Client reliability**
- **Evidence:** `client/src/pages/ProviderProfilePage.jsx:29-65; client/src/pages/HomePage.jsx:useEffect/fetchProviders`.
- **Problem and importance:** Requests are neither cancelled nor associated with the currently selected query. Selecting services or categories quickly allows an old response to overwrite a new one. Failed slot loads also leave previous slots stored.
- **How I would solve it:** Use the existing React Query dependency with query keys containing provider/service/filter values, or AbortController plus response identity guards. Clear selection on provider/service changes and distinguish errors from empty results.
- **Acceptance checks:** Artificially reordered responses never mix service A slots with service B; failed loads show an error/retry state and cannot book stale slots.

### 20. Unify cancellation policy, audit data and user feedback

- [ ] **P1 — Cancellation UX**
- **Evidence:** `server/controllers/appointmentController.js:cancelAppointment/updateAppointmentStatus; client dashboard; provider dashboard`.
- **Problem and importance:** Client and provider cancellation use different endpoints. Admin cancellations are labelled provider; there is no cancelledAt, actor ID or reason. The UI offers cancellation only for confirmed while the backend also permits requested; provider cancellation has no confirmation or in-flight lock.
- **How I would solve it:** Route cancellation through one domain function, add actor ID/role, timestamp and optional reason, apply the state policy consistently, show the cutoff in the client UI and add provider confirmation/pending protection. Preserve server enforcement.
- **Acceptance checks:** Client/provider/admin actors are recorded accurately; repeated clicks do not cause conflicting actions; expired cutoffs show clear feedback; requested behavior is consistent.

### 21. Notify affected parties when an appointment is cancelled

- [ ] **P2 — Cancellation notifications**
- **Evidence:** `server/controllers/appointmentController.js; server/services/notifyService.js`.
- **Problem and importance:** Cancellation saves the status but notifies neither party. A provider or client may continue planning around an appointment that no longer exists.
- **How I would solve it:** Add cancellation events to the durable notification outbox, deliver to the affected parties, and include actor, appointment details and reason where appropriate. Keep cancellation successful if delivery is temporarily unavailable.
- **Acceptance checks:** A cancellation queues one event; retries do not create duplicate event records; both relevant recipients receive the correct notice.

### 22. Handle damaged or stale browser session storage

- [ ] **P2 — Authentication UX**
- **Evidence:** `client/src/context/AuthContext.jsx:initial state/initAuth; client/src/services/api.js`.
- **Problem and importance:** An invalid localStorage user JSON crashes initialization. A cached user without a token remains logged in visually because initAuth does not clear it. Every session-restoration network error logs the user out.
- **How I would solve it:** Guard JSON/storage access, clear user state when token is absent and treat 401 separately from transient failures. Centralize session changes and synchronize tabs; evaluate HttpOnly cookie sessions with CSRF protection as a separate security improvement.
- **Acceptance checks:** Invalid JSON does not crash; tokenless cache is signed out; temporary network loss has a retry state; logout synchronizes between tabs.

### 23. Revalidate token subjects and define revocation behavior

- [ ] **P2 — Authentication/security**
- **Evidence:** `server/middleware/auth.js; authController.js:getMe`.
- **Problem and importance:** Authorization trusts role and ID from a valid token without looking up the current user. Deleted users or changed roles can remain authorized until expiry; logout only deletes the browser's token.
- **How I would solve it:** Resolve an active current account on protected requests or use a validated token-version/revocation strategy. Define expiry/logout behavior; do not claim immediate server logout until implemented.
- **Acceptance checks:** Deleted or disabled users fail protected requests; role changes take effect according to the documented policy; revoked tokens are rejected.

### 24. Classify past appointments by time and status honestly

- [ ] **P2 — Dashboards**
- **Evidence:** `client/src/pages/ClientDashboardPage.jsx:filteredAppointments`.
- **Problem and importance:** Upcoming includes every confirmed/requested booking even after its time has passed. Past shows only completed, and no-shows are placed under Cancelled, hiding their meaning.
- **How I would solve it:** Define explicit upcoming, past, cancelled and no-show semantics using timestamps plus status; retain unresolved past bookings in a clearly named group.
- **Acceptance checks:** A confirmed appointment from yesterday is not labelled upcoming; no-show remains distinguishable from cancellation; each booking appears where expected.

### 25. Complete working-hours, blocked-time and service editing controls

- [ ] **P2 — Provider tools**
- **Evidence:** `client/src/pages/ProviderDashboardPage.jsx`.
- **Problem and importance:** The weekly editor only toggles days and defaults new days to 09:00-17:00; it cannot edit actual hours or split shifts. Backend service update and blocked-range creation are not exposed in this dashboard; blocked-range removal is absent.
- **How I would solve it:** Build validated time-range inputs, service edit controls and blocked-range add/list/remove management with ownership checks. Warn about conflicts with existing appointments rather than silently cancelling them.
- **Acceptance checks:** A provider can set 11:00-15:30, edit a service and add/remove a holiday block; existing bookings are shown when changes conflict.

### 26. Handle incomplete provider profiles and partial dashboard failures

- [ ] **P2 — Provider tools**
- **Evidence:** `client/src/pages/ProviderDashboardPage.jsx:providerId/fetchDashboardData`.
- **Problem and importance:** Missing providerId falls through to a dashboard with nonfunctional actions. Promise.all makes one failing endpoint prevent all dashboard data from being applied.
- **How I would solve it:** Provide a setup/repair screen when no profile exists. Load schedule, services and availability independently with section-level errors and retry; disable actions until their prerequisites exist.
- **Acceptance checks:** An incomplete provider sees actionable setup; a failed availability request does not hide a successfully loaded schedule.

### 27. Display and paginate the appointment data already fetched

- [ ] **P2 — Admin tools**
- **Evidence:** `client/src/pages/AdminDashboardPage.jsx; server/controllers/adminController.js:getAllAppointments`.
- **Problem and importance:** The admin frontend fetches appointments but never renders them. The backend returns only the latest 100 without pagination, so older bookings cannot be inspected through that response.
- **How I would solve it:** Add an appointment table with pagination, date/status/provider filters and owner-aware authorized management actions. Return total and cursor/page metadata; paginate client/provider/admin lists consistently.
- **Acceptance checks:** An admin can find a booking older than the first 100; list counts and navigation match filtered results.

### 28. Match search promises and expose pagination

- [ ] **P2 — Discovery**
- **Evidence:** `client/src/pages/HomePage.jsx; server/controllers/providerController.js:listProviders`.
- **Problem and importance:** The search placeholder promises service and location search, but search matches only businessName, description and category. The frontend ignores pagination and shows at most the default ten providers. Registration and discovery category lists differ.
- **How I would solve it:** Implement service/location search or correct the placeholder; render server pagination and total counts. Share a category definition and support all available categories or a documented subset.
- **Acceptance checks:** Searching a service or city behaves as advertised; provider 11 is reachable; all supported categories can be found.

### 29. Use explicit public provider response fields

- [ ] **P2 — Public API/privacy**
- **Evidence:** `server/controllers/providerController.js:listProviders/getProviderById; availabilityController.js:getAvailability`.
- **Problem and importance:** Public responses expose populated account email/phone and internal availability including blocked-range reasons. This may reveal personal contact details or private reasons beyond what booking requires.
- **How I would solve it:** Define public DTOs containing only intended business contact information and bookable availability. Restrict internal blocked reasons and account fields to owner/admin access; document any intentionally public contact fields.
- **Acceptance checks:** Public responses omit private account data and blocked reasons; owner/admin tools retain needed fields.

### 30. Map expected errors to stable, safe responses

- [ ] **P2 — Error handling**
- **Evidence:** `server/middleware/errorHandler.js; unvalidated controller lookups; appointmentController.js:post-save User.findById`.
- **Problem and importance:** All unclassified errors become 500 and expose err.message, including cast/validation/duplicate-key details. Concurrent duplicate registration is not mapped to 409. The detached confirmation user lookup has no rejection handler.
- **How I would solve it:** Map known validation, cast, not-found and duplicate errors to 400/404/409; return generic unexpected production errors with request IDs and redacted logs. Replace detached mail work with the outbox or handle its full promise chain.
- **Acceptance checks:** Malformed IDs return 400; concurrent duplicate registration returns 409; unexpected exceptions expose no internals; lookup failures do not become unhandled rejections.

### 31. Bound public workloads and configure cross-origin access explicitly

- [ ] **P2 — Reliability/security**
- **Evidence:** `server/server.js:CORS/authLimiter; availability and search routes`.
- **Problem and importance:** CORS reflects any origin with credentials enabled; only auth routes are rate limited. Public slot generation and expensive searches have no workload-specific limits. CORS is not an authorization mechanism.
- **How I would solve it:** Use an environment-specific origin allowlist, enable credentials only if needed, cap request/search/range sizes and add reasonable per-route limits with deployment-aware proxy configuration. Keep ownership and authentication checks independent.
- **Acceptance checks:** Unknown origins receive no cross-origin grant; expensive repeated requests are limited; ordinary booking remains usable behind the intended proxy.

### 32. Replace approval toggles with explicit idempotent updates

- [ ] **P2 — Approval consistency**
- **Evidence:** `server/controllers/adminController.js:toggleProviderApproval; client/src/pages/AdminDashboardPage.jsx:handleToggleApproval`.
- **Problem and importance:** Retries or rapid repeated clicks toggle approval twice and can restore an unwanted state. The UI has no per-provider pending guard.
- **How I would solve it:** Set an explicit desired isApproved boolean through a validated endpoint, optionally matching a version for concurrent administration. Disable the relevant action while it is pending and audit the actor.
- **Acceptance checks:** Repeating an approve request leaves approval true; conflicting administrator changes are detected rather than silently inverted.

### 33. Repair modal keyboard/focus and action semantics

- [ ] **P2 — Accessibility**
- **Evidence:** `client/src/components/ui/Modal.jsx; ProviderProfilePage.jsx:service motion.div; Navbar.jsx`.
- **Problem and importance:** The shared modal lacks dialog semantics, focus trapping, initial/return focus and a labelled close control. Clickable service cards are divs. Multiple mounted modal effects independently reset body overflow, so a closed modal can undo another modal's scroll lock.
- **How I would solve it:** Use an accessible dialog primitive or implement role/aria-modal, labelled heading, focus management, inert background and shared scroll locking. Use buttons/radio semantics for service selection; label icon actions and verify narrow navigation.
- **Acceptance checks:** Keyboard-only selection and confirmation work; focus remains in an open dialog then returns; background stays locked with multiple modal instances; test 320px navigation.

### 34. Repair lint tooling and broaden meaningful regression coverage

- [ ] **P2 — Quality checks**
- **Evidence:** `client/package.json; server/tests/availabilityEngine.test.js; TASK.md`.
- **Problem and importance:** The lint script references ESLint but no ESLint dependency or config is present. Only three availability tests are checked in; they do not cover cancellation, authorization, concurrency or frontend flows. TASK.md's completed end-to-end claim is not evidenced by a checked-in E2E suite.
- **How I would solve it:** Add ESLint and a compatible React/hooks configuration, fix violations, export an app factory separate from startup for Supertest, and add targeted API/concurrency/browser tests. Use deterministic clocks/timezones and guaranteed test cleanup; update task evidence honestly.
- **Acceptance checks:** Build/lint and regression suites pass in CI; every P0/P1 invariant has a failure-before/fix-after test; test DB cleanup tolerates setup failure.

### 35. Document and verify production routing, readiness and shutdown

- [ ] **P2 — Deployment**
- **Evidence:** `client/vite.config.js; client/src/services/api.js; server/server.js; server/config/db.js`.
- **Problem and importance:** The /api proxy exists only for Vite development; the Express app does not serve the built client. No deployment config establishes production API forwarding or SPA history fallback. Startup promises and background jobs have no coordinated graceful shutdown.
- **How I would solve it:** Document and implement either same-origin reverse proxy/static hosting or a validated API base URL, SPA fallback, environment checks, startup error handling and SIGTERM/SIGINT cleanup for HTTP, cron and database connections. Do not start the existing server merely to test this because it seeds and schedules work.
- **Acceptance checks:** A production build can log in and refresh /providers/:id; readiness fails when dependencies fail; shutdown drains requests and closes resources.

### 36. Remove fabricated ratings and reconcile optional feature claims

- [ ] **P3 — Presentation/scope**
- **Evidence:** `client/src/pages/HomePage.jsx; ProviderProfilePage.jsx; server/models/Review.js; TASK.md`.
- **Problem and importance:** An unrated provider (avgRating=0) displays 5.0. A Review model exists without review endpoints or UI; service edit and other capabilities are partly backend-only. This makes the product appear more complete than its actual flows.
- **How I would solve it:** Show 'Not rated yet' when no verified reviews exist; track review count and compute aggregates only if reviews are implemented. Mark reviews as optional and keep task/spec completion aligned with demonstrable behavior. Rescheduling, payments and refunds are feature requests, not automatically bugs.
- **Acceptance checks:** An unrated provider shows no invented score; optional features are labelled accurately; implemented features can be demonstrated end-to-end.

### 37. Make provider timezone explicit throughout scheduling

- [ ] **P2 — Timezone correctness**
- **Evidence:** `server/services/availabilityEngine.js; appointmentController.js:getProviderAppointments; client/src/lib/utils.js; SlotPicker.jsx`.
- **Problem and importance:** Working hours and date filters use the server's local timezone, while displays/grouping use the browser timezone. Providers have no timezone field. The same 09:00 opening can refer to different instants after deployment, and daylight-saving boundaries are undefined.
- **How I would solve it:** Store an IANA timezone for each provider, convert local working hours and date filters to UTC with timezone-aware date utilities, persist instants in UTC, and label the displayed timezone. Define handling for ambiguous/nonexistent DST times.
- **Acceptance checks:** Run fixtures with different server/browser/provider zones and DST boundaries; booking and schedule dates consistently represent the provider's intended hours.

## Verification performed

| Check | Result | Interpretation |
| --- | --- | --- |
| Frontend production build: npm run build | Passed | Vite transformed 2,016 modules and generated dist output. Compilation does not verify user flows. |
| Frontend lint: npm run lint | Blocked | The eslint executable is missing; package.json has no ESLint dependency and no checked-in configuration was found. |
| Backend tests: npm test -- --watch=false | Environment-blocked | Jest failed while renaming a transform-cache file with EPERM; zero test cases ran. |
| Backend retry without caching, including direct Jest invocation | Environment-blocked | Same transform-cache EPERM occurred. The npm retry also warned about npm cache flag parsing; direct invocation removed that ambiguity but did not resolve EPERM. |
| Source review | Completed for the listed application areas | Findings are code-backed; live exploit, SMTP delivery, multi-worker concurrency and browser accessibility tests were not executed. |
| Working-tree review | Only this report added | No application fixes were applied; generated dist output is ignored by git. |

The backend test failure is a local execution limitation, not a proven application-test assertion failure. Do not mark those tests as passing. Re-run on a runner with a writable Jest cache/temp location; if necessary use an explicit workspace-local cacheDirectory and an isolated test database.

## Recommended execution order

- [ ] **Stage 1 — Deployment blockers:** items 01–03. Remove predictable secrets, automatic demo admin seeding and silent temporary database fallback before real users.
- [ ] **Stage 2 — Reservation correctness:** items 04–14 and 37. Implement authoritative booking rules, atomic reservation writes, input validation, timezone rules and immutable booked terms.
- [ ] **Stage 3 — Notifications and cancellation:** items 15–17 and 20–21. Share cancellation policy and add durable, observable notification processing.
- [ ] **Stage 4 — Account and frontend reliability:** items 18–19 and 22–29. Repair provisioning, sessions, stale requests and incomplete dashboard/discovery workflows.
- [ ] **Stage 5 — Operational polish:** items 30–36. Tighten error handling/public workloads, idempotent administration, accessibility, tooling and deployment.
- [ ] Add each stage's targeted regression checks alongside its code changes; do not postpone P0/P1 tests until Stage 5.
- [ ] Update TASK.md and setup/deployment instructions to reflect verified behavior rather than intended behavior.
- [ ] Review and re-prioritize any newly discovered failures after the first working end-to-end run.

## Focused release regression checklist

- [ ] Client registration/login/logout; malformed storage and expired tokens.
- [ ] Provider registration creates a consistent profile and schedule.
- [ ] Unauthorized users cannot manage another provider or appointment.
- [ ] New/pending/revoked providers follow the intended approval policy.
- [ ] Valid booking succeeds; wrong-provider service, past time, closed hours and blocked slots fail.
- [ ] Parallel bookings cannot overlap, including buffer periods and different services.
- [ ] Timezone, date-range end boundaries, zero buffer and DST fixtures pass.
- [ ] Client cancellation succeeds before cutoff and fails after it; provider/admin actions are audited.
- [ ] Cancellation/completion races cannot overwrite terminal outcomes.
- [ ] No-show/completion before their permitted time fails.
- [ ] Changed service prices or cancellation policies do not rewrite booked terms.
- [ ] Cancellation releases availability and queues appropriate notices.
- [ ] Notification failures retry; worker restart and multiple instances behave safely.
- [ ] Discovery search/pagination and admin appointment lists expose the full intended dataset.
- [ ] Keyboard-only booking/cancellation works and modals restore focus.
- [ ] Production build, lint, backend/API/concurrency tests and critical browser flows pass.
- [ ] Production restart retains data; unavailable DB fails readiness without fallback.
- [ ] Deployed frontend/API routing and direct SPA page refresh work.

## Scope boundaries and remaining uncertainty

- Reviews are explicitly optional/stretch in PROJECT_SPEC.md. Their absence is not a mandatory defect; the invented 5.0 fallback is a presentation defect.
- Rescheduling, payments/refunds, refresh tokens, and additional AI features were not classified as required bug fixes because the present code does not establish them as committed core behavior.
- Real SMTP credentials, deployed JWT configuration and database health were not inspected. The report identifies unsafe fallback paths, not the configuration of an unseen deployment.
- No package vulnerability advisory lookup or dependency audit was completed. Old version ranges alone are not evidence of a specific vulnerability. Add a lockfile-based advisory check in CI and review concrete findings before upgrading.
- No exhaustive visual/mobile/browser test was performed. Navbar overflow is an acceptance check to execute, not a confirmed visual defect.
- The three existing availability tests are present but were not executed successfully in this environment. In particular, the zero-buffer test is relevant to item 08 and should be rerun after that fix.




## Implementation update � first requested fix batch (30 October 2026)

The original findings above describe the pre-fix code. These scoped checkboxes record what was implemented; broader roadmap recommendations remain outstanding where noted.

- [x] #01: Require a nonblank JWT_SECRET; remove the embedded fallback. Existing deployed secrets still require operator review/rotation if previously exposed.
- [x] #02: Skip automatic demo seeding in production, with a second guard inside the seed function.
- [x] #03: Require MONGODB_URI; propagate connection failures and stop startup instead of using MongoMemoryServer.
- [x] #05: Reject foreign-provider services in booking and slot discovery.
- [x] Additional #07 approval fix: New providers default to pending. Public profiles, public service lists, slots and new bookings enforce approval. Authenticated owners/admins can read pending services for setup, and existing bookings remain manageable. Existing documents are not automatically changed.
- [x] #06: Reject invalid/past starts and revalidate the requested time against the shared slot generator before saving, enforcing opening hours, full service containment, the service slot grid, blocks and buffers.
- [x] #08: Preserve a zero buffer; check buffer intervals on both sides of appointments in slot discovery and booking conflict checks, including mixed service durations. The appointment query now uses the same whole-day bounds as slot generation so occupied slots are not missed at range edges.
- [x] #11 (requested quick scope): Add provider/service PATCH validators, ID checks, partial-update semantics and numeric bounds; align create numeric validation and model constraints. Comprehensive registration-field reuse and other route validation remain follow-up work.
- [x] #36 (requested quick scope): Replace the invented 5.0 fallback with �No ratings yet� on discovery and profile pages. Review endpoints and verified review aggregation remain optional future features.

Configuration now requires a real reachable MongoDB instance and a nonblank JWT_SECRET. Set NODE_ENV=production to disable demo seeding. Newly registered providers need an admin's approval before they can accept bookings. No credentials or database records were changed by this patch.

Regression command: `cd server` then `npm run test:quick`. This uses Node's built-in runner, isolated model mocks and actual express-validator chains; it does not connect to MongoDB, start the application, or send email. Existing MongoDB-backed availability fixtures now explicitly create approved providers. Concurrency/double-booking, notification redesign and the remaining roadmap are outside this patch.

Batch verification: all 9 focused Node regression checks passed; the frontend production build passed. JavaScript syntax and git whitespace checks were also run. The MongoDB-backed Jest suite remains unverified after the earlier sandbox cache permission failure; the focused checks use isolated mocks rather than a live database.
