# BookEase viva brief and VS Code walkthrough

## 1. Opening explanation - about 45 seconds

"Good morning. My project is BookEase, a full-stack appointment booking and management application. It connects clients with service providers such as clinics, salons and tutors. Clients can find approved providers, select a service, view available slots, book an appointment and cancel it under the cancellation policy. Providers manage services, weekly hours and appointment statuses. Administrators manage provider approval and view platform statistics.

The frontend uses React, the backend uses Node.js and Express, and data is stored in MongoDB using Mongoose. JWT handles authentication, bcrypt hashes passwords, and role plus ownership checks protect business operations. The main business logic is calculating valid appointment slots and checking them again when a booking is submitted."

## 2. Demonstration order - around 5 minutes

1. Open the running home page. Explain provider discovery, category filtering and service previews.
2. Log in as a client. Open an approved provider and select a service.
3. Explain that duration, working hours, blocked periods, existing bookings and buffer time determine the displayed slots.
4. Book a FUTURE available slot. For a cancellation demonstration, choose a slot well beyond the provider's cancellation cutoff.
5. Open My Appointments. Show the saved appointment and cancel it through the confirmation dialog.
6. Switch to the provider account. Show its schedule, add a service and show weekly-hour controls. The current weekly editor toggles days; it is not a full time-range editor.
7. Explain completed/no-show/cancel actions. Use a separate demonstration booking if you want to show completion, because terminal bookings cannot be cancelled again.
8. Switch to admin. Show approval/revocation and platform statistics. A newly registered provider needs approval before appearing in public booking.
9. Finish with one booking's code trace, then summarize limitations and future work.

Use development mode for the lab; demo seeding remains available outside production and only seeds an empty database. A real reachable MongoDB URI and nonblank JWT secret are required. Do not display the .env file to explain configuration; show .env.example instead. Do not delete existing data to force demo seeding.

## 3. Best code presentation order

Start with the visible screen, then briefly show the backend entry point, and trace ONE booking end to end. Explain what each file contributes rather than reading every line.

VS Code tips: Ctrl+P opens a file by name. Ctrl+F locates a function in the file. Ctrl+Shift+O lists file symbols. Ctrl+Shift+F finds all references to a function name. Ctrl+click/F12 can follow definitions where JavaScript navigation resolves them.

| Step | Open using Ctrl+P | Find / explain |
| --- | --- | --- |
| 1 | client/src/main.jsx | ReactDOM.createRoot mounts App into the root DOM element; StrictMode is a development aid. |
| 2 | client/src/App.jsx | Routes choose screens. AuthProvider shares user state; ThemeProvider shares theme. ProtectedRoute checks login/role for dashboard navigation. |
| 3 | server/server.js | Express app initialization, dotenv configuration, security/parsing middleware, API route mounts, DB connection, nonproduction seed, cron initialization and HTTP listener. |
| 4 | client/src/pages/ProviderProfilePage.jsx | fetchProvider, fetchSlots, handleSlotSelect and handleConfirmBooking. This is the user-facing start of the booking flow. |
| 5 | client/src/components/booking/SlotPicker.jsx | Groups API slots by calendar day and calls onSelectSlot when a slot is clicked; it does not authoritatively calculate availability. |
| 6 | client/src/services/api.js | appointmentAPI.create sends POST /appointments under baseURL /api/v1. The request interceptor attaches the Bearer token. |
| 7 | client/vite.config.js | In development, Vite forwards /api requests to the Express server at localhost:5000. This is not production hosting configuration. |
| 8 | server/routes/v1/appointmentRoutes.js | POST / uses authMiddleware, requireRole, createAppointmentValidation, then createAppointment. |
| 9 | server/middleware/auth.js | JWT verification establishes req.user. A secret is required; no hardcoded fallback remains. |
| 10 | server/middleware/role.js | Restricts action to allowed roles. Role checks alone do not establish ownership of a particular record. |
| 11 | server/validators/appointmentValidator.js | Checks request shape: valid IDs, ISO date and allowed status values. Business validity is still checked by the controller/engine. |
| 12 | server/controllers/appointmentController.js | createAppointment checks service/provider, future time, exact available slot and final conflicts, saves the record and responds. |
| 13 | server/services/availabilityEngine.js | getAvailableSlots and checkSlotConflict. Explain schedule generation, active-booking exclusion and buffers. |
| 14 | server/models/Appointment.js | MongoDB document fields, allowed statuses, references and provider/time index. Mongoose enforces schema rules. |
| 15 | server/config/db.js | Requires MONGODB_URI and connects using Mongoose. Failure stops startup instead of using temporary storage. |
| 16 | client/src/pages/ProviderProfilePage.jsx | After a successful response, sets booking success, displays a toast and refreshes slots. |
| 17 | client/src/pages/ClientDashboardPage.jsx | Fetches appointments; confirmCancel calls appointmentAPI.cancel and refreshes the list. |
| 18 | server/controllers/appointmentController.js | cancelAppointment authorizes the actor, checks status/cutoff and saves cancelled status. |
| 19 | server/controllers/providerController.js | Explain public directory/profile and owner-managed business settings. |
| 20 | server/controllers/serviceController.js | Explain service create/update and soft delete. |
| 21 | server/controllers/availabilityController.js | Explain weekly-hour reads/writes, blocked ranges and forwarding slot queries to the engine. |
| 22 | server/controllers/authController.js | Explain register, login and getMe. |
| 23 | server/controllers/adminController.js | Explain approval toggle and platform statistics. |
| 24 | server/services/notifyService.js and server/jobs/reminderCron.js | Confirmation/reminder attempts currently use test mail transport; cron checks every 15 minutes. |

