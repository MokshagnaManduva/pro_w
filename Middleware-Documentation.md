# Lannent — Middleware Documentation

**A living reference.** Seeded with the concepts and the design *before* implementation; each layer owner fills in their own section as they build. By the time all five branches merge, this is the document you revise from for the viva.

**Companion docs:** `Middleware-Implementation-Plan.md` (what to build) · `Team-Branch-Split-Plan.md` (who builds what)

---

## How to use this document

- **Part A** is conceptual — read it before writing any code. Most viva questions come from here.
- **Part B** traces one real request through our actual files.
- **Part C** has one section per layer. **Each owner fills in their own section only**, as the last commit on their branch. Do not write another layer's section.
- **Part D** is the question bank. Add to it whenever you hit something non-obvious while building.

Status markers used in Part C: ⬜ not started · 🟨 in progress · ✅ merged to `main`

---

# Part A — Concepts

## A1. What is middleware?

Middleware is a function that sits **between** the incoming request and the route handler. It receives the request, may inspect or modify it, and then either passes control onward or ends the response itself.

In Express — which NestJS runs on top of by default — the signature is:

```js
function middleware(req, res, next) {
  // inspect or modify req / res
  next();   // pass control to the next function in the chain
}
```

The critical mechanic is `next()`:

- **Call `next()`** → control passes to the next middleware, eventually reaching the route handler.
- **Don't call `next()`, send a response instead** → the chain stops. The handler never runs. This is how a guard-style middleware rejects a request.
- **Call `next(err)`** → skip straight to error-handling middleware.
- **Forget to do either** → the request hangs forever. This is the single most common middleware bug.

Middleware is how cross-cutting concerns — things every route needs but no route should implement itself — get applied in one place: logging, authentication, compression, security headers, body parsing.

## A2. The NestJS request lifecycle

NestJS splits what Express calls "middleware" into **five distinct constructs**, each running at a fixed point. Knowing this order cold is the highest-value thing in this document.

```
   INCOMING REQUEST
          │
          ▼
 ┌────────────────────┐
 │ 1. MIDDLEWARE      │  app.use(...)  then  consumer.apply(...)
 │                    │  → raw req/res. No decorator metadata available.
 └────────┬───────────┘     Lannent: RequestId, Logger, Auth, RateLimit, AdminAudit
          ▼
 ┌────────────────────┐
 │ 2. GUARDS          │  global → controller → route
 │                    │  → returns true/false. Has ExecutionContext.
 └────────┬───────────┘     Lannent: RoleGuard, ThrottlerGuard
          ▼
 ┌────────────────────┐
 │ 3. INTERCEPTORS    │  (before phase) global → controller → route
 │    — pre           │  → wraps the handler in an RxJS stream
 └────────┬───────────┘     Lannent: Response, Timeout
          ▼
 ┌────────────────────┐
 │ 4. PIPES           │  global → controller → route → parameter
 │                    │  → validate + transform the input payload
 └────────┬───────────┘     Lannent: ValidationPipe (+ class-validator DTOs)
          ▼
 ┌────────────────────┐
 │ 5. ROUTE HANDLER   │  the controller method
 └────────┬───────────┘
          ▼
 ┌────────────────────┐
 │    SERVICE LAYER   │  business logic → repository (in-memory arrays)
 └────────┬───────────┘
          ▼
 ┌────────────────────┐
 │ 6. INTERCEPTORS    │  (after phase) route → controller → global  [REVERSE]
 │    — post          │  → transform the response
 └────────┬───────────┘
          ▼
 ┌────────────────────┐
 │ 7. EXCEPTION       │  only if something threw, anywhere in 2–6
 │    FILTERS         │  route → controller → global
 └────────┬───────────┘     Lannent: HttpException, NotFound, MulterException
          ▼
      RESPONSE
```

**Three consequences worth memorising:**

1. **Middleware runs before guards.** That is exactly why `AuthMiddleware` (V5) can decode the token and attach `req.user`, and `RoleGuard` — running later — can read it. Reverse the order and the guard would find nothing.
2. **Middleware has no `ExecutionContext`.** It sees only raw `req`/`res`. It cannot use `Reflector` to read `@Roles('client')` metadata off a handler. **That is the reason `RoleGuard` is a guard and not middleware** — a very common viva question.
3. **Interceptors run twice** — once before the handler, once after. The "after" pass runs in reverse registration order. That is what lets `ResponseInterceptor` wrap every return value in `{ success, message, data }` without any controller knowing.

