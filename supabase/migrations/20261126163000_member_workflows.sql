alter table public.profiles
  add column if not exists leaderboard_opt_in boolean not null default false;

grant update (leaderboard_opt_in) on table public.profiles to authenticated;

create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'support_agent') = 'true', false);
$$;

revoke all on function public.is_support_agent() from public, anon;
grant execute on function public.is_support_agent() to authenticated;

create table if not exists public.profile_contacts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone_country_code text,
  phone_number text,
  whatsapp_country_code text,
  whatsapp_number text,
  updated_at timestamptz not null default now(),
  constraint profile_contacts_phone_pair check (
    (phone_country_code is null and phone_number is null)
    or (phone_country_code is not null and phone_number is not null)
  ),
  constraint profile_contacts_phone_country_code check (
    phone_country_code is null or phone_country_code in ('+1', '+33', '+34', '+55', '+509')
  ),
  constraint profile_contacts_whatsapp_pair check (
    (whatsapp_country_code is null and whatsapp_number is null)
    or (whatsapp_country_code is not null and whatsapp_number is not null)
  ),
  constraint profile_contacts_whatsapp_country_code check (
    whatsapp_country_code is null or whatsapp_country_code in ('+1', '+33', '+34', '+55', '+509')
  )
);

alter table public.profile_contacts enable row level security;
revoke all on table public.profile_contacts from anon, authenticated;
grant select, insert, update, delete on table public.profile_contacts to authenticated;

drop policy if exists "Users manage their own contact details" on public.profile_contacts;
create policy "Users manage their own contact details"
  on public.profile_contacts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Support agents can view contact details" on public.profile_contacts;
create policy "Support agents can view contact details"
  on public.profile_contacts for select to authenticated
  using ((select public.is_support_agent()));

create or replace function public.handle_signup_profile_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
  profile_whatsapp text := nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), '');
  phone_code text := nullif(trim(new.raw_user_meta_data ->> 'phone_country_code'), '');
  whatsapp_code text := nullif(trim(new.raw_user_meta_data ->> 'whatsapp_country_code'), '');
begin
  if profile_phone is null and profile_whatsapp is null then
    return new;
  end if;
  if (profile_phone is not null and (phone_code is null or phone_code not in ('+1', '+33', '+34', '+55', '+509')))
     or (profile_whatsapp is not null and (whatsapp_code is null or whatsapp_code not in ('+1', '+33', '+34', '+55', '+509'))) then
    raise exception 'Choose a valid country calling code for each contact number';
  end if;

  insert into public.profile_contacts (
    user_id, phone_country_code, phone_number, whatsapp_country_code, whatsapp_number
  )
  values (
    new.id,
    case when profile_phone is null then null else phone_code end,
    profile_phone,
    case when profile_whatsapp is null then null else whatsapp_code end,
    profile_whatsapp
  );
  return new;
end;
$$;

revoke all on function public.handle_signup_profile_contacts() from public, anon, authenticated;
drop trigger if exists save_signup_profile_contacts on auth.users;
create trigger save_signup_profile_contacts
  after insert on auth.users
  for each row execute function public.handle_signup_profile_contacts();

