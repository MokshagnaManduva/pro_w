# Lannent — Middleware, Logging & Error Management
## Gap Analysis and Plan of Action

**Date:** 2026-08-26
**Scope:** `back-end/` (NestJS 11 + Express) and `front-end/` (static HTML/CSS/JS)
**Constraint agreed for this phase:** **no database.** Application data stays in the backend's in-memory arrays, mirrored into browser `localStorage` on the front-end. Only *logs* and *uploaded files* are written to disk.

---

## 1. Why this document exists

The assignment requires a functional web application with **all applicable middleware types** implemented, specifically:

1. Logging
2. Error handling
3. File upload
4. Security
5. Router-level middleware

…plus **log and error information persisted to files at regular intervals**.

The project already has a working NestJS API (12 controllers, 48 routes) and a 49-page front-end wired to it. Some of the cross-cutting layer exists but is console-only and incomplete. This document records exactly what is already built, what is missing, and the concrete order of work to close the gap.

---

## 2. Current architecture snapshot

```
40_Lannent/
├── back-end/                       NestJS 11, Express platform, port 3000, global prefix /api
│   └── src/
│       ├── main.ts                 bootstrap: prefix, CORS(*), ValidationPipe,
│       │                           ResponseInterceptor, HttpExceptionFilter, Swagger
│       ├── app.module.ts           12 feature modules + consumer.apply(LoggerMiddleware).forRoutes('*')
│       ├── common/
│       │   ├── middleware/logger.middleware.ts       console-only HTTP logger
│       │   ├── filters/http-exception.filter.ts      global catch-all → {success,message,data}
│       │   ├── interceptors/response.interceptor.ts  response envelope
│       │   ├── guards/role.guard.ts                  reads req.headers['role']
│       │   └── decorators/roles.decorator.ts         @Roles(...)
│       └── modules/                users, tasks, milestones, proposals, audit-requests,
│                                   audit-reports, disputes, transactions,
│                                   expert-applications, notifications, messages, seed
└── front-end/                      plain static HTML, no build step
    ├── index.html                  landing page
    ├── pages/*.html                49 pages, 4 roles
    └── js/  store.js  auth.js  main.js  validation.js  dashboard.js
```

**Persistence today:** every `*.repository.ts` holds `private xs: any[] = JSON.parse(JSON.stringify(SEED_X))` cloned from `modules/seed/seed.data.ts`. There is **no `fs` usage anywhere in `src/`** and no ORM. All data resets on restart.

**Front-end ↔ back-end:** live. `store.js:9` and `auth.js:8` both hard-code `http://localhost:3000/api`. All calls are **synchronous `XMLHttpRequest`**. On API failure every mutation silently fabricates a local record, so the UI appears to succeed while persisting nothing. `localStorage` is used for exactly one key today: `lannent_session`.

---

## 3. Requirement status at a glance

| # | Requirement | Status | Evidence in repo |
|---|---|---|---|
| 1 | **Logging middleware** | 🟡 Partial | `common/middleware/logger.middleware.ts` logs method/url/status/duration/role to the Nest console only. `ip` and `userAgent` are computed but unused. Nothing reaches a file. |
| 2 | **Error handling middleware** | 🟡 Partial | `common/filters/http-exception.filter.ts` is a global `@Catch()` filter returning a consistent envelope — but it **logs nothing**, captures no stack trace, and omits path/method/timestamp/request-id. No 404 fallback, no `unhandledRejection`/`uncaughtException` handlers, no timeout guard. |
| 3 | **File upload middleware** | 🔴 Missing | Zero hits for `FileInterceptor` / `multer` / `diskStorage` / `@UploadedFile` in `back-end/src`. The front-end has 4 `<input type="file">` (`submit-deliverable.html:164`, `expert-signup.html:545,564`, `project-workroom.html:307`, `worker-workroom.html:305`) but **no `FormData` and no multipart request anywhere** — only file *names* are sent. The upload UI is purely decorative. |
| 4 | **Security middleware** | 🔴 Missing | No `helmet`, no rate limiting, no compression. `enableCors({ origin: '*' })`. `RoleGuard` trusts a **client-supplied `role` header** — fully spoofable. Passwords are plaintext in `seed.data.ts` and compared with `!==`; `GET /api/users` returns password fields. `auth.js` has an offline fallback that compares plaintext passwords in the browser. `index.html` hard-codes superuser credentials in an inline `onclick`. |
| 5 | **Router-level middleware** | 🟡 Partial | Exactly one `configure()` in the whole codebase: `app.module.ts` → `consumer.apply(LoggerMiddleware).forRoutes('*')`. That is application-wide, not router-level. **No feature module implements `NestModule`**, and there is no use of `.exclude()`, `RequestMethod`, path-scoped `forRoutes`, or functional middleware. |
| 6 | **Logs/errors written to files at intervals** | 🔴 Missing | No `logs/` directory, no `fs.appendFile`/`createWriteStream`/`winston`/`morgan`. `.gitignore` lists `*.log` but nothing ever writes one. |

