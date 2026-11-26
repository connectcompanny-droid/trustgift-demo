# TrustGift demo

Static, mobile-first frontend hosted with GitHub Pages. Supabase is used for
authentication and a small private profile database; this project does not
process gifts or store payment account details.

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run
   [`supabase/migrations/20261126100000_initial_schema.sql`](./supabase/migrations/20261126100000_initial_schema.sql).
   It creates the profile and consent tables, signup trigger, referral-count
   function, and row-level security policies.
3. Copy the project URL and the **publishable key** (or legacy `anon` key)
   from Project Settings → API into `supabase-config.js`.
   These client values are public by design; never put a `service_role` or
   secret key in this file or in frontend code.
4. In Supabase Authentication → URL Configuration, add the deployed site URL
   to the allowed redirect URLs:
   `https://connectcompanny-droid.github.io/trustgift-demo/**`
5. In Authentication → Providers → Email, choose whether email confirmation
   is required. With confirmation enabled, members confirm their email before
   signing in.

The browser client checks project health and the migration's read-only
`is_schema_ready()` function before enabling authentication. The browser
client only receives the publishable key. Row-level security
restricts profile and consent reads to their owner; the signup trigger creates
the initial records. Referral codes are resolved inside the database and the
referral-count function only returns the signed-in user's count.

Rewards, referrals, rankings, support messages, and payment-method lists are
illustrative or local-only and are not submitted to Supabase. Only the signed-in
profile's first name, last name, and country are saved. Pix is shown when Brazil
is selected. Do not use this demo to collect wallet addresses, banking details,
or real payments.
