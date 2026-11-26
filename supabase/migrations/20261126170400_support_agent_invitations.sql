create table if not exists public.support_agent_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists support_agent_invitations_pending_email_idx
  on public.support_agent_invitations (email)
  where status = 'pending';

alter table public.support_agent_invitations enable row level security;
revoke all on table public.support_agent_invitations from public, anon, authenticated;
grant all on table public.support_agent_invitations to service_role;
