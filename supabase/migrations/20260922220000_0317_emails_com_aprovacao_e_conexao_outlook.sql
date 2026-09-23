-- Conta de envio por pessoa. O token nunca é servido pelo PostgREST ao usuário.
create table if not exists public.commercial_email_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connected_by_user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  identity_key text not null,
  account_email text not null,
  account_name text,
  send_as_email text,
  refresh_token_encrypted bytea not null,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'reauthorize')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, connected_by_user_id, identity_key)
);

create table if not exists public.commercial_email_oauth_nonces (
  nonce text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- O gatilho cria uma sugestão; somente a rota de aprovação pode enviá-la.
create table if not exists public.commercial_email_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  event_id uuid not null,
  action_key uuid not null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  proposal_id uuid references public.commercial_proposals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  to_email text not null,
  subject text not null,
  body_text text not null,
  source text not null check (source in ('template', 'ai')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'submitted', 'rejected', 'needs_review')),
  connection_id uuid references public.commercial_email_connections(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  submitted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(to_email)) > 2),
  check (length(btrim(subject)) > 0),
  check (length(btrim(body_text)) > 0)
);

create unique index if not exists commercial_email_drafts_event_action_unique
  on public.commercial_email_drafts (organization_id, event_id, action_key);
create index if not exists commercial_email_drafts_org_status_created
  on public.commercial_email_drafts (organization_id, status, created_at desc);
create index if not exists commercial_email_drafts_org_lead
  on public.commercial_email_drafts (organization_id, lead_id, created_at desc)
  where lead_id is not null;

drop trigger if exists trg_commercial_email_connections_updated_at on public.commercial_email_connections;
create trigger trg_commercial_email_connections_updated_at
  before update on public.commercial_email_connections
  for each row execute function public.fn_set_updated_at();
drop trigger if exists trg_commercial_email_drafts_updated_at on public.commercial_email_drafts;
create trigger trg_commercial_email_drafts_updated_at
  before update on public.commercial_email_drafts
  for each row execute function public.fn_set_updated_at();

alter table public.commercial_email_connections enable row level security;
alter table public.commercial_email_oauth_nonces enable row level security;
alter table public.commercial_email_drafts enable row level security;

-- As três tabelas só são lidas/escritas por rotas autenticadas com filtro de org.
-- Nem um SELECT direto deve expor tokens, destinatários ou conteúdo ao cliente.
revoke all on table public.commercial_email_connections from public, anon, authenticated;
revoke all on table public.commercial_email_oauth_nonces from public, anon, authenticated;
revoke all on table public.commercial_email_drafts from public, anon, authenticated;
grant all on table public.commercial_email_connections to service_role;
grant all on table public.commercial_email_oauth_nonces to service_role;
grant all on table public.commercial_email_drafts to service_role;

notify pgrst, 'reload schema';