## A3. Which construct should I use?

| Construct | Runs | Can it see decorator metadata? | Use it for | Lannent example |
|---|---|---|---|---|
| **Middleware** | 1st, before routing resolves | ❌ No | Raw req/res work: logging, headers, parsing, auth token decode | `LoggerMiddleware`, `AuthMiddleware` |
| **Guard** | After middleware | ✅ Yes (`Reflector`) | A yes/no authorisation decision | `RoleGuard` |
| **Interceptor** | Wraps the handler | ✅ Yes | Transform response, timing, timeouts, caching | `ResponseInterceptor`, `TimeoutInterceptor` |
| **Pipe** | Just before the handler | ✅ Yes | Validate and transform **input** | `ValidationPipe` |
| **Exception filter** | On throw | ✅ Yes | Shape the error response, log the failure | `HttpExceptionFilter` |

Rule of thumb: **guards decide, pipes validate, interceptors transform, filters recover, middleware does everything else.**

## A4. Express middleware taxonomy → NestJS

The classic Express categories, and where each lives in this project:

| Express category | NestJS mechanism | Lannent implementation |
|---|---|---|
| **Application-level** | `app.use()` in `main.ts`, or `forRoutes('*')` | helmet, compression, body limits (V4); RequestId + Logger (V1) |
| **Router-level** | `configure(consumer)` in a **feature module**, scoped `forRoutes` / `.exclude()` / `RequestMethod` | AuthMiddleware, LoginRateLimit, UploadGuard, AdminAudit (V5) |
| **Error-handling** | `ExceptionFilter` | HttpException, NotFound, MulterException filters (V2) |
| **Built-in** | `express.json`, `express.urlencoded`, `express.static` | body limits (V4), static `/uploads` serving (V4) |
| **Third-party** | installed packages | helmet, compression, `@nestjs/throttler`, multer (V3/V4) |

**Application-level vs router-level** is the distinction the assignment cares about most:

```ts
// APPLICATION-level — every route in the app
consumer.apply(LoggerMiddleware).forRoutes('*');

// ROUTER-level — one controller, with specific routes carved out
consumer.apply(AuthMiddleware)
  .exclude(
    { path: 'api/users/login', method: RequestMethod.POST },
    { path: 'api/users',       method: RequestMethod.POST },  // signup
  )
  .forRoutes(UsersController);

// ROUTER-level, single route — brute-force protection on login only
consumer.apply(LoginRateLimitMiddleware)
  .forRoutes({ path: 'api/users/login', method: RequestMethod.POST });
```

> ⚠️ **What we had before this work:** exactly one `configure()` in the entire codebase — `consumer.apply(LoggerMiddleware).forRoutes('*')` in `app.module.ts`. That is application-level. **No feature module implemented `NestModule` at all**, so the router-level requirement was genuinely unmet, not merely thin.

## A5. Registration: `app.use()` vs `consumer.apply()`

Two ways to register middleware, with a difference that matters for error handling:

| | `app.use()` in `main.ts` | `consumer.apply()` in a module |
|---|---|---|
| Scope | Everything, including non-Nest routes | Scoped by `forRoutes` / `.exclude()` |
| Dependency injection | ❌ No | ✅ Yes — can inject services |
| Path/method targeting | Manual | Built in |
| Covered by Nest exception filters | ✅ Yes — see the verified note below | ✅ Yes |

**Practical rule for this project:** third-party middleware with no dependencies (helmet, compression) goes in `app.use()`. Anything of ours that needs a service injected — the logger, auth, audit — goes through `consumer.apply()`, so it gets DI as well.

### ✅ Verified 2026-08-26 — middleware exceptions (do not guess at this)

The original draft of this section asserted that `app.use()` middleware runs outside Nest's exception filters. **That was wrong.** Tested against a running app:

| Thrown from | Caught by our global filter? |
|---|---|
| `consumer.apply()` middleware | ✅ Yes — correct envelope, correct status |
| `app.use()` middleware, **sync** throw | ✅ Yes |
| `app.use()` middleware, **async** throw | ✅ Yes |

The async case works because this project runs **Express 5.2.1**, which forwards a rejected promise from middleware to the error handler automatically. On Express 4 that same code would hang the request — so the answer is version-dependent, and worth saying so if asked.