create or replace function public.my_referral_stats()
returns table (total_referrals integer, active_referrals integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(referral.id)::integer,
    count(referral.id) filter (where referred_user.email_confirmed_at is not null)::integer
  from public.profiles as referral
  left join auth.users as referred_user on referred_user.id = referral.id
  where referral.referred_by = (select auth.uid());
$$;

revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated;

create or replace function public.my_referrals()
returns table (username text, referred_at timestamptz, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    referral.username,
    referral.created_at,
    referred_user.email_confirmed_at is not null
  from public.profiles as referral
  left join auth.users as referred_user on referred_user.id = referral.id
  where referral.referred_by = (select auth.uid())
  order by referral.created_at desc;
$$;

revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

create or replace function public.public_leaderboard()
returns table (
  "position" bigint,
  username text,
  country text,
  active_referrals integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with scores as (
    select
      member.id,
      member.username,
      member.country,
      count(referral.id) filter (
        where referred_user.email_confirmed_at is not null
      )::integer as active_referrals
    from public.profiles as member
    join auth.users as member_auth
      on member_auth.id = member.id
      and member_auth.email_confirmed_at is not null
    left join public.profiles as referral on referral.referred_by = member.id
    left join auth.users as referred_user on referred_user.id = referral.id
    where member.leaderboard_opt_in
    group by member.id, member.username, member.country
  )
  select
    row_number() over (order by scores.active_referrals desc, scores.username)::bigint,
    scores.username,
    scores.country,
    scores.active_referrals
  from scores
  order by scores.active_referrals desc, scores.username
  limit 100;
$$;

revoke all on function public.public_leaderboard() from public;
grant execute on function public.public_leaderboard() to anon, authenticated;

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'waiting', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_threads_one_open_per_user_idx
  on public.support_threads (user_id)
  where status in ('open', 'waiting');

create index if not exists support_threads_updated_at_idx
  on public.support_threads (updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  created_at timestamptz not null default now(),
  constraint support_messages_content_present check (
    length(trim(body)) > 0 or attachment_path is not null
  ),
  constraint support_messages_body_size check (length(body) <= 2000)
);

create index if not exists support_messages_thread_created_idx
  on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on table public.support_threads, public.support_messages from anon, authenticated;
grant select, insert on table public.support_threads to authenticated;
grant select, insert on table public.support_messages to authenticated;
grant update (status) on table public.support_threads to authenticated;

drop policy if exists "Users and support agents can view support threads" on public.support_threads;
create policy "Users and support agents can view support threads"
  on public.support_threads for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_support_agent()));

drop policy if exists "Users can create their own support threads" on public.support_threads;
create policy "Users can create their own support threads"
  on public.support_threads for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open');

drop policy if exists "Support agents can update support threads" on public.support_threads;
create policy "Support agents can update support threads"
  on public.support_threads for update to authenticated
  using ((select public.is_support_agent()))
  with check ((select public.is_support_agent()));

drop policy if exists "Users and support agents can view support messages" on public.support_messages;
create policy "Users and support agents can view support messages"
  on public.support_messages for select to authenticated
  using (
    (select public.is_support_agent())
    or exists (
      select 1
      from public.support_threads as thread
      where thread.id = thread_id
        and thread.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users and support agents can send support messages" on public.support_messages;
create policy "Users and support agents can send support messages"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.support_threads as thread
      where thread.id = support_messages.thread_id
        and thread.status in ('open', 'waiting')
        and (thread.user_id = (select auth.uid()) or (select public.is_support_agent()))
        and (
          support_messages.attachment_path is null
          or support_messages.attachment_path like (select auth.uid())::text || '/' || thread.id::text || '/%'
        )
    )
  );

create or replace function public.touch_support_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_threads as thread
    set updated_at = now(),
        status = case when new.sender_id = thread.user_id then 'open' else 'waiting' end
    where thread.id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.touch_support_thread() from public, anon, authenticated;
drop trigger if exists on_support_message_created on public.support_messages;
create trigger on_support_message_created
  after insert on public.support_messages
  for each row execute function public.touch_support_thread();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their own support attachments" on storage.objects;
create policy "Users upload their own support attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users and support agents view support attachments" on storage.objects;
create policy "Users and support agents view support attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_support_agent())
    )
  );