App.jsx installs a React Query provider, but the current page fetching mainly uses useEffect, useState and direct API calls. Do not claim all requests use React Query caching.

## 4. Booking request - say it in this order

1. **UI state:** Selecting a service triggers fetchSlots. The server computes slots; SlotPicker renders them.
2. **User action:** A slot opens the confirmation modal. handleConfirmBooking submits providerId, serviceId, slotStart and optional notes. The server determines clientId from the verified token.
3. **HTTP client:** api.js adds /api/v1 and the Bearer header. Development proxying forwards the request to Express.
4. **Route:** appointmentRoutes.js chooses the handler from method/path. Middleware checks token, allowed role and request format.
5. **Controller:** Service must exist, be active and belong to the selected provider. Provider must be approved. Start must be a valid future instant.
6. **Business service:** The controller asks the shared availability engine whether that exact start is an available slot, then rechecks conflicts.
7. **Persistence:** The controller constructs an Appointment. Mongoose validates and saves it to MongoDB with status confirmed.
8. **Notification attempt:** Confirmation mail work starts separately; it does not block the 201 response and is not proof of inbox delivery.
9. **Response:** Express sends JSON shaped as { data: { appointment } }.
10. **UI update:** Axios wraps that JSON in response.data, so pages access response.data.data. The success UI appears and slots are fetched again.

If the teacher asks where to place breakpoints: handleConfirmBooking -> API request interceptor -> createAppointment -> getAvailableSlots -> appointment.save -> the frontend success branch. A backend breakpoint requires attaching VS Code's Node debugger to the running server; a browser breakpoint uses the browser/VS Code JavaScript debugger.

## 5. Slot-calculation explanation

The engine loads the approved provider, its active service and the provider's schedule. Missing schedules use Monday-Friday 09:00-17:00. It iterates the requested calendar days and generates starts at serviceDuration + bufferMinutes increments. A zero buffer stays zero.

It excludes past starts, slots overlapping blocked intervals and slots overlapping active appointments with turnaround time. Only requested/confirmed appointments block slots; cancelled/completed/no-show do not.

For ordinary intervals, overlap means A.start < B.end AND A.end > B.start. Buffer-aware checks extend the exclusion around existing appointments. Exact permitted boundaries do not overlap. The database query and generation now use matching whole-day bounds.

**Honest limit:** rechecking availability reduces stale bookings, but check-then-save is not atomic. Two simultaneous requests can still race. A future fix needs database-enforced reservation serialization or unique occupied time units.

## 6. Authentication code flow

RegisterPage/LoginPage -> authAPI -> authRoutes -> validation -> authController -> User/Provider models -> JWT response -> AuthContext.

Registration hashes the password with bcrypt using a salt cost of 10. Login compares the submitted password to the saved hash. JWT is signed, not encrypted: its claims are readable, and the signature detects tampering. Tokens expire after two hours.

AuthContext currently stores the token and selected user data in localStorage. On restoration, getMe fetches the current account. api.js attaches the token to protected requests and clears stored session data on 401. UI route protection improves navigation; server-side authentication, role and ownership checks enforce actual access.