Mechanically: Nest installs its exception layer as Express error-handling middleware at the end of the chain, so anything earlier that throws (or calls `next(err)`) reaches it.

### ✅ Verified 2026-08-26 — filter precedence

Two facts that are easy to get backwards:

1. **`app.useGlobalFilters(instance)` beats `APP_FILTER` providers.** An instance registered in `main.ts` permanently shadows a module's filter. This is why `main.ts` registers no filters at all — doing so would have blocked V2 from using DI to persist errors.
2. **Among `APP_FILTER` providers the LAST registered wins**, and specificity does *not* decide it. A `@Catch()` catch-all registered after a `@Catch(NotFoundException)` will swallow the `NotFoundException`. Register the catch-all **first** and narrower filters after it.

---

# Part B — A request's journey through Lannent

`POST /api/milestones/m3/submit` from a logged-in worker, once all five layers are merged:

| # | Stage | What happens | Owner |
|---:|---|---|---|
| 1 | `app.use(helmet())` | Security headers attached to the response | V4 |
| 2 | `app.use(express.json({limit:'1mb'}))` | Body parsed; oversized payload rejected early | V4 |
| 3 | `RequestIdMiddleware` | `req.requestId = randomUUID()`, echoed as `X-Request-Id` | V1 |
| 4 | `LoggerMiddleware` | Registers an `res.on('finish')` hook; does **not** log yet | V1 |
| 5 | `AuthMiddleware` | Verifies the Bearer token, sets `req.user = { userId, role }` | V5 |
| 6 | `ThrottlerGuard` | Global rate-limit check | V4 |
| 7 | `RoleGuard` | Reads `@Roles('worker')` via `Reflector`, compares to `req.user.role` | V5 |
| 8 | `TimeoutInterceptor` | Starts a 15 s timer on the handler | V2 |
| 9 | `ResponseInterceptor` | Subscribes to the response stream | *(existing)* |
| 10 | `ValidationPipe` | Validates the body against `SubmitDeliverableDto` | *(existing)* |
| 11 | `MilestonesController.submit()` | Handler runs | *(existing)* |
| 12 | `MilestonesService` → repository | Business logic; in-memory array updated | *(existing)* |
| 13 | `ResponseInterceptor` (post) | Wraps the return in `{ success, message, data }` | *(existing)* |
| 14 | `res.on('finish')` fires | Logger writes an access record into the buffer | V1 |
| 15 | Flush timer (every 10 s) | Buffer appended to `logs/access-YYYY-MM-DD.log` | V1 |

**If step 12 throws instead:** steps 13–14 are skipped; `HttpExceptionFilter` (V2) catches it, writes a record with the stack trace and the same `requestId` to `logs/error-YYYY-MM-DD.log`, and returns the standard error envelope. The `requestId` is what lets you tie a user's screenshot to a log line.

---

# Part C — Layer reference

> Each owner fills in their own section as the final commit on their branch. Keep it factual: what you built, why you chose that approach, and how to demo it.

## C1. Logging — `v1-logging`  ⬜

**Owner:** _(name)_

**Purpose.** Record every HTTP request, and persist logs to files **at regular intervals** rather than per request.

**Files.** `common/logging/file-logger.service.ts` · `logging.module.ts` · `log-rotation.util.ts` · `common/middleware/logger.middleware.ts` · `common/middleware/request-id.middleware.ts` · `common/bootstrap/logging.bootstrap.ts` · `modules/logs/`

**Design decisions to explain in the viva:**
- **Why buffer instead of writing per request?** Disk I/O on every request adds latency and syscalls under load. Buffering in memory and flushing on a timer amortises the cost, and it is what "at regular intervals" in the brief literally asks for.
- **What is the trade-off?** A crash loses up to one flush interval of logs. Mitigated by also force-flushing on a size threshold (>100 entries) and on shutdown (`OnModuleDestroy`, `SIGINT`).
- **Why three channels** (`access`, `error`, `app`)? So a failure investigation greps one small file, not one huge mixed one.
- **Why daily rotation?** Bounded file size, and a date is the natural way to find "what happened Tuesday".
- **Why a request ID?** It correlates a log line to the exact response a user saw.

**To be filled on implementation:** actual flush interval used · log line schema · retention policy · anything that surprised you.

## C2. Error handling — `v2-error-handling`  🟨 *implemented, awaiting merge*

**Owner:** _(name)_

