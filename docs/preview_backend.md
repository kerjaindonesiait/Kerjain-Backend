1. Create a branch (not main)
   git checkout -b feature/my-change
2. Commit and push
   git push -u origin feature/my-change
3. Vercel auto-builds that branch
   → gives you a preview URL (like the one you have)
4. Test on that URL
5. When happy → merge into main
   → production deploys (kerjaindonesia.com or api.kerjaindonesia.com)

src/lib/api.ts
All requests use credentials: "include" (HttpOnly cookies)
Removed localStorage token storage
refresh uses cookie only (no body)
logout no longer sends refreshToken in JSON
register / login return { user } only (no tokens in JSON)
Clears legacy localStorage keys on startup
src/lib/auth.tsx
Session is restored via GET /api/auth/me + cookie refresh
login sets user from response (cookies set by server)
register does not create a session (verify email first)
Removed setSession
src/app/pages/AuthCallback.tsx
Handles ?oauth=success instead of access_token / refresh_token in the URL
src/app/pages/TechAuth.tsx
Email signup: register only → “check your email” screen (profile save requires login after verify)
OAuth signup: unchanged (cookies set on callback, resume flow works)
src/app/pages/VerifyEmail.tsx
After verify → directs to /masuk (verify does not auto-login)
Kerjain-Backend/src/index.ts
CORS now uses config.corsOrigins (supports CORS_ORIGINS env var for preview domains)