**Also already done (do not redo):** global `ValidationPipe` with `whitelist`+`transform`, DTOs with `class-validator` on all 12 modules, `ResponseInterceptor` envelope, `RoleGuard` + `@Roles` decorator wiring on 10 of 12 controllers, Swagger at `/api-docs`, `POST /api/seed/reset`.

**Known holes worth folding in:** `proposals`, `audit-reports`, `notifications` and `messages` controllers carry `@UseGuards(RoleGuard)` but **no `@Roles`**, so every route on them is open to any caller.

---

## 4. Middleware taxonomy — what maps to what

The assignment's five categories map onto NestJS/Express like this. The plan below fills every row.

| Express category | NestJS mechanism | Current | Planned |
|---|---|---|---|
| Application-level | `app.use()` in `main.ts`, or `forRoutes('*')` | LoggerMiddleware only | + helmet, body-size limits, request-ID, static `/uploads` |
| **Router-level** | `configure(consumer)` in a **feature module** with scoped `forRoutes` / `.exclude()` / `RequestMethod` | **none** | AuthMiddleware, UploadGuardMiddleware, LoginRateLimitMiddleware, AdminAuditMiddleware |
| Error-handling | `ExceptionFilter` | catch-all filter, no logging | upgraded filter + file sink + 404 fallback + process-level handlers |
| Built-in | `express.json`, `express.urlencoded`, `express.static` | implicit defaults | explicit, with limits; static serving for uploads |
| Third-party | helmet, multer, throttler | none | helmet, multer (`FileInterceptor`), `@nestjs/throttler` |

Nest-specific extras already present and worth naming in the writeup: **Pipes** (`ValidationPipe`), **Guards** (`RoleGuard`), **Interceptors** (`ResponseInterceptor`).

---

## 5. Storage decision (no database)

| Concern | Where it lives | Survives restart? |
|---|---|---|
| Application data (users, tasks, milestones, …) | Backend in-memory arrays seeded from `seed.data.ts` — **unchanged** | No (by design, this phase) |
| Front-end cache | `localStorage` key `lannent_data_v1`, mirrored from `Store._cache` after every mutation; hydrated on boot when the API is unreachable | Yes (browser-side) |
| Session | `localStorage` key `lannent_session` — **already exists**, to be extended with a signed token | Yes |
| **Logs** | `back-end/logs/*.log`, flushed on a timer | Yes |
| **Uploaded files** | `back-end/uploads/<category>/` on disk | Yes |
| Upload metadata | In-memory array, **rehydrated on boot by scanning `uploads/`** so records and files stay in sync | Effectively yes |

This keeps "no DB" intact while still giving the file-upload and file-logging middleware something real to do.

---

## 6. Plan of action

### Phase 1 — Logging that reaches disk *(foundation for everything else)*

**New: `src/common/logging/file-logger.service.ts`**

A buffered, interval-flushed writer. This is the component that literally satisfies *"logs stored in files at regular intervals."*

- In-memory ring buffers: `accessBuffer`, `errorBuffer`, `appBuffer`.
- `write(channel, entry)` pushes a JSON line; never touches disk synchronously.
- `OnModuleInit` starts `setInterval(() => this.flush(), FLUSH_INTERVAL_MS)` — **10 s** default.
- `flush()` drains each buffer with `fs.promises.appendFile` into a **date-stamped** file:
  - `logs/access-YYYY-MM-DD.log`
  - `logs/error-YYYY-MM-DD.log`
  - `logs/app-YYYY-MM-DD.log`
