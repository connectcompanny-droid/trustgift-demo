# TrustGift demo

Static, mobile-first frontend hosted with GitHub Pages and backed by Supabase
Auth, Postgres, and private Storage. This is still a demo: no gifts are sent,
no payment is collected, and no payout or level-queue rules are active.

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run the migrations in order:
   - [`supabase/migrations/20261126100000_initial_schema.sql`](./supabase/migrations/20261126100000_initial_schema.sql)
   - [`supabase/migrations/20261126163000_member_workflows.sql`](./supabase/migrations/20261126163000_member_workflows.sql)
   - [`supabase/migrations/20261126170400_support_agent_invitations.sql`](./supabase/migrations/20261126170400_support_agent_invitations.sql)
   - [`supabase/migrations/20261126173700_support_agent_management.sql`](./supabase/migrations/20261126173700_support_agent_management.sql)
   - [`supabase/migrations/20261126193000_all_phone_country_codes.sql`](./supabase/migrations/20261126193000_all_phone_country_codes.sql)
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

The app checks that both `member_workflows_ready()` and
`support_agent_management_ready()` return true before enabling registration
and sign-in. A publishable key cannot apply schema changes; run all migrations
manually in the Supabase SQL Editor first.

## Administrator and support invitations

There is no public administrator sign-up or self-promotion flow. Provision the
first administrator only after creating and confirming its normal TrustGift
account:

1. In Supabase SQL Editor, replace the example address with that account's
   confirmed e-mail and run:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
     || '{"trustgift_admin": true, "support_agent": true}'::jsonb
   where lower(email) = lower('first-admin@example.com');

   insert into public.support_agents (user_id)
   select id from auth.users
   where lower(email) = lower('first-admin@example.com')
   on conflict (user_id) do nothing;
   ```

2. Confirm that the account is now listed in `public.support_agents`; database
   policies use that table to grant inbox access. Sign out of TrustGift and sign
   in again so Supabase issues a JWT containing the new server-managed claims.
3. Link the Supabase project and deploy the Edge Function:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy support-invitations
   ```

   Legacy-secret JWT verification is turned off for this function
   (`verify_jwt = false` in `supabase/config.toml`); the function itself rejects
   any request without a valid signed-in user. If you deploy from the dashboard,
   name the function exactly `support-invitations` and turn off **Verify JWT with
   legacy secret**.

   The function uses Supabase's server-side `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` environment values. Never add the service-role
   key to `supabase-config.js` or any browser code. The function's CORS allowlist
   is the GitHub Pages origin; update `allowedOrigin` in
   `supabase/functions/support-invitations/index.ts` if the public domain
   changes.
4. Open **Admin → Support invitations**, enter the staff member's e-mail, then
   copy and send the generated link yourself. No e-mail is sent automatically.
   The invited person must register with that same address, accept the regular
   terms, and confirm the e-mail within 7 days. The one-time token is stored as
   a hash and redeemed by the Edge Function only after confirmation.

Only an administrator can create or revoke pending support-agent invitations,
or remove support-agent access. Support authorization is checked against the
`support_agents` table so removing an agent takes effect in database policies
without waiting for an existing JWT to expire. Reusing an accepted or expired
invitation never restores access. The invitation system cannot grant
administrator access; only the Supabase project owner can provision or change
the administrator claim. Apply all migrations before deploying/using the
function.

The registration form links to the demo Terms of Use and Privacy Policy
(`2026-11-v1`). These texts describe the current demo, not a production legal
agreement. Have them reviewed and replace the operator/contact and privacy
retention details before public commercial use.

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
  an administrator creates a one-time invitation in the admin panel. The
  invited person completes the regular sign-up and confirms the invited e-mail
  before the Edge Function grants `app_metadata.support_agent`. Never grant
  this claim through user-editable metadata or frontend code.
- **Languages:** The interface can be switched between English, French,
  Spanish, and a partial Brazilian Portuguese translation; the selection is
  saved in the current browser. Review untranslated interface text before
  advertising a language as fully supported.
- **Account recovery and legal pages:** Members can request a password reset
  by e-mail. The registration links open the demo Terms of Use and Privacy
  Policy; these are not production legal documents and require operator and
  jurisdiction-specific review before launch.
- **Payment preparation:** The app stores only selected method types and
  currencies—not Pix keys, wallet addresses, bank details, or provider
  credentials. Pix is available only when the profile country is Brazil.
  Payment intents and provider events are reserved for a future server-side
  integration; client-side transactions and payouts are not implemented.

The amounts and queue details on the levels page are illustrative only. Do
not use this demo to collect real payments or promise returns.
