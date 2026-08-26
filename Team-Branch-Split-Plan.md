# Lannent — 5-Layer Middleware Split Across 5 Branches
## Team work-division and conflict-free merge plan

**Date:** 2026-08-26
**Companion docs:** `Middleware-Implementation-Plan.md` (technical spec) · `Middleware-Documentation.md` (living reference + viva prep)
**Team:** 6 people — 1 integrator (Mokshagna) + 5 layer owners
**Split model:** **one middleware layer per person**, end to end.

---

## 1. The five branches

The assignment names exactly five mandatory middleware types, so the split follows them one-to-one. Each branch is a **full-stack vertical slice** — backend middleware plus the matching front-end change — so every layer is independently demoable by its owner.

| Branch | Layer | Owns | Requirement satisfied |
|---|---|---|---|
| `v1-logging` | **Logging** | Request logger, buffered file writer, interval flush, daily rotation, log-viewer UI | Logging + "logs stored in files at regular intervals" |
| `v2-error-handling` | **Error handling** | Exception filter → file sink, 404 fallback, timeout guard, process-level handlers, front-end error surfacing | Error handling + error file persistence |
| `v3-file-upload` | **File upload** | Multer module, disk storage, filters/limits, upload metadata, front-end upload wiring | File upload |
| `v4-security` | **Security** | Helmet, CORS, throttler, config, password hashing, tokens, sanitisation | Security |
| `v5-router-middleware` | **Router-level** | Auth middleware, per-route rate limit, upload guard, admin audit, role enforcement | Router-level middleware |

---

## 2. Effort: the honest sizing

Sizes are approximate new + modified lines, backend + frontend, **after** the rebalancing in §2.1.

| Branch | Total | Weight | Risk |
|---|---:|---|---|
| `v1-logging` | ~445 | ●●●○○ | Low — purely additive, nothing depends on it |
| `v2-error-handling` | ~530 | ●●●●○ | Low |
| `v3-file-upload` | ~760 | ●●●●● | Medium — biggest diff, but a brand-new module |
| `v4-security` | ~540 | ●●●●○ | **Highest** — changes auth for every request |
| `v5-router-middleware` | ~440 | ●●●○○ | Medium — depends on V4's token |

**Spread: 1.7×** (760 ÷ 440). Not perfectly flat, but normal variance for a team split.

### 2.1 The rebalancing already applied

Raw, before any adjustment, error handling was ~390 and file upload ~890 — a **2.3× gap**. Three pieces moved, and each move is also *architecturally* more correct, not just bookkeeping:

| Move | From → To | Why it genuinely belongs there |
|---|---|---|
| `MulterExceptionFilter` (~50) | V3 → V2 | It is an exception filter. Error handling owns filters. |
| Static file serving + path-traversal guard (~80) | V3 → V4 | Serving user-uploaded files safely is a security concern. |
| Swagger refresh + replacing `test/app.e2e-spec.ts` (~90) | — → V2 | V2 was lightest, and the starter e2e test currently **fails** (asserts `GET /` → `'Hello World!'`, but there is no `AppController` and a global `/api` prefix). |

### 2.2 How to assign

- **V4 is the highest-risk slice, not the biggest.** It replaces the spoofable `role` header with real tokens — if it is wrong, *every* route breaks. Give it to your most confident teammate.
- **V3 is the biggest but the safest.** A brand-new module touching almost nothing that already exists. Good for someone who wants volume without risk of breaking the app.
- **V1 and V5 are the lightest.** If you want them heavier, V1 can absorb a log-analytics page and V5 can absorb the offline-mode UX.

---

## 3. V0 — the foundation commit (this is what makes merges conflict-free)

**Merge conflicts here would come from exactly six shared files.** Every layer wants to touch them:

`package.json` · `package-lock.json` · `src/main.ts` · `src/app.module.ts` · `front-end/js/store.js` · `front-end/js/auth.js`

The fix: **land one foundation commit on `main` that touches all six for the last time**, then branch. After V0 they are **frozen** — no layer branch may edit them.

