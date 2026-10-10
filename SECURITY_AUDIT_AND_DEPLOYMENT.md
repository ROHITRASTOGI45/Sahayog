# Sahayog Security Hardening & Deployment Notes

## Scope and status

This package contains targeted security hardening. It is not a substitute for an independent penetration test. No production credentials were configured or rotated as part of this work. External-service behavior and live deployment were not tested.

## Changes included

- Removed the bundled Firebase service-account private credential. Configure `GOOGLE_APPLICATION_CREDENTIALS` to point to a secret-mounted file in the hosting environment, or use the host's workload identity/application-default credentials.
- Added safe environment templates at `server/.env.example` and `client/.env.example`; these contain placeholders only.
- Expanded `.gitignore` for temporary uploads and private credential files.
- Removed public static serving of the server's `public` directory, which also prevented files under `public/temp` from being served directly.
- Added baseline security response headers and removed Express's `X-Powered-By` header.
- Avoided logging CORS origin lists, original upload filenames, and Cloudinary URLs in routine logs; production API errors no longer print stack traces.
- Changed upload filenames to random UUID-based names and stopped accepting `application/octet-stream` based solely on an extension. Actual file-signature validation is still recommended before production.
- Added lightweight per-process rate limits to customer, worker, cooperative-owner and system-admin login/registration endpoints. This is suitable only for a single instance; use a shared store such as Redis before horizontal scaling.
- Protected cooperative-admin `/register` with cooperative-admin authentication and scoped the new admin to the authenticated admin's cooperative rather than trusting a client-provided cooperative ID.
- Added a dedicated `SYSTEM_ADMIN_JWT_SECRET` requirement in production and used it to sign/verify system-admin tokens. This requires setting the new environment variable before deployment.
- Added production startup checks for required secrets and minimum signing-secret lengths.

## Route inventory (high-level)

| Mount path | Public routes | Protected routes / expected role |
|---|---|---|
| `/api/v1/customers` | `POST /register`, `POST /login` | Logout, profile, professional profile, saved professionals — Customer |
| `/api/v1/workers` | `POST /register`, `POST /login` | Profile, location, cooperative listing/join requests, logout — Worker |
| `/api/v1/jobs` | Inspect router for job creation/authentication rules | Customer-authenticated job operations; verify ownership for every job ID |
| `/api/v1/worker-jobs` | None expected | Worker-authenticated job operations; verify assigned-worker ownership |
| `/api/v1/cooperative-admin` | `POST /register-owner`, `POST /login` | All remaining routes, including `POST /register`, require Cooperative Admin; scope data to their cooperative |
| `/api/v1/system-admin` | `POST /login` | Logout, list/approve/reject cooperatives — System Admin |
| `/api/v1/cooperatives` | `POST /register` | Public onboarding; validate input and prevent abuse |
| `/api/v1/matching` | None expected | Customer-authenticated matching; enforce eligibility on the server |
| `/api/v1/notifications` | None expected | Worker-authenticated notifications; restrict records to the current worker |
| `/api/v1/location` | Depends on route definition | JWT-protected; validate coordinates and rate-limit upstream geocoding |
| `/health`, `/` | Public | Health/basic status only; do not return configuration or secrets |

This is a high-level inventory. Review each route file before release and maintain automated ownership tests for all `:id` operations.

## Environment variables to configure

Required for production:

- `NODE_ENV=production`
- `PORT` (provided by the host if applicable)
- `MONGO_URI` — restricted database user and production database
- `CLIENT_ORIGINS` — exact frontend origin(s), comma-separated, no trailing slash
- `ACCESS_TOKEN_SECRET` — unique random value, at least 32 characters
- `REFRESH_TOKEN_SECRET` — different unique random value, at least 32 characters
- `SYSTEM_ADMIN_JWT_SECRET` — another unique random value, at least 32 characters
- `SYSTEM_ADMIN_EMAIL`
- `SYSTEM_ADMIN_PASSWORD` — strong unique password
- `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY`, `SYSTEM_ADMIN_TOKEN_EXPIRY`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `GOOGLE_APPLICATION_CREDENTIALS` — path to a secret-mounted Firebase service account, or use host identity/application-default credentials
- Frontend: `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, and only the Firebase web configuration values needed by the browser

Never place server credentials or the Firebase Admin service account in `client/.env` or in the frontend build.

## Mandatory manual actions before deployment

1. If the removed Firebase service-account file was ever shared or committed, revoke/rotate that key in Google Cloud. Removing the file from this ZIP does not revoke the credential.
2. Rotate MongoDB credentials, JWT secrets, Cloudinary API secret, and system-admin password if the prior archive or any copy was shared outside a trusted environment.
3. Set `SYSTEM_ADMIN_JWT_SECRET` in the production host before starting the backend.
4. Configure MongoDB network access and a least-privilege database user.
5. Configure the frontend's exact production origin in `CLIENT_ORIGINS` and verify cookie behavior across the chosen domains.
6. If frontend and backend are cross-site and use cookies, implement/verify a CSRF strategy before production. Do not assume CORS alone prevents CSRF.
7. Run signature-based file validation for uploaded images and protect identity documents with private/signed delivery. The current patch rejects generic octet-stream files but does not inspect binary signatures.
8. Add a persistent shared rate-limit store before running multiple backend instances.
9. Review all job ownership/state transitions, notification ownership, cooperative isolation, and socket events with automated integration tests.
10. Run the production build, tests, dependency audit, and smoke tests with test credentials and a test database.

## Known remaining risks / not claimed as completed

- The lightweight rate limiter stores counters in memory and can be bypassed across multiple instances; use Redis/shared storage for scale.
- Full CSRF protection for cookie-authenticated writes has not been implemented in this patch and must be verified/added for the deployment topology.
- Upload MIME checks are not equivalent to signature validation. Add a maintained file-type/signature validation dependency and test it before accepting public uploads.
- Refresh-token rotation/revocation and all IDOR/state-transition checks still require route-by-route integration tests; do not infer they are fully verified from a successful build.
- The system-admin credential remains environment-based; protect it with a strong password, rate limits, dedicated signing key, and preferably MFA/persisted identity in a later hardening pass.
- No live credentials were rotated, no external APIs were called, and no production data was changed.