**Purpose.** Catch every failure, return one consistent shape, and persist the details to a file.

**Files.** `common/filters/http-exception.filter.ts` *(rewrite)* · `not-found.filter.ts` · `multer-exception.filter.ts` · `common/interceptors/timeout.interceptor.ts` · `common/errors/error-codes.ts` · `common/bootstrap/errors.bootstrap.ts` · front-end `js/toast.js`, `js/api-errors.js`

**Design decisions to explain in the viva:**
- **Why `@Catch()` with no argument?** It catches *everything*, not just `HttpException` — so a raw `TypeError` still returns a clean envelope instead of leaking a stack trace to the client.
- **Why return a generic message for 500s** but log the full stack? Internal messages can leak file paths, query structure, or library versions. The client gets a `requestId`; the detail lives in the log.
- **Why redact `password` from logged request bodies?** Otherwise a failed login writes a plaintext credential into a file that gets committed or shared.
- **Why a 404 filter, given 404s already work?** ✅ *Verified 2026-08-26:* unmatched routes already return a correct JSON envelope — Nest's router throws `NotFoundException` and the existing `@Catch()` filter handles it (`GET /api/nope` → `{"success":false,"message":"Cannot GET /api/nope"}`). So this filter is **not** fixing a broken contract. Its remaining value is narrower: attaching an error code, and logging 404s so you can spot a front-end calling a route that does not exist.
- **Why process-level handlers?** `unhandledRejection` and `uncaughtException` happen *outside* any request, so no filter can see them. Without these, the process dies silently with no record.

**Known starting state:** the existing filter returns a correct envelope but **logs nothing** — no stack, no path, no timestamp, no request ID.

### As built

**One filter, not three.** The plan called for separate `not-found.filter.ts` and `multer-exception.filter.ts`. Both were dropped, for two different reasons:

- **not-found**: 404s already return a correct JSON envelope (see the correction above), so a dedicated filter was not fixing anything.
- **multer**: ⚠️ *Verified during V3 against a running app* — `@nestjs/platform-express` already converts multer failures via `transformException()` **before** they reach any filter (`LIMIT_FILE_SIZE` → `PayloadTooLargeException` 413, everything else → `BadRequestException` 400). They arrive as ordinary `HttpException`s. A mapper written for them was **dead code and has been removed** rather than left looking functional.

That leaves one global filter, which also sidesteps the precedence trap: ordering is registration-based (see A5), so each additional global filter is another chance to shadow the wrong one.

**Error codes** (`error-codes.ts`) — a stable machine-readable token on every failure. The message is prose and will be reworded; the code is what the front-end branches on and what you grep the logs for.

**Response shape** — the `{ success, message, data }` contract is preserved because `store.js` reads `json.data` on every call. Fields were **added**, never renamed: `code`, `requestId`, `path`, `timestamp`.

**5xx returns a generic message.** The real message and stack go to the error log; the client gets `requestId` to quote. `EXPOSE_STACK_TRACES=true` opts into stacks for local debugging only.

**Timeout is an interceptor, not middleware** — middleware cannot see the handler's result, so a timeout is not expressible there. Honest limit: it stops the *response* waiting; it does not cancel work already running, because Node cannot forcibly abort a synchronous handler.

**Process handlers** treat the two cases differently, deliberately:
- `unhandledRejection` → log, **keep running**. Usually one broken request; killing a working server over it is worse.
- `uncaughtException` → log, **flush**, `exit(1)`. The process is in an undefined state and may corrupt data if left running.

**Front-end.** `toast.js` replaces 7 drifted `showToast` copies — including the Task5 bug where `'warn'` fell through to GREEN success. Both spellings now map to amber. `api-errors.js` registers `onApiError` via `window.LannentHooks`, so `store.js` stays frozen. Repeat errors are deduped within 2.5s — otherwise the 11 blocking startup GETs fire 11 identical toasts when the API is down.

**Tests.** `test/app.e2e-spec.ts` replaces the starter test that asserted `GET /` → `'Hello World!'` (impossible here: no `AppController`, and a global `/api` prefix). 7 tests, all passing.

### Verified end to end