drop policy if exists "Users delete their own support attachments" on storage.objects;
create policy "Users delete their own support attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table if not exists public.member_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  method_type text not null
    check (method_type in ('crypto', 'zelle', 'cash_app', 'moncash', 'natcash', 'pix')),
  currency text,
  provider text,
  provider_token_ref text,
  display_label text not null,
  status text not null default 'pending_setup'
    check (status in ('pending_setup', 'ready', 'disabled')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_payment_methods_one_default_idx
  on public.member_payment_methods (user_id)
  where is_default;
drop index if exists public.member_payment_methods_one_type_idx;
create unique index member_payment_methods_one_type_idx
  on public.member_payment_methods (user_id, method_type, coalesce(currency, ''))
  where status <> 'disabled';
create index if not exists member_payment_methods_user_idx
  on public.member_payment_methods (user_id, created_at);

alter table public.member_payment_methods enable row level security;
revoke all on table public.member_payment_methods from anon, authenticated;
grant select, delete on table public.member_payment_methods to authenticated;

drop policy if exists "Users can view their own payment method references" on public.member_payment_methods;
create policy "Users can view their own payment method references"
  on public.member_payment_methods for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own pending payment method preferences" on public.member_payment_methods;
create policy "Users can remove their own pending payment method preferences"
  on public.member_payment_methods for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and status = 'pending_setup'
    and provider_token_ref is null
  );

