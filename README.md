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
all migrations manually in the Supabase SQL Editor first.

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
   ```

2. Confirm that exactly one row was updated. Sign out of TrustGift and sign in
   again so Supabase issues a JWT containing the new server-managed claims.
3. Link the Supabase project and deploy the Edge Function:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy support-invitations
   ```

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

Only an administrator can create support-agent invitations. The invitation
system cannot grant administrator access; only the Supabase project owner can
provision or change the administrator claim. Apply the invitation migration
before deploying/using the function.

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
- **Languages:** The interface can be switched between English, French, and
  Spanish; the selection is saved in the current browser.
- **Payment preparation:** The app stores only selected method types and
  currencies—not Pix keys, wallet addresses, bank details, or provider
  credentials. Pix is available only when the profile country is Brazil.
  Payment intents and provider events are reserved for a future server-side
  integration; client-side transactions and payouts are not implemented.

The amounts and queue details on the levels page are illustrative only. Do
not use this demo to collect real payments or promise returns.