| Check | Result |
|---|---|
| Validation error | ✅ `VALIDATION_FAILED` + every failing field, not just the first |
| 404 / 403 | ✅ `NOT_FOUND` / `FORBIDDEN` |
| 500 from a real `TypeError` | ✅ generic message to client, real message + stack to log |
| Non-`Error` throw (`throw 'string'`) | ✅ still a clean 500 envelope |
| Timeout | ✅ 408 `REQUEST_TIMEOUT` at the configured limit |
| Stack leak | ✅ absent by default, present only with `EXPOSE_STACK_TRACES=true` |
| Password in a failed login | ✅ never echoed to the client |
| Success envelope unchanged | ✅ `store.js` contract intact |
| Toast variants | ✅ `warn` and `warning` both amber; unknown → blue info |
| Error toast on a real 403 | ✅ confirmed in Chrome |

### ⚠️ Known limitation, deliberately left for another layer

`store.js` still **fabricates a local record when a write fails** — the Task5 finding. V2 now tells the user the write failed, but the fabricated object is still returned and the item still appears in the UI. That is contradictory and should be fixed.

It is not fixed here because `store.js` is frozen, and the semantics of "what happens to a failed write" belong with **V5's local-cache / offline work**, not with error presentation. Flagged so it is not mistaken for done.

## C3. File upload — `v3-file-upload`  ⬜

**Owner:** _(name)_

**Purpose.** Accept real multipart uploads, validate them, store them on disk, and track their metadata.

**Files.** `modules/uploads/` *(module, controller, service, repository, dto)* · `common/multer/multer.config.ts` · `common/bootstrap/uploads.bootstrap.ts` · front-end `js/uploads.js` + 4 pages

**Design decisions to explain in the viva:**
- **Why `diskStorage` and not `memoryStorage`?** A 50 MB deliverable in `memoryStorage` sits in RAM as a Buffer; ten concurrent uploads is 500 MB. `diskStorage` streams straight to disk.
- **Why generate the filename instead of using `file.originalname`?** Three reasons: a name like `../../etc/passwd` is a path-traversal attempt; two users uploading `resume.pdf` would collide; and an attacker could overwrite an existing file. We store `<timestamp>-<random>.<ext>` and keep the original name in metadata only.
- **Why validate in `fileFilter` rather than in the controller?** `fileFilter` rejects *during* the stream, before the whole file is written. Checking in the controller means you have already paid the disk write.
- **Why both extension and MIME type?** Extension is trivially renamed; MIME type is client-supplied and also spoofable. Neither is sufficient alone; together they stop casual mistakes.
- **Why rescan `uploads/` on boot?** Metadata lives in an in-memory array (no database this phase), so a restart would strand files on disk with no record. The rescan rebuilds records from what is actually there.

**Known starting state:** four `<input type="file">` exist in the UI (`submit-deliverable.html:164`, `expert-signup.html:545,564`, both workrooms) but there is **no `FormData` and no multipart request anywhere** — only filenames are sent. The upload UI is currently decorative.

**To be filled on implementation:** final size/type limits per category · directory layout · metadata schema.

## C4. Security — `v4-security`  ⬜

**Owner:** _(name)_

**Purpose.** Close the gap between "works" and "safe to expose".

**Files.** `common/security/password.util.ts` · `token.util.ts` · `sanitize.util.ts` · `security.module.ts` · `common/bootstrap/security.bootstrap.ts` · `modules/users/users.{repository,service}.ts` · `config/configuration.ts` · front-end `js/auth.js`, `index.html`

**Design decisions to explain in the viva:**
- **What does helmet actually do?** It sets security response headers — `X-Content-Type-Options: nosniff`, `X-Frame-Options` (clickjacking), `Strict-Transport-Security`, and a CSP. It is not magic; it is about a dozen headers.
- **Why is `origin: '*'` a problem?** It lets any site call our API from a user's browser. Replaced with an explicit allow-list from `.env`.
- **Why `scrypt` rather than storing plaintext, and why not bcrypt?** `scrypt` is deliberately slow and memory-hard, so brute-forcing a leaked store is expensive. We use Node's **built-in** `crypto.scrypt` — same guarantee, one fewer dependency than bcrypt.
- **Why compare with `timingSafeEqual`?** A normal `===` returns faster on an early-mismatch, which leaks information about the correct value over many attempts.
- **Why an HMAC token instead of a JWT library?** A JWT is essentially base64 JSON plus an HMAC signature. Node's `crypto` gives us the signature directly, so we get tamper-evidence without another dependency. *(Trade-off: no standard claim handling or ecosystem tooling — worth saying out loud if asked.)*
- **Why strip `password` inside `mergeUser()` rather than in each controller?** Centralising it means no future endpoint can leak the field by forgetting.