- Force-flush triggers: buffer length > 100, `OnModuleDestroy`, and `process.on('beforeExit'|'SIGINT')` so nothing is lost on Ctrl-C.
- Simple retention sweep on rollover: delete files older than N days.
- Exported from a `@Global()` `LoggingModule` so filters and middleware can inject it without import gymnastics.

> Hand-rolled rather than `winston` + `winston-daily-rotate-file` on purpose: the interval flush is explicit and demonstrable, and it adds zero dependencies. Swap in winston later if richer transports are wanted.

**Modify: `src/common/middleware/logger.middleware.ts`**

- Keep the coloured console line (good for the demo).
- Actually use the already-destructured `ip` and `userAgent`.
- Add `req.requestId` (see Phase 2) to the line.
- On `res.on('finish')`, additionally push a structured record to `FileLoggerService`:
  `{ ts, requestId, method, url, status, durationMs, bytes, ip, userAgent, role, userId }`.
- Route 4xx/5xx responses to the **error** channel as well as access.

**New: `src/common/interceptors/timeout.interceptor.ts`** — `RxJS timeout(15000)` → `RequestTimeoutException`, so a hung handler produces a logged 408 instead of a dangling socket.

**Files touched:** `common/logging/file-logger.service.ts` (new), `common/logging/logging.module.ts` (new), `common/middleware/logger.middleware.ts`, `common/interceptors/timeout.interceptor.ts` (new), `main.ts`, `app.module.ts`, `.gitignore` (add `logs/`, `uploads/`).

---

### Phase 2 — Error handling, hardened

**Modify: `src/common/filters/http-exception.filter.ts`**

Keep the existing envelope contract (`store.js` depends on `json.data`), but add:

- Inject `FileLoggerService`; write **every** caught exception to the error channel with `{ ts, requestId, method, path, status, message, stack, role, userId, body }` (body redacted for `password`).
- Include `path`, `timestamp` and `requestId` in the 5xx response payload so a user-reported error can be traced to a log line.
- Log full `stack` for non-`HttpException` throws; return a generic message to the client for 500s rather than leaking `exception.message`.
- Console `Logger.error()` for 5xx so failures are visible in the terminal too.

**New: `src/common/middleware/request-id.middleware.ts`** — assigns `crypto.randomUUID()` to `req.requestId`, echoes it as the `X-Request-Id` response header. Applied first, `forRoutes('*')`.

**New: `src/common/filters/not-found.filter.ts`** — ⚠️ *Verified 2026-08-26: lower value than first assessed.* Unmatched routes **already** return a correct JSON envelope, because Nest throws `NotFoundException` and the existing `@Catch()` filter handles it. This filter is therefore optional polish — an error code plus logging of 404s — not a contract fix.

**Modify: `src/main.ts`** — register process-level nets:

```ts
process.on('unhandledRejection', (r) => fileLogger.write('error', { kind: 'unhandledRejection', reason: String(r) }));
process.on('uncaughtException',  (e) => { fileLogger.write('error', { kind: 'uncaughtException', message: e.message, stack: e.stack }); });
app.enableShutdownHooks();
```

---

### Phase 3 — Router-level middleware *(the explicitly-required category)*

Four middlewares, each registered in a **feature module's own `configure()`** with a scoped `forRoutes` — this is what makes them router-level rather than global.

**a) `src/common/middleware/auth.middleware.ts`** — replaces the spoofable header
- Reads `Authorization: Bearer <token>`, verifies an HMAC-SHA256 signature (Node's built-in `crypto`, no new dependency), attaches `req.user = { userId, role, name }`.
- Registered in `UsersModule`, `TasksModule`, `MilestonesModule`, `ProposalsModule`, `DisputesModule`, `TransactionsModule`, `AuditRequestsModule`, `AuditReportsModule`, `NotificationsModule`, `MessagesModule` via:
  ```ts
  consumer.apply(AuthMiddleware)
    .exclude(
      { path: 'api/users/login',  method: RequestMethod.POST },
      { path: 'api/users',        method: RequestMethod.POST },  // signup
    )
    .forRoutes(UsersController);
  ```
- `RoleGuard` then reads `request.user.role` instead of `request.headers['role']`.

**b) `src/common/middleware/login-rate-limit.middleware.ts`**
- In-memory sliding window keyed by IP: 5 attempts / 15 min → `429`.
- Registered **only** on `{ path: 'api/users/login', method: RequestMethod.POST }` — a textbook single-route middleware.

