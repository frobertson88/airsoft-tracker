# Development setup

Stage 1 stack: Expo (React Native, TypeScript) in `mobile/` and Supabase in `supabase/`. See [architecture](architecture.md#9-technology-stack).

## One-time Supabase setup

1. **Database:** Supabase dashboard → **SQL Editor** → New query → paste all of `supabase/migrations/0001_stage1.sql` → **Run**. Run each migration once, in number order.
2. **Sign-in code email:** **Authentication → Emails → Templates**. In both **Confirm signup** (first sign-in) and **Magic Link** (later sign-ins), replace the body with:

   ```html
   <h2>Your Airsoft Tracker code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```

   Without `{{ .Token }}` the email contains only a link, which the app does not use.
3. **Sign-ups:** **Authentication → Sign In / Providers**: keep **Allow new users to sign up** and the **Email** provider enabled.

Supabase's built-in email sender is rate-limited (a few emails per hour). Add custom SMTP before wider testing.

## Running the app

Requires Node.js LTS on the computer and the **Expo Go** app on each test phone.

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the phone camera (iPhone) or Expo Go (Android). The phone and computer must be on the same Wi-Fi; otherwise use `npx expo start --tunnel`.

The Supabase URL and publishable key (public by design) are defaults in `mobile/src/lib/supabase.ts`; copy `mobile/.env.example` to `mobile/.env` to override them. Never put the secret/service-role key in the app.

## Checks

```bash
cd mobile && npx tsc --noEmit && npx expo lint
cd supabase && npm install && npm test   # database rules against an in-memory Postgres
```

## Notes

- `node_modules` folders inside OneDrive sync slowly. If OneDrive struggles, move the repository outside OneDrive or exclude `node_modules` from sync.
- Location permission is checked in the app before joining. The server cannot verify phone permissions.