### V0 contents (integrator, before anyone starts)

**1. Install every dependency at once** — kills the lockfile conflict permanently:
```bash
cd back-end
npm i helmet compression @nestjs/throttler @nestjs/config
npm i -D @types/multer @types/compression
```
*(multer already ships transitively with `@nestjs/platform-express`; only its types are missing.)*

**2. Five bootstrap hook files** — `src/common/bootstrap/`, each a no-op stub. `main.ts` calls all five and is **never edited again**:
```ts
setupSecurity(app);   // helmet, cors, body limits    — V4
setupLogging(app);    // process log hooks            — V1
setupErrors(app);     // process error handlers       — V2
setupUploads(app);    // static assets, multer        — V3
setupRouting(app);    // route-level wiring           — V5
```

**3. Five empty layer modules**, all imported by `app.module.ts` in one commit:
```ts
@Module({}) export class LoggingModule {}        // V1 fills
@Module({}) export class ErrorHandlingModule {}  // V2 fills
@Module({}) export class UploadsModule {}        // V3 fills
@Module({}) export class SecurityModule {}       // V4 fills
@Module({}) export class RoutingModule {}        // V5 fills
```
Each layer registers its own `APP_FILTER` / `APP_INTERCEPTOR` / `APP_GUARD` **inside its own module file**, never in `app.module.ts`. That is what keeps `app.module.ts` written once and frozen.

**4. Shared contracts** — `src/common/contracts/`, so branches compile against each other from day one without waiting:
`ILogEntry`, `FILE_LOGGER` token + `IFileLogger`, `ITokenPayload`, `IUploadMeta`, `IAuthedRequest`.

**5. Working stubs** so cross-layer imports resolve immediately:
- `FileLoggerService` — console passthrough (V1 replaces the body; V2 can inject it on day one)
- `token.util.ts` — trivial sign/verify (V4 replaces the body; V5 can consume it on day one)

**6. Front-end extension points** — `store.js` gets its final edit here (`auth.js` is not frozen; V4 owns it outright). A tiny hook dispatcher lets three layers extend `Store` without any of them reopening the file:
```js
// js/hooks.js  (V0)
window.LannentHooks = {};
function _hook(name, ...a) { try { return window.LannentHooks[name]?.(...a); } catch(e){} }
```
`store.js` calls `_hook('onApiError', err, ctx)` in its failure paths and `_hook('onCacheChange', _cache)` after mutations. Layers register handlers from **their own** files.

**7. Housekeeping:** `.env.example`; `.gitignore` += `logs/`, `uploads/`, `.DS_Store`; re-add the git remote (**currently missing** — `git remote -v` is empty in this working copy).

**8. Create and push the five branches:**
```bash
git checkout main && git pull
for b in v1-logging v2-error-handling v3-file-upload v4-security v5-router-middleware; do
  git branch "$b" && git push -u origin "$b"
done
```

---

## 4. File ownership — strictly disjoint

**The rule: if a file is not in your row, you do not touch it.** These lists were checked against the actual tree; the genuine overlaps are resolved in §4.1.

### V1 — `v1-logging`
| Backend | Frontend |
|---|---|
| `common/logging/file-logger.service.ts` *(replaces V0 stub)* | `js/log-viewer.js` *(new)* |
| `common/logging/logging.module.ts` | `pages/superuser-logs.html` *(new page)* |
| `common/logging/log-rotation.util.ts` | |
| `common/middleware/logger.middleware.ts` *(rewrite)* | |
| `common/middleware/request-id.middleware.ts` *(new)* | |
| `common/bootstrap/logging.bootstrap.ts` | `js/dashboard.js` *(one line: superuser menu entry)* |
| `modules/logs/` *(read-only log API, superuser)* | |