**c) `src/common/middleware/upload-guard.middleware.ts`**
- Runs before multer on upload routes: rejects missing/oversized `content-length`, non-`multipart/form-data` content types, and unauthenticated callers, with a logged 400/413.
- Registered in `UploadsModule` for `UploadsController` only.

**d) `src/common/middleware/admin-audit.middleware.ts`**
- Writes a dedicated audit record (actor, action, target, ip, timestamp) to the app log channel for privileged operations.
- Registered on `SeedController` and on `{ path: 'api/users/:id', method: RequestMethod.DELETE }`, plus `expert-applications/:id/status`.

**Also in this phase:** add the missing `@Roles(...)` decorators to `proposals`, `audit-reports`, `notifications` and `messages` controllers, which are currently unrestricted.

---

### Phase 4 — Security middleware

**Dependencies to install:** `helmet`, `@nestjs/throttler`, `compression`, `@types/multer`, `@types/compression`, `@nestjs/config`.
*(`multer` itself already ships transitively with `@nestjs/platform-express`; only the types are missing.)*

**`main.ts`**
```ts
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.enableCors({ origin: ALLOWED_ORIGINS, credentials: true, allowedHeaders: 'Content-Type,Accept,Authorization' });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });
```
- `origin: '*'` → explicit allow-list from `.env` via `@nestjs/config`; port from `process.env.PORT`.
- `forbidNonWhitelisted: true` so unexpected fields are rejected, not silently dropped.
- Add `.addBearerAuth()` to the Swagger `DocumentBuilder`.

