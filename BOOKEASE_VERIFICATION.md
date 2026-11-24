# Verify BookEase with MongoDB Atlas and real email

Use a disposable database named `bookease_verify` and inboxes you control. Leave your Atlas URI, JWT secret, and SMTP credentials in `server/.env`. The repository ignores `.env`.

## Connect to Atlas

1. Create or select a cluster in Atlas. In **Connect**, add the current public IP for the computer running BookEase. If the server runs elsewhere, add that server's outbound IP instead.
2. Create a database user with the `readWrite` role for `bookease_verify`.
3. Open **Connect → Drivers → Node.js**. Copy the provided URI, substitute the database user's credentials, and put `/bookease_verify` before the query string. Percent-encode reserved characters in the database password.
4. In the repository, copy `server/.env.example` to `server/.env` if you do not already have a local configuration. Set the variables below. Generate a private JWT secret locally with `openssl rand -hex 32`.

[Atlas connection instructions](https://www.mongodb.com/docs/atlas/driver-connection/)

## Configure a real inbox

Use an SMTP service with a verified sender. Set its host, port, username, and SMTP credential. If the service requires sender verification or restricts permitted recipients, complete that setup in the service first. Set `MAIL_FROM` to the verified sender. Encode reserved characters in URL credentials. For implicit TLS on port 465 use `smtps://`. For a service using port 587 with STARTTLS, use `smtp://` and the provider's required TLS settings.

```dotenv
PORT=5000
MONGODB_URI=mongodb+srv://DB_USER:ENCODED_PASSWORD@CLUSTER_HOST/bookease_verify?retryWrites=true&w=majority
JWT_SECRET=REPLACE_WITH_LOCALLY_GENERATED_SECRET
SMTP_URL=smtps://SMTP_USER:ENCODED_SMTP_PASSWORD@SMTP_HOST:465
MAIL_FROM="BookEase <VERIFIED_SENDER@example.com>"
APP_URL=http://localhost:3000
```

Remove `EMAIL_TRANSPORT=json` from your local settings for the real inbox run. To check SMTP authentication without sending a message, run this from the `server` directory after installing dependencies.

```sh
node -r dotenv/config -e 'const n=require("nodemailer"); const url=process.env.SMTP_URL; if(!url) throw Error("Set SMTP_URL first"); n.createTransport(url).verify().then(()=>console.log("SMTP connection verified")).catch(e=>{console.error(e.code||e.message);process.exitCode=1})'
```

SMTP verification checks the connection and authentication. The inbox test below confirms the sender and actual delivery. [Nodemailer SMTP configuration](https://nodemailer.com/smtp)

## Start BookEase

Run `npm ci` in both `server` and `client` if needed. In two terminals, run `npm start` from `server` and `npm run dev` from `client`. Open `http://localhost:3000`. The server listens on port 5000.

For this isolated development run, the empty database is seeded on first start. Use the seeded admin only to approve a newly registered provider whose email goes to a test inbox you control. Register two or three clients using test inboxes you control. Keep the app locally accessible while using the demo credentials.

## Run the browser and inbox checks

| Check | What to do | Expected result |
|---|---|---|
| Demo top-up | Add funds as the client | Top bar updates and the client receives a top-up receipt. |
| Hold and booking | In separate browser sessions, try the same slot. Confirm as the holder. Close another hold and try it from a second session. | One holder gets checkout. The other sees the held state or a conflict. Closing checkout releases that hold. A successful booking debits once and sends one confirmation receipt. |
| Reschedule | Move a paid appointment to an available time. Then try moving it to an unavailable time. | A successful move keeps the payment and emails the client and provider. If the move fails, the original booking remains. |
| Provider schedule | Set a timezone and two shifts on a day. Add and remove a holiday block. Attempt a block over an active booking. | Only shift times are bookable. Changes that affect active bookings show those appointments before anything is saved. |
| Waitlist and refund | Have two clients join the same booked slot. Cancel the original appointment. Test offer expiry or have the first client claim. | The original client gets the refund outcome. The provider gets a cancellation email. The first eligible client gets the exclusive offer. |
| Reminder | Book a slot within the next 24 hours and keep the server running through the next 15-minute check. | A reminder arrives. Check Spam or Promotions if it appears missing. |

In Atlas Data Explorer, inspect `emailnotifications` for `status`, `attempts`, `lastError`, `deliveryMode`, and `sentAt`. A successful `smtp` result means the SMTP server accepted the message. Confirm the final receipt in the intended inbox. Leave passwords and complete connection strings out of any screenshots or logs you share.

Once you have entered the settings, tell Codex which approved test addresses to use and confirm it may send BookEase test emails to them. For private inboxes, you can confirm receipt or share redacted subjects and timestamps. The app cannot inspect a private inbox without access you explicitly provide.

## Run automated checks against an isolated database

From `server`, run `npm run test:quick` for the mock-based checks and `npm run test:integration` for the replica-set API test. The integration test starts an isolated MongoDB process and may download a test binary on first run. It uses Nodemailer's JSON transport, so it does not send messages to inboxes. Run `npm run build` from `client` for the frontend build check.