**Known starting state — the three real vulnerabilities this layer closes:**
1. `RoleGuard` trusts a **client-supplied `role` header**. `curl -H 'role: superuser'` currently grants admin on every guarded route.
2. Passwords are plaintext in `seed.data.ts`, compared with `!==`, and **returned by `GET /api/users`**.
3. `auth.js` has an offline fallback that compares plaintext passwords **in the browser** against those cached records. `index.html` also ships hard-coded superuser credentials in an inline `onclick`.

**To be filled on implementation:** token format and expiry · throttle limits · CORS allow-list.

## C5. Router-level middleware — `v5-router-middleware`  ⬜

**Owner:** _(name)_

**Purpose.** Demonstrate middleware **scoped to specific routers and routes**, not applied globally — and make authorisation real.

**Files.** `common/middleware/auth.middleware.ts` · `login-rate-limit.middleware.ts` · `upload-guard.middleware.ts` · `admin-audit.middleware.ts` · `common/guards/role.guard.ts` · `common/routing/routing.module.ts` · missing `@Roles` on 4 controllers · front-end `js/local-cache.js`, `js/offline-banner.js`

**The four middlewares and their scopes:**

| Middleware | Scope | Why scoped that way |
|---|---|---|
| `AuthMiddleware` | 10 controllers, `.exclude()` on login + signup | Everything needs auth *except* the two routes that create it — otherwise nobody could ever log in |
| `LoginRateLimitMiddleware` | `POST api/users/login` only | Brute-force protection belongs on the credential endpoint, not on reads |
| `UploadGuardMiddleware` | `api/uploads/*` only | Rejects wrong content-type / oversized bodies *before* multer starts writing |
| `AdminAuditMiddleware` | `seed`, `DELETE users/:id`, `expert-applications/:id/status` | Privileged actions need an audit trail; ordinary reads do not |

**Design decisions to explain in the viva:**
- **Why is `AuthMiddleware` middleware but `RoleGuard` a guard?** Auth only needs raw `req` — decode the token, attach `req.user`. Role checking needs the `@Roles()` metadata on the handler, which requires `ExecutionContext` and `Reflector`, and those exist only from the guard phase onward. See A2.
- **Why `.exclude()` rather than an `@Public()` decorator?** A decorator would need a guard to read it. `.exclude()` works at the middleware layer, where we already are, and keeps the exception list visible in one place.
- **Why bind `UploadGuardMiddleware` by path string rather than by importing `UploadsController`?** It keeps V5 and V3 from referencing each other's code, so the two branches can be built and merged independently.

**To be filled on implementation:** rate-limit window · audit record schema · offline-mode behaviour.

---

# Part D — Viva question bank

### Lifecycle and ordering

**Q. What is the execution order in NestJS?**
Middleware → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post) → Exception filters. See the A2 diagram.

**Q. Why can't middleware read `@Roles()` metadata?**
Middleware runs before Nest resolves the route to a handler, so there is no `ExecutionContext` and no `Reflector`. Guards are the first construct with both.

**Q. What is the difference between application-level and router-level middleware?**
Application-level applies to every request — `app.use()` or `forRoutes('*')`. Router-level is scoped to specific controllers or routes via `forRoutes(SomeController)` / `.exclude()` / `RequestMethod`. Our `LoggerMiddleware` is the former; the four in V5 are the latter.

**Q. What happens if middleware never calls `next()`?**
The request hangs until it times out — the handler never runs and no response is sent, unless the middleware sent one itself.

**Q. Guard vs pipe vs interceptor?**
Guards decide (boolean), pipes validate and transform input, interceptors transform the response and wrap the handler.

### Logging

**Q. Why write logs to a file instead of the console?**
Console output disappears when the process ends. Files persist, can be rotated, searched and shipped elsewhere.

**Q. Why not write on every request?**
Per-request disk I/O adds latency. Buffering and flushing on a timer amortises it — and matches the brief's "at regular intervals".

**Q. What if the process crashes before a flush?**
Up to one interval of buffered logs is lost. We reduce the window with a size-threshold flush and a shutdown-hook flush.

**Q. What is a request ID for?**
Correlating a user-visible error to its log entry — the same UUID appears in the `X-Request-Id` header and in every log line for that request.

### Error handling