**`app.module.ts`** — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` + `APP_GUARD` for a global baseline limit on top of the per-login limiter.

**Password handling** — `src/common/security/password.util.ts` using Node's built-in `crypto.scrypt` (no `bcrypt` dependency):
- `hash(plain)` → `salt:derivedKey`, `verify(plain, stored)` → `timingSafeEqual`.
- `UsersRepository` hashes the `seed.data.ts` passwords once at construction, so seeded logins keep working.
- `UsersService.login` uses `verify()` instead of `!==`.

**Response sanitisation** — a `sanitizeUser()` helper stripping `password` (and future secrets), applied in `UsersRepository.mergeUser()` so **no** endpoint can leak it. This closes both the `GET /api/users` leak and the browser-side plaintext comparison that depends on it.

**Token issuance** — `UsersService.login` returns `{ user, session, token }`; token is `base64(payload).hmac`, expiry stamped, secret from `.env`.

**Path-traversal guard** on the upload download route: resolve the requested path and assert it stays inside `uploads/`.

---

### Phase 5 — File upload middleware

**New module: `src/modules/uploads/`** — `uploads.module.ts`, `uploads.controller.ts`, `uploads.service.ts`, `uploads.repository.ts`, `dto/upload-meta.dto.ts`.

**Multer configuration** (`MulterModule.registerAsync` inside `UploadsModule`):
- `diskStorage` with `destination` chosen per category → `uploads/deliverables/`, `uploads/resumes/`, `uploads/certificates/`, `uploads/avatars/`, `uploads/attachments/` (created with `fs.mkdirSync(..., { recursive: true })` on boot).
- `filename: (req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${extname(file.originalname)}`)` — never trust `originalname` on disk.
- `limits: { fileSize: 50 * 1024 * 1024, files: 10 }` for deliverables; 5 MB for resumes/avatars.
- `fileFilter` whitelisting extension **and** mimetype, mirroring the `accept` lists already in `submit-deliverable.html:164` and `expert-signup.html:545,564`.

**Endpoints**

| Method | Route | Interceptor | Roles |
|---|---|---|---|
| POST | `/api/uploads/deliverable` | `FilesInterceptor('files', 10)` | worker |
| POST | `/api/uploads/expert-document` | `FileFieldsInterceptor([{name:'resume',maxCount:1},{name:'certificate',maxCount:1}])` | any |
| POST | `/api/uploads/avatar` | `FileInterceptor('file')` | any authenticated |
| POST | `/api/uploads/attachment` | `FileInterceptor('file')` | client, worker, expert |
| GET | `/api/uploads` | — | filter by `?ownerId=`/`?taskId=` |
| GET | `/api/uploads/:id/download` | — | streams via `StreamableFile` |
| DELETE | `/api/uploads/:id` | — | owner or superuser |

**Metadata** — `UploadsRepository` keeps an in-memory array of `{ id, category, originalName, storedName, path, size, mimetype, ownerId, taskId, milestoneId, uploadedAt }`, consistent with every other repository. On `OnModuleInit` it **scans `uploads/` and rebuilds records for orphaned files**, so a restart doesn't strand them.

**Error handling** — a `MulterExceptionFilter` translating `LIMIT_FILE_SIZE` / `LIMIT_UNEXPECTED_FILE` into the standard envelope, logged like everything else.

**Wire the existing DTOs:** add `attachments?: string[]` (upload IDs) to `SubmitDeliverableDto` and to `CreateExpertApplicationDto`, so `POST /api/milestones/:id/submit` can reference real files.

---

### Phase 6 — Front-end changes

**`js/store.js`**
- `_persist()` — write `_cache` to `localStorage['lannent_data_v1']` after every successful mutation; `_hydrate()` on boot before `init()`. This is the agreed "everything in local storage" behaviour, layered over the existing API cache.
- Surface failures: replace the 9 silent `console.warn` sites with `Validate.toast(msg, 'error')`. Today a failed create still returns a fabricated object and the UI reports success — that must stop.
- Send `Authorization: Bearer <token>` in `_headers()` alongside the existing role/user-id headers during migration.
- New `uploadFiles(category, fileList, meta)` using `FormData` + `XMLHttpRequest` with an `upload.onprogress` handler.
- Delete the unreachable async `fetch` layer (`_refreshAll` and friends) and the stray `console.log`s in `saveAuditReport` (lines ~410–435).

**`js/auth.js`**
- Persist the returned `token` into `lannent_session`.
- **Delete the offline `catch` fallback** that compares plaintext passwords against cached user records.

**Pages** — wire the four dead file inputs to `Store.uploadFiles()`:
`submit-deliverable.html`, `expert-signup.html`, `project-workroom.html`, `worker-workroom.html`. Show real progress and real errors; store returned upload IDs on the deliverable/application.

**`index.html`** — remove the hard-coded `super@lannent.com` / `superadmin123` inline `onclick`.

---

## 7. New file layout

```
back-end/
├── .env                                  PORT, ALLOWED_ORIGINS, TOKEN_SECRET, LOG_FLUSH_MS, LOG_RETENTION_DAYS
├── logs/                                 gitignored
│   ├── access-2026-08-26.log
│   ├── error-2026-08-26.log
│   └── app-2026-08-26.log
├── uploads/                              gitignored
│   ├── deliverables/  resumes/  certificates/  avatars/  attachments/
└── src/
    ├── common/
    │   ├── logging/          file-logger.service.ts, logging.module.ts
    │   ├── middleware/       logger.middleware.ts (mod), request-id.middleware.ts,
    │   │                     auth.middleware.ts, login-rate-limit.middleware.ts,
    │   │                     upload-guard.middleware.ts, admin-audit.middleware.ts
    │   ├── filters/          http-exception.filter.ts (mod), not-found.filter.ts,
    │   │                     multer-exception.filter.ts
    │   ├── interceptors/     response.interceptor.ts (mod), timeout.interceptor.ts
    │   ├── guards/           role.guard.ts (mod — read req.user, not headers)
    │   └── security/         password.util.ts, token.util.ts
    └── modules/uploads/      module, controller, service, repository, dto/
```

---

## 8. Execution order

| Step | Work | Depends on |
|---|---|---|
| 1 | `FileLoggerService` + `LoggingModule` + `.gitignore` | — |
| 2 | `RequestIdMiddleware`; upgrade `LoggerMiddleware` to dual-sink | 1 |
| 3 | Upgrade `HttpExceptionFilter`; add `NotFoundFilter`, `TimeoutInterceptor`, process handlers | 1 |
| 4 | `@nestjs/config` + `.env`; helmet, compression, body limits, CORS allow-list, throttler | — |
| 5 | `password.util.ts`, `token.util.ts`; hash seeds; `sanitizeUser()`; login returns token | 4 |
| 6 | `AuthMiddleware` (router-level, with `.exclude()`); `RoleGuard` reads `req.user` | 5 |
| 7 | `LoginRateLimitMiddleware`, `AdminAuditMiddleware` (router-level) | 6 |
| 8 | `UploadsModule` + multer + `UploadGuardMiddleware` + `MulterExceptionFilter` + static serving | 4, 6 |
| 9 | Missing `@Roles` on proposals / audit-reports / notifications / messages | 6 |
| 10 | Front-end: token, localStorage mirror, error toasts, `uploadFiles()` | 5, 8 |
| 11 | Front-end: wire the four file inputs; remove hard-coded creds | 10 |
| 12 | Update `back-end/README.md` (currently untouched Nest boilerplate) with run + middleware docs | all |

Steps 1–3 are independently demoable and satisfy requirements 1, 2 and 6 on their own. Steps 6–7 satisfy requirement 5. Step 8 satisfies requirement 3. Steps 4–5 satisfy requirement 4.

---

## 9. Verification

**Setup**
```bash
cd back-end && npm install && npm run start:dev
# separate terminal — serve the static front-end
cd front-end && npx serve -l 5500 .
```

**Logging + intervals**
- Hit several endpoints, wait ~15 s, then `ls -la back-end/logs/` and `tail -f back-end/logs/access-*.log` — entries appear in batches on the flush timer, not per-request.
- `curl -i http://localhost:3000/api/tasks` → response carries `X-Request-Id`; the same id appears in the access log line.
- Ctrl-C the server, then check the log tail — the final buffer was flushed on shutdown.

**Error handling**
- `curl http://localhost:3000/api/tasks/does-not-exist` → 404 envelope, one line in `error-*.log`.
- `curl -X POST http://localhost:3000/api/tasks -H 'Content-Type: application/json' -d '{}'` → 400 with class-validator messages, logged.
- `curl http://localhost:3000/api/nope` → JSON 404 envelope. **Already passes today** — keep as a regression check, not as proof of new work.
- Throw deliberately in a service → 500 with generic client message, full stack in `error-*.log`, `requestId` matching the response.

**File upload**
```bash
curl -X POST http://localhost:3000/api/uploads/deliverable \
  -H "Authorization: Bearer <token>" -F "files=@./sample.zip"
```
- File lands in `back-end/uploads/deliverables/` with a generated name; metadata returned.
- Oversized file → 413 envelope; `.exe` → 400 from `fileFilter`; both logged.
- `GET /api/uploads/:id/download` returns the file; `../` in the path is rejected.
- Restart the server → `GET /api/uploads` still lists the file (boot-time directory rescan).
- In the browser: `submit-deliverable.html` drag-drop shows real progress and the file appears on disk.

**Security**
- `curl -i http://localhost:3000/api/tasks` → `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` from helmet.
- Request from a disallowed `Origin` → blocked by CORS.
- 6 rapid bad logins → `429`.
- `curl -H 'role: superuser' http://localhost:3000/api/seed/reset -X POST` → **403** (header alone no longer works); same call with a valid superuser Bearer token → 200 and an entry in `app-*.log`.
- `GET /api/users` → no `password` field in any record.

**Router-level middleware**
- `POST /api/users/login` with no token → succeeds (excluded route).
- `GET /api/tasks` with no token → 401 from `AuthMiddleware`.
- Confirms the middleware is bound to specific routers, not applied globally.

**Regression**
- Log in as each of client / worker / expert / superuser; confirm each dashboard loads and the core flow (post task → proposal → hire → milestone submit → approve → wallet) still works end to end.
- Stop the API, reload a dashboard → the page renders from the `localStorage` mirror and shows a clear "offline" toast instead of silently faking writes.

---

## 10. Explicitly out of scope for this phase

- Any database or ORM — deferred by decision; in-memory + `localStorage` stands.
- JWT via `@nestjs/jwt`/passport — the HMAC token util covers the requirement without the dependency weight; swap in later if needed.
- The React conversion described in `React-Conversion-Opportunities.md`, `First-React-Conversion-Target.md` and `Initial-React-Conversion-Sketch.md` — this plan deliberately keeps the current static front-end so the middleware work lands independently.
- Replacing the 18 synchronous XHR call sites and the 127 `innerHTML` writes catalogued in `Task5-Frontend-Problems.md`, beyond the specific security fixes listed in Phase 6.
- Unit/e2e test coverage. Note `test/app.e2e-spec.ts` is still the Nest starter test asserting `GET /` → `'Hello World!'`; there is no `AppController` and a global `/api` prefix, so **it currently fails** and should be replaced or deleted.