create or replace function public.add_member_payment_method_preference(
  p_method_type text,
  p_currency text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  member_country text;
  selected_currency text := upper(nullif(trim(p_currency), ''));
  new_method_id uuid;
  label text;
begin
  if caller_id is null then
    raise exception 'Sign in is required';
  end if;

  select country into member_country
    from public.profiles
    where id = caller_id;
  if member_country is null then
    raise exception 'Member profile was not found';
  end if;

  if p_method_type not in ('crypto', 'zelle', 'cash_app', 'moncash', 'natcash', 'pix') then
    raise exception 'Unsupported payment method';
  end if;
  if p_method_type = 'crypto' and selected_currency not in ('USDT', 'USDC') then
    raise exception 'Choose USDT or USDC for crypto';
  end if;
  if p_method_type <> 'crypto' and selected_currency is not null then
    raise exception 'Currency can only be set for crypto';
  end if;
  if p_method_type = 'pix' and member_country <> 'Brazil' then
    raise exception 'Pix is available only for members in Brazil';
  end if;

  select id into new_method_id
    from public.member_payment_methods
    where user_id = caller_id
      and method_type = p_method_type
      and coalesce(currency, '') = coalesce(selected_currency, '')
      and status <> 'disabled';
  if new_method_id is not null then
    return new_method_id;
  end if;

  label := case p_method_type
    when 'crypto' then 'Crypto · ' || selected_currency
    when 'cash_app' then 'Cash App'
    when 'pix' then 'Pix'
    else initcap(p_method_type)
  end;

  insert into public.member_payment_methods (
    user_id, method_type, currency, display_label, is_default
  )
  values (
    caller_id,
    p_method_type,
    selected_currency,
    label,
    not exists (
      select 1
      from public.member_payment_methods
      where user_id = caller_id and status <> 'disabled'
    )
  )
  returning id into new_method_id;

  if new_method_id is null then
    raise exception 'Could not save payment method preference';
  end if;
  return new_method_id;
end;
$$;

revoke all on function public.add_member_payment_method_preference(text, text) from public, anon;
grant execute on function public.add_member_payment_method_preference(text, text) to authenticated;

create or replace function public.handle_signup_payment_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preference jsonb;
  selected_method text;
  selected_currency text;
  member_country text;
begin
  select country into member_country
    from public.profiles
    where id = new.id;

  for preference in
    select value
    from jsonb_array_elements(
      coalesce(new.raw_user_meta_data -> 'payment_preferences', '[]'::jsonb)
    )
  loop
    selected_method := preference ->> 'method_type';
    selected_currency := upper(nullif(trim(preference ->> 'currency'), ''));

    if selected_method not in ('crypto', 'zelle', 'cash_app', 'moncash', 'natcash', 'pix') then
      raise exception 'Unsupported signup payment method';
    end if;
    if selected_method = 'crypto' and selected_currency not in ('USDT', 'USDC') then
      raise exception 'Choose USDT or USDC for crypto';
    end if;
    if selected_method <> 'crypto' and selected_currency is not null then
      raise exception 'Currency can only be set for crypto';
    end if;
    if selected_method = 'pix' and member_country <> 'Brazil' then
      raise exception 'Pix is available only for members in Brazil';
    end if;

    insert into public.member_payment_methods (
      user_id, method_type, currency, display_label, is_default
    )
    values (
      new.id,
      selected_method,
      selected_currency,
      case selected_method
        when 'crypto' then 'Crypto · ' || selected_currency
        when 'cash_app' then 'Cash App'
        when 'pix' then 'Pix'
        else initcap(selected_method)
      end,
      not exists (
        select 1
        from public.member_payment_methods
        where user_id = new.id and status <> 'disabled'
      )
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function public.handle_signup_payment_preferences() from public, anon, authenticated;
drop trigger if exists save_signup_payment_preferences on auth.users;
create trigger save_signup_payment_preferences
  after insert on auth.users
  for each row execute function public.handle_signup_payment_preferences();

create or replace function public.restore_default_payment_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    update public.member_payment_methods
      set is_default = false
      where user_id = old.user_id;
    update public.member_payment_methods
      set is_default = true
      where id = (
        select method.id
        from public.member_payment_methods as method
        where method.user_id = old.user_id and method.status <> 'disabled'
        order by method.created_at
        limit 1
      );
  end if;
  return old;
end;
$$;

revoke all on function public.restore_default_payment_method() from public, anon, authenticated;
drop trigger if exists restore_default_payment_method on public.member_payment_methods;
create trigger restore_default_payment_method
  after delete on public.member_payment_methods
  for each row execute function public.restore_default_payment_method();

create or replace function public.disable_pix_when_country_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.country <> 'Brazil' then
    update public.member_payment_methods
      set status = 'disabled', is_default = false, updated_at = now()
      where user_id = new.id and method_type = 'pix' and status <> 'disabled';

    if not exists (
      select 1
      from public.member_payment_methods
      where user_id = new.id and is_default
    ) then
      update public.member_payment_methods
        set is_default = true
        where id = (
          select method.id
          from public.member_payment_methods as method
          where method.user_id = new.id and method.status <> 'disabled'
          order by method.created_at
          limit 1
        );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.disable_pix_when_country_changes() from public, anon, authenticated;
drop trigger if exists disable_pix_when_country_changes on public.profiles;
create trigger disable_pix_when_country_changes
  after update of country on public.profiles
  for each row
  when (old.country is distinct from new.country)
  execute function public.disable_pix_when_country_changes();

grant all on table public.member_payment_methods to service_role;

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  provider text not null,
  provider_reference text,
  purpose text not null check (purpose in ('gift', 'membership', 'refund')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'created'
    check (status in ('created', 'requires_action', 'succeeded', 'failed', 'cancelled', 'refunded')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_user_created_idx
  on public.payment_intents (user_id, created_at desc);

alter table public.payment_intents enable row level security;
revoke all on table public.payment_intents from anon, authenticated;
grant select on table public.payment_intents to authenticated;

drop policy if exists "Users can view their own payment intents" on public.payment_intents;
create policy "Users can view their own payment intents"
  on public.payment_intents for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.payment_provider_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payment_intent_id uuid references public.payment_intents (id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.payment_provider_events enable row level security;
revoke all on table public.payment_provider_events from anon, authenticated;
grant all on table public.payment_intents, public.payment_provider_events to service_role;

create or replace function public.member_workflows_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    to_regclass('public.profile_contacts') is not null
    and to_regclass('public.support_threads') is not null
    and to_regclass('public.support_messages') is not null
    and to_regclass('public.member_payment_methods') is not null
    and to_regclass('public.payment_intents') is not null
    and exists (
      select 1
      from storage.buckets as bucket
      where bucket.id = 'support-attachments' and bucket.public is false
    )
    and to_regprocedure('public.my_referral_stats()') is not null
    and to_regprocedure('public.my_referrals()') is not null
    and to_regprocedure('public.public_leaderboard()') is not null;
$$;

revoke all on function public.member_workflows_ready() from public;
grant execute on function public.member_workflows_ready() to anon, authenticated;
