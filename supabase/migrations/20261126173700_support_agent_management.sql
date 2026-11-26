create table if not exists public.support_agents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.support_agents enable row level security;
revoke all on table public.support_agents from public, anon, authenticated;
grant all on table public.support_agents to service_role;

insert into public.support_agents (user_id)
select users.id
from auth.users as users
where users.raw_app_meta_data -> 'support_agent' = 'true'::jsonb
on conflict (user_id) do nothing;

create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.support_agents as agent
    where agent.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_support_agent() from public, anon;
grant execute on function public.is_support_agent() to authenticated;

create or replace function public.support_agent_management_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    to_regclass('public.support_agents') is not null
    and to_regclass('public.support_agent_invitations') is not null;
$$;

revoke all on function public.support_agent_management_ready() from public;
grant execute on function public.support_agent_management_ready() to anon, authenticated;

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
    and to_regclass('public.support_agent_invitations') is not null
    and to_regclass('public.support_agents') is not null
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
