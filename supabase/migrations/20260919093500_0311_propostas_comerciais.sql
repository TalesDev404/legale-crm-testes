-- Propostas comerciais são documentos-versionados: `items` guarda o retrato
-- validado no momento da criação, para uma mudança futura de preço não reescrever
-- uma proposta já enviada. A API é a única escritora e valida o schema do JSON.
create table if not exists public.commercial_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  client_name text not null check (length(btrim(client_name)) >= 2),
  client_kind text not null check (client_kind in ('escritorio', 'departamento_juridico')),
  recipient_name text,
  recipient_email text,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aprovada', 'recusada', 'expirada')),
  issue_date date not null default current_date,
  valid_until date not null,
  version integer not null default 1 check (version > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  monthly_total_cents bigint not null default 0 check (monthly_total_cents >= 0),
  activation_total_cents bigint not null default 0 check (activation_total_cents >= 0),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  notes text,
  payment_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until >= issue_date)
);

create index if not exists idx_commercial_proposals_org_updated
  on public.commercial_proposals (organization_id, updated_at desc);
create index if not exists idx_commercial_proposals_org_contact
  on public.commercial_proposals (organization_id, contact_id)
  where contact_id is not null;

drop trigger if exists trg_commercial_proposals_updated_at on public.commercial_proposals;
create trigger trg_commercial_proposals_updated_at
  before update on public.commercial_proposals
  for each row execute function public.fn_set_updated_at();

alter table public.commercial_proposals enable row level security;
drop policy if exists tenant_isolation_commercial_proposals_all on public.commercial_proposals;
create policy tenant_isolation_commercial_proposals_all on public.commercial_proposals
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

revoke all on table public.commercial_proposals from anon, authenticated, service_role;
grant select, insert, update, delete on table public.commercial_proposals to authenticated;
grant all on table public.commercial_proposals to service_role;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
