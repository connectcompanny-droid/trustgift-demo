# TrustGift demo

Static, mobile-first frontend hosted with GitHub Pages and backed by Supabase
Auth, Postgres, and private Storage. This is still a demo: no gifts are sent,
no payment is collected, and no payout or level-queue rules are active.

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run the migrations in order:
   - [`supabase/migrations/20261126100000_initial_schema.sql`](./supabase/migrations/20261126100000_initial_schema.sql)
   - [`supabase/migrations/20261126163000_member_workflows.sql`](./supabase/migrations/20261126163000_member_workflows.sql)
3. Copy the project URL and the **publishable key** (or legacy `anon` key)
   from Project Settings → API into `supabase-config.js`. Set `siteUrl` to the
   public HTTPS URL of this app; email confirmations use this value instead of
   the browser's current origin. Never put a `service_role` or secret key in
   frontend code.
4. In Supabase Authentication → URL Configuration, allow
   `https://connectcompanny-droid.github.io/trustgift-demo/**` as a redirect URL
   and set the Site URL to
   `https://connectcompanny-droid.github.io/trustgift-demo/`.
5. In Authentication → Providers → Email, choose whether email confirmation
   is required. With confirmation enabled, referrals count as active only once
   the referred member confirms their address.

The app checks that `member_workflows_ready()` returns true before enabling
registration and sign-in. A publishable key cannot apply schema changes; run
both migrations manually in the Supabase SQL Editor first.

## Connected workflows

- **Authentication and profile:** Supabase Auth manages accounts and email
  confirmation. Profiles, contact details, accepted legal-text versions, and
  payment-method preferences are stored in the database with row-level
  security. A user can only manage their own private profile and contacts.
- **Referrals:** Referral codes are validated in the database. Counts and
  member lists are available only to the referring signed-in member. A referral
  is active after email confirmation.
- **Leaderboard:** Public ranking is limited to email-confirmed members who
  explicitly opt in. It reveals only username, country, and confirmed referral
  count.
- **Support:** Authenticated members can exchange private messages and upload
  JPG, PNG, GIF, WebP, or PDF attachments up to 8 MB. To grant staff access,
  an administrator must set `app_metadata.support_agent` to boolean `true` for
  each trusted staff account using a server-side/admin-only Supabase workflow.
  Never grant this claim through user-editable metadata or frontend code.
- **Payment preparation:** The app stores only selected method types and
  currencies—not Pix keys, wallet addresses, bank details, or provider
  credentials. Pix is available only when the profile country is Brazil.
  Payment intents and provider events are reserved for a future server-side
  integration; client-side transactions and payouts are not implemented.

The amounts and queue details on the levels page are illustrative only. Do
not use this demo to collect real payments or promise returns.