### V2 — `v2-error-handling`
| Backend | Frontend |
|---|---|
| `common/filters/http-exception.filter.ts` *(rewrite)* | `js/toast.js` *(new — unified toast)* |
| `common/filters/not-found.filter.ts` *(new)* | `js/api-errors.js` *(new — registers `onApiError`)* |
| `common/filters/multer-exception.filter.ts` *(new — moved from V3)* | `pages/dispute.html` |
| `common/interceptors/timeout.interceptor.ts` *(new)* | `pages/milestone-reports.html` |
| `common/errors/error-codes.ts` *(new)* | `pages/project-milestone-board.html` |
| `common/bootstrap/errors.bootstrap.ts` | `pages/profile-settings.html` |
| `test/app.e2e-spec.ts` *(replace the broken starter test)* | |

### V3 — `v3-file-upload`
| Backend | Frontend |
|---|---|
| `modules/uploads/` *(module, controller, service, repository, dto)* | `js/uploads.js` *(new — `FormData` + progress)* |
| `common/multer/multer.config.ts` *(storage, fileFilter, limits)* | `pages/submit-deliverable.html` |
| `common/bootstrap/uploads.bootstrap.ts` | `pages/expert-signup.html` |
| `modules/milestones/dto/update-milestone.dto.ts` *(+`attachments`)* | `pages/project-workroom.html` |
| `modules/expert-applications/dto/create-expert-application.dto.ts` *(+`attachments`)* | `pages/worker-workroom.html` |

### V4 — `v4-security`
| Backend | Frontend |
|---|---|
| `common/security/password.util.ts` *(scrypt)* | `js/auth.js` *(sole owner)* |
| `common/security/token.util.ts` *(replaces V0 stub)* | `index.html` *(remove hard-coded superuser creds)* |
| `common/security/sanitize.util.ts` | `pages/login.html` |
| `common/security/security.module.ts` *(helmet, throttler, static-serve + traversal guard)* | `pages/expert-login.html` |
| `common/bootstrap/security.bootstrap.ts` | |
| `modules/users/users.repository.ts` *(hash seeds, strip password)* | |
| `modules/users/users.service.ts` *(verify + issue token)* | |
| `config/configuration.ts`, `.env` | |

### V5 — `v5-router-middleware`
| Backend | Frontend |
|---|---|
| `common/middleware/auth.middleware.ts` *(new)* | `js/local-cache.js` *(new — `lannent_data_v1` mirror)* |
| `common/middleware/login-rate-limit.middleware.ts` *(new)* | `js/offline-banner.js` *(new)* |
| `common/middleware/upload-guard.middleware.ts` *(new)* | |
| `common/middleware/admin-audit.middleware.ts` *(new)* | |
| `common/guards/role.guard.ts` *(read `req.user`, not headers)* | |
| `common/routing/routing.module.ts` *(all `configure()` blocks)* | |
| `modules/{proposals,audit-reports,notifications,messages}/*.controller.ts` *(add missing `@Roles`)* | |

### 4.1 Resolved overlaps

Verified with `grep`, not assumed:

1. **`project-workroom.html` + `worker-workroom.html`** each define their own `showToast` **and** hold a file input — wanted by both V2 and V3. → **V3 owns both pages.** V2's toast unification covers only the other four pages plus `js/`.
2. **`role.guard.ts`** — V4 issues the token, V5 consumes it. → **V5 owns the guard file.** V4 only produces `token.util.ts`; V5 does all the wiring. The V0 stub token lets V5 build before V4 merges.
3. **`upload-guard.middleware.ts`** (V5) targets V3's upload routes. → V5 binds it by **path string** (`'api/uploads/*'`), not by importing `UploadsController`, so the two branches never reference each other.

---

## 5. Merge order and mechanics

All five branch from the same V0 commit, so any order works. This order lands each layer's *real* dependency before it:

```
main (V0)
  ├── v1-logging            → merge 1st   (real FileLoggerService replaces stub)
  ├── v2-error-handling     → merge 2nd   (now writes to the real logger)
  ├── v4-security           → merge 3rd   (real token.util replaces stub)
  ├── v5-router-middleware  → merge 4th   (now verifies real tokens)
  └── v3-file-upload        → merge 5th   (guarded by real auth, largest diff last)
```

Each owner, before opening their PR:
```bash
git checkout main && git pull
git checkout v3-file-upload
git rebase main            # should be clean — disjoint files
npm ci && npm run build    # must compile
git push --force-with-lease
```

**Authorship:** whoever runs `git commit` is the author. Each teammate should check out their branch, read the diff, run the §7 acceptance checks, and commit it themselves — so the history reflects who reviewed and signed off on which layer.

**Merge, don't squash.** `git merge --no-ff v1-logging` keeps each person's individual commits in `main`, so `git shortlog -sne` shows the real per-author split. Squashing collapses a whole branch to one commit and hides the work.

Suggested granularity — 5–7 commits per branch:
> `feat(logging): add buffered file logger` → `feat(logging): interval flush + daily rotation` → `feat(logging): rewrite HTTP logger middleware` → `feat(logging): request-id correlation` → `feat(logging): superuser log viewer page` → `docs(logging): fill Middleware-Documentation section`

**Every branch's last commit updates its own section of `Middleware-Documentation.md`.** That is how the reference doc stays current instead of being written from memory the night before the viva.

---

## 6. Frozen files — the conflict-free contract

After V0, **no layer branch may edit these**:

| File | Why frozen |
|---|---|
| `back-end/package.json`, `package-lock.json` | All deps installed in V0. Lockfile conflicts are the worst kind. |
| `back-end/src/main.ts` | Calls the five bootstrap hooks; each layer fills its own hook file. |
| `back-end/src/app.module.ts` | Imports the five layer modules; each layer fills its own module. |
| `back-end/src/common/contracts/*` | Shared interfaces. Changing one breaks four branches. |
| `front-end/js/store.js` | Extended via `window.LannentHooks`, never reopened. |

If a layer genuinely needs one of these changed, it goes through the integrator as a **separate commit on `main`**, and everyone rebases. Never fix it on a branch.

---

## 7. Acceptance criteria

Each owner demos their layer standalone before merging.

**V1** — hit several endpoints, wait ~15 s, `tail back-end/logs/access-*.log`: entries appear **in batches** on the flush timer, not per request. `X-Request-Id` on the response matches the log line. Ctrl-C flushes the final buffer.

**V2** — deliberate throw → 500 with a generic client message, full stack in `error-*.log`, matching `requestId`. Front-end: a failed create shows an error toast instead of silently faking success.

**V3** — `curl -F "files=@sample.zip" /api/uploads/deliverable` → file on disk under `uploads/deliverables/` with a generated name. Oversized → 413; `.exe` → 400. Restart the server → `GET /api/uploads` still lists it (boot-time rescan). Browser: drag-drop shows real progress.

**V4** — response carries helmet headers. Disallowed `Origin` blocked. 6 rapid bad logins → 429. `GET /api/users` returns **no** `password` field. Seeded logins still work against hashed passwords.

**V5** — `POST /api/users/login` with no token succeeds (excluded route); `GET /api/tasks` with no token → 401. `curl -H 'role: superuser' -X POST /api/seed/reset` → **403** (the header alone no longer works); same call with a valid superuser token → 200 plus an audit entry.

**Full integration (after all five merge)** — log in as client / worker / expert / superuser; run post task → proposal → hire → milestone submit *with a real file* → approve → wallet. Logs and errors both landing in files.

---

## 8. Suggested sequence

| Step | Who | Work |
|---|---|---|
| 0 | Integrator | V0 foundation commit on `main`; re-add remote; push 5 branches |
| 1 | All 5 in parallel | Implement layers against the V0 contracts |
| 2 | Each owner | Self-demo via §7, then fill their section of `Middleware-Documentation.md` |
| 3 | Integrator | Merge in the §5 order, `--no-ff`, one at a time |
| 4 | All | Integration test after each merge, not only at the end |
| 5 | Integrator | Update `back-end/README.md` — still untouched NestJS boilerplate today |

**Do not let all five merge on the last day.** Land V1 as soon as it is ready; each later merge is then validated against a known-good `main`.
