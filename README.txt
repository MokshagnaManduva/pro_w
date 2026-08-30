LANNENT — MIDDLEWARE LAYER PACKAGES
===================================

Six zips. Each contains the whole project at one stage of the middleware work.
Hand ONE to each person. Every zip unpacks to a folder called "Lannent/".

  0-main-foundation.zip     The shared base. Everyone should look at this
                            first — the other five all build on top of it.
                            Nobody "owns" this one.

  1-logging.zip             Logging middleware: buffered request logger that
                            writes to files on a timer, daily rotation, and a
                            superuser log viewer page.

  2-error-handling.zip      Error handling: one global exception filter that
                            persists failures with stack traces, stable error
                            codes, request timeouts, and front-end toasts.

  3-file-upload.zip         File upload: multer with per-category size and
                            type limits, disk storage, download/delete, and
                            real multipart uploads from the browser.

  4-security.zip            Security: helmet, CORS allow-list, rate limiting,
                            scrypt password hashing, and signed session
                            tokens.

  5-router-middleware.zip   Router-level middleware: authentication bound to
                            specific routers, a login-only rate limiter, an
                            upload guard, and an admin audit trail.


HOW TO RUN ANY OF THEM
----------------------
  cd Lannent/back-end
  npm install
  cp .env.example .env        # then edit: set TOKEN_SECRET to any long string
  npm run start:dev           # API on http://localhost:3000

  # in a second terminal, serve the front-end:
  cd Lannent/front-end
  npx serve -l 5500 .         # then open http://localhost:5500

  Demo logins are listed on the login page.
  Swagger API docs: http://localhost:3000/api-docs


NOTES
-----
* node_modules is NOT included — run "npm install" first.
* .env is NOT included (it holds a secret). Copy .env.example to .env.
* Video/Team-Video.mp4 was left out: it is 71.5 MB, identical in all six
  packages, and already in the GitHub repo. Adding it would have made each
  zip ~72 MB instead of 1.5 MB.
* These are snapshots without git history. The full history, with all six
  branches, is at:  https://github.com/MokshagnaManduva/pro_w