## 7. Cancellation code flow

ClientDashboardPage.confirmCancel -> appointmentAPI.cancel -> PATCH /api/v1/appointments/:id/cancel -> authMiddleware -> cancel ID validation -> cancelAppointment -> Appointment.save -> refreshed client list.

The controller loads the appointment and permits only confirmed/requested states. It allows its client, provider owner or admin. Ordinary clients must cancel before the configured cutoff; owners/admins bypass it.

Example: with a 2-hour policy and appointment at 4 PM, cancellation is permitted up to 2 PM under the current strict greater-than comparison. After 2 PM the client receives 403. The database record remains, status becomes cancelled, and the engine no longer treats it as occupied. The provider dashboard uses the status-update endpoint instead.

## 8. Database model explanation

| Model | Responsibility / relationship |
| --- | --- |
| User | Name, unique email, passwordHash, role and phone. |
| Provider | Business profile; userId refers to the owner User. Includes buffer, cancellation policy, approval and stored average rating. |
| Service | Offering owned by a Provider: name, duration, price and active flag. |
| Availability | Provider's weekly hours and exceptional blocked ranges. |
| Appointment | Connects a client User, Provider and Service, with start/end, status, notes and reminder flag. |
| Review | Optional model exists; review API/UI is not implemented. |

Mongoose is an ODM: it maps JavaScript models/documents to MongoDB collections and provides schemas, validation and queries. References are ObjectIds; populate fetches selected related documents for readable responses. An index accelerates lookups but the current nonunique provider/time index does not enforce exclusive reservations.

## 9. Common viva questions - short answers

**Why split routes, controllers, models and services?** Routes map URLs and middleware; controllers coordinate a use case; models describe stored data; reusable business logic such as slot calculation belongs in services.

**What are req, res and next?** req holds the incoming request, res builds the response, and next passes control onward. next(err) invokes centralized error handling.

**Where do parameters come from?** req.body holds submitted JSON, req.params holds URL values such as :id, req.query holds ?status=..., and req.user is added by authentication middleware.

**Why async/await?** Database/network calls return promises. Await lets a controller sequence dependent operations without blocking the entire Node.js process while I/O completes. try/catch forwards errors.

**Authentication versus authorization?** Authentication verifies identity. Authorization decides whether that user may perform an action on this specific resource.

**What does lean do?** It returns plain JavaScript objects instead of full Mongoose documents, useful for read-only responses. Such objects do not have document.save().

**POST, GET, PATCH, PUT, DELETE?** Create, retrieve, partially update, replace the supplied representation/configuration, and remove/deactivate. This project uses DELETE for soft service deactivation.

**Important response codes?** 200 success; 201 created; 400 invalid input/state/slot; 401 unauthenticated; 403 authenticated but forbidden or cancellation cutoff expired; 404 missing/unavailable resource; 409 duplicate/conflict; 500 unexpected server failure.

**Why validate on the server if inputs are checked in React?** A caller can bypass the interface and send API requests directly.

**Why soft delete a service?** Stop new bookings while keeping references from historical appointments.

**What security measures exist?** Password hashing, required signing secret, expiring JWTs, role/ownership checks, validators, Helmet and auth-endpoint rate limits. This is not a claim of complete production security.

**What is the cron job?** A scheduled task checking every 15 minutes for confirmed bookings near 24 hours away. It attempts a reminder and uses reminderSent to avoid routine repeats. Robust retry and multi-worker processing remain improvements.

**Does mail reach a real inbox?** Current transport is Ethereal testing or JSON fallback. It demonstrates notification code, not production delivery.

**What have you tested?** Nine focused mock-based regression tests and the frontend production build passed during the fix batch. The existing MongoDB-backed Jest suite was blocked by sandbox cache permissions; do not describe it as passed.

**What is not implemented?** Rescheduling, calendar integration, real payment/refund flows, review submission, mobile app and reliable production notification queues are future features.

## 10. Closing statement - around 20 seconds

"To conclude, the project demonstrates a complete frontend-to-backend booking workflow with role-based management, server-side availability validation and persistent appointment records. The main learning is separating UI, API coordination, business rules and database models. My next priorities are atomic reservation handling, rescheduling, calendar integration and reliable notifications."

Tonight's preparation order: rehearse the opening twice; follow the booking trace in VS Code once; practise cancellation and login explanations; read the separate controller PDF; run the demonstration with the actual configured database before the viva.