**Q. Why a global exception filter rather than try/catch in each controller?**
One place to shape every error response and log every failure. Try/catch in 48 handlers would drift and get forgotten.

**Q. Difference between an exception filter and error-handling middleware?**
Express error middleware is `(err, req, res, next)` and sits at the end of the chain. A Nest filter is a class implementing `ExceptionFilter`, gets `ArgumentsHost`, and can be scoped globally, per controller or per route.

**Q. Why not return `exception.message` to the client on a 500?**
It can leak file paths, library versions and query structure. The client gets a generic message plus a `requestId`; the detail goes to the log.

### File upload

**Q. Which middleware handles file uploads?**
multer, via Nest's `FileInterceptor` / `FilesInterceptor` / `FileFieldsInterceptor`. It parses `multipart/form-data`, which `express.json()` cannot.

**Q. `diskStorage` vs `memoryStorage`?**
`memoryStorage` buffers the whole file in RAM — fine for small images, dangerous for 50 MB deliverables. `diskStorage` streams to disk.

**Q. How do you stop someone uploading a `.exe`?**
`fileFilter` checks extension **and** MIME type against a whitelist, and rejects during the stream before the file is fully written.

**Q. How do you prevent path traversal?**
Never use `file.originalname` as the stored name — generate it. On download, resolve the path and assert it is still inside `uploads/`.

### Security

**Q. What does helmet do?**
Sets protective response headers: `nosniff`, `X-Frame-Options`, HSTS, CSP, and others.

**Q. What was wrong with the old role check?**
It read a plain `role` request header, so `curl -H 'role: superuser'` granted admin. Now the role comes from a signed token that the client cannot forge.

**Q. Why hash passwords, and what does salting prevent?**
Hashing means a leaked store does not hand over credentials. A per-user salt makes identical passwords hash differently, defeating precomputed rainbow tables.

**Q. What is rate limiting for?**
Slowing brute-force credential guessing and blunting denial-of-service. We apply a global limit plus a stricter one on `POST /users/login`.

### Project-specific

**Q. Where is the data stored?**
In-memory arrays in each repository, seeded from `seed.data.ts` — no database this phase. Logs and uploaded files are the only things written to disk; the front-end mirrors its cache into `localStorage`.

**Q. Which middleware types does this project implement?**
All five required: logging (V1), error handling (V2), file upload (V3), security (V4), router-level (V5) — plus Nest's pipes, guards and interceptors. See the A4 table.

---

# Part E — Shared file formats

**Contract between V1 and V2.** Both write to the same files, so the schema is frozen in `common/contracts/ILogEntry`.

One JSON object per line (JSONL — greppable, and parseable by the log viewer):

```jsonc
// logs/access-YYYY-MM-DD.log
{ "ts":"2026-08-26T18:04:11.212Z", "requestId":"a3f…", "method":"POST",
  "url":"/api/milestones/m3/submit", "status":201, "durationMs":47,
  "bytes":312, "ip":"::1", "userAgent":"Mozilla/5.0…",
  "role":"worker", "userId":"u5" }

// logs/error-YYYY-MM-DD.log
{ "ts":"…", "requestId":"a3f…", "level":"error", "method":"POST",
  "path":"/api/milestones/m3/submit", "status":500,
  "message":"Cannot read properties of null", "stack":"TypeError: …",
  "role":"worker", "userId":"u5", "body":{ "password":"[REDACTED]" } }

// logs/app-YYYY-MM-DD.log  — lifecycle + audit
{ "ts":"…", "level":"info", "event":"admin.action",
  "actor":"u1", "action":"seed.reset", "target":null, "ip":"::1" }
```

**Rules:** `password`, `token` and `authorization` are always `[REDACTED]`. Every request-scoped entry carries `requestId`. Timestamps are ISO-8601 UTC.

---

## Changelog

| Date | Layer | Change |
|---|---|---|
| 2026-08-26 | — | Document seeded with concepts and design, pre-implementation |
| 2026-08-26 | V2 | Error handling implemented. **Correction:** A5 was wrong — app.use() middleware errors ARE caught by Nest filters (sync and async, Express 5.2.1). Added verified filter-precedence rules. |
| 2026-08-26 | V1 | Logging implemented; C1 filled in. |
| 2026-08-26 | V0 | Foundation landed. **Correction:** 404s already return JSON — the claim that they fell through to Express HTML was wrong (verified against a running server). C2 and the V2 acceptance test updated. |
