create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  first_name text not null,
  last_name text not null,
  country text not null,
  referral_code text not null unique,
  referred_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_country_not_empty check (length(trim(country)) > 0),
  constraint profiles_names_not_empty check (
    length(trim(first_name)) > 0 and length(trim(last_name)) > 0
  )
);

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by);

create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  age_confirmed boolean not null check (age_confirmed),
  gift_risk_acknowledged boolean not null check (gift_risk_acknowledged),
  terms_accepted boolean not null check (terms_accepted),
  accepted_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_id_idx
  on public.legal_acceptances (user_id, accepted_at desc);

alter table public.profiles enable row level security;
alter table public.legal_acceptances enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (first_name, last_name, country) on table public.profiles to authenticated;

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own private profile fields" on public.profiles;
create policy "Users can update their own private profile fields"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can view their own legal acceptances" on public.legal_acceptances;
create policy "Users can view their own legal acceptances"
  on public.legal_acceptances for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_profile_id uuid := new.id;
  new_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  new_first_name text := trim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
  new_last_name text := trim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));
  new_country text := trim(coalesce(new.raw_user_meta_data ->> 'country', ''));
  entered_referral_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  referring_profile_id uuid;
  new_referral_code text;
  legal_data jsonb := coalesce(new.raw_user_meta_data -> 'legal_acceptance', '{}'::jsonb);
begin
  if legal_data ->> 'age_confirmed' is distinct from 'true'
     or legal_data ->> 'gift_risk_acknowledged' is distinct from 'true'
     or legal_data ->> 'terms_accepted' is distinct from 'true' then
    raise exception 'Required legal acknowledgements are missing';
  end if;

  if entered_referral_code <> '' then
    select p.id
      into referring_profile_id
      from public.profiles as p
      where p.referral_code = entered_referral_code;

    if referring_profile_id is null then
      raise exception 'Referral code is invalid';
    end if;
  end if;

  loop
    new_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.profiles as p where p.referral_code = new_referral_code
    );
  end loop;

  insert into public.profiles (
    id, username, first_name, last_name, country, referral_code, referred_by
  ) values (
    new_profile_id,
    new_username,
    new_first_name,
    new_last_name,
    new_country,
    new_referral_code,
    referring_profile_id
  );

  insert into public.legal_acceptances (
    user_id,
    terms_version,
    privacy_version,
    age_confirmed,
    gift_risk_acknowledged,
    terms_accepted
  ) values (
    new_profile_id,
    '2026-11-v1',
    '2026-11-v1',
    true,
    true,
    true
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_referral_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.profiles as p
    where p.referred_by = (select auth.uid());
$$;

revoke all on function public.my_referral_count() from public, anon;
grant execute on function public.my_referral_count() to authenticated;
