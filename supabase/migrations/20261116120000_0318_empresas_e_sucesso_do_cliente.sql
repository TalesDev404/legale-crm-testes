-- A EMPRESA É A FICHA ÚNICA DO LEGALE.
--
-- Até aqui o CRM conhecia pessoas (`contacts`) e negócios (`crm_leads`), mas o
-- Legale vende para escritórios e departamentos jurídicos: quem assina, quem
-- usa e quem paga são pessoas diferentes da mesma empresa, e o cliente é
-- reconhecido pelo código W do sistema. `customer_accounts` é essa empresa — o
-- lugar onde o comercial e o Sucesso do Cliente leem a mesma história.
--
-- O ciclo de vida (`lifecycle`) segue a empresa do primeiro contato ao
-- cancelamento. Os campos de CS (pagamentos, contrato, renovação, frequência
-- de acompanhamento) vieram da planilha "Controle de CRM e CS" e ficam aqui até
-- existir integração com o financeiro do Legale.
--
-- `name_key` é o nome normalizado (sem acento, caixa, "Advogados", "Ltda"...).
-- NÃO é único: dois escritórios diferentes podem normalizar igual. Serve para
-- a tela apontar possível duplicidade antes de alguém criar outra ficha.
create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) >= 2),
  name_key text not null,
  legal_name text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  legale_code text check (legale_code is null or legale_code ~ '^W[0-9]{1,6}$'),
  client_kind text check (client_kind is null or client_kind in ('escritorio', 'departamento_juridico')),
  lifecycle text not null default 'prospect'
    check (lifecycle in ('prospect', 'onboarding', 'cliente', 'ex_cliente')),
  source text,
  commercial_owner_user_id uuid references auth.users(id) on delete set null,
  cs_owner_user_id uuid references auth.users(id) on delete set null,
  phone text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  customer_since date,
  renewal_date date,
  follow_up_every_days integer check (follow_up_every_days is null or follow_up_every_days between 1 and 365),
  next_follow_up_on date,
  contract_signed boolean not null default false,
  pays_legale boolean not null default false,
  pays_bi boolean not null default false,
  pays_monitoring boolean not null default false,
  contracted_modules text[] not null default '{}'::text[],
  monthly_revenue_cents bigint check (monthly_revenue_cents is null or monthly_revenue_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  health_override text check (health_override is null or health_override in ('saudavel', 'atencao', 'em_risco', 'churn')),
  health_override_reason text,
  health_override_at timestamptz,
  health_override_by_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_accounts_health_override_reason
    check (health_override is null or length(btrim(coalesce(health_override_reason, ''))) >= 3)
);

create unique index if not exists customer_accounts_org_id_id_unique
  on public.customer_accounts (organization_id, id);
create unique index if not exists customer_accounts_org_legale_code_unique
  on public.customer_accounts (organization_id, legale_code)
  where legale_code is not null;
create index if not exists customer_accounts_org_name_key_idx
  on public.customer_accounts (organization_id, name_key);
create index if not exists customer_accounts_org_lifecycle_idx
  on public.customer_accounts (organization_id, lifecycle, updated_at desc);
create index if not exists customer_accounts_org_follow_up_idx
  on public.customer_accounts (organization_id, next_follow_up_on)
  where next_follow_up_on is not null;

drop trigger if exists trg_customer_accounts_updated_at on public.customer_accounts;
create trigger trg_customer_accounts_updated_at
  before update on public.customer_accounts
  for each row execute function public.fn_set_updated_at();

-- O HISTÓRICO DE CONTATO DA EMPRESA (as abas "Histórico CRM" e "Histórico CS").
-- `crm_lead_activities` continua sendo a linha do tempo do NEGÓCIO; esta é a da
-- EMPRESA, que existe antes do primeiro negócio e depois do último. A ficha
-- mostra as duas juntas. `external_id` deduplica o que vier do Outlook ou de
-- importação de planilha.
create table if not exists public.customer_account_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null,
  lead_id uuid,
  team text not null check (team in ('comercial', 'cs')),
  channel text not null
    check (channel in ('email', 'whatsapp', 'ligacao', 'reuniao', 'apresentacao', 'visita', 'outro')),
  summary text not null check (length(btrim(summary)) >= 2),
  performed_at timestamptz not null default now(),
  performed_by_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'planilha', 'outlook', 'automacao')),
  external_id text,
  created_at timestamptz not null default now(),
  constraint customer_account_activities_org_account_fkey
    foreign key (organization_id, account_id)
    references public.customer_accounts (organization_id, id) on delete cascade
);

create unique index if not exists customer_account_activities_org_external_unique
  on public.customer_account_activities (organization_id, external_id)
  where external_id is not null;
create index if not exists customer_account_activities_org_account_idx
  on public.customer_account_activities (organization_id, account_id, performed_at desc);
create index if not exists customer_account_activities_org_performed_idx
  on public.customer_account_activities (organization_id, team, performed_at desc);

-- A ÁREA DE QUEM TRABALHA NA ORGANIZAÇÃO (Comercial, CS, Diretoria).
-- Não substitui o papel (`user_organizations.role`), que continua decidindo o
-- que a pessoa PODE fazer; a área decide o que a tela MOSTRA primeiro e de
-- quem é a carteira. Uma pessoa pode estar em mais de uma área.
create table if not exists public.organization_member_areas (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null check (area in ('comercial', 'cs', 'diretoria')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, area)
);

-- Vínculos da empresa com o que já existia. Chave composta com a organização,
-- como em 0315, para um vínculo nunca atravessar tenants.
alter table public.crm_leads add column if not exists account_id uuid;
alter table public.contacts add column if not exists account_id uuid;
alter table public.commercial_proposals add column if not exists account_id uuid;
alter table public.crm_tasks add column if not exists account_id uuid;

do $f$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_leads'::regclass and conname = 'crm_leads_org_account_fkey'
  ) then
    alter table public.crm_leads
      add constraint crm_leads_org_account_fkey
      foreign key (organization_id, account_id)
      references public.customer_accounts (organization_id, id)
      on delete set null (account_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contacts'::regclass and conname = 'contacts_org_account_fkey'
  ) then
    alter table public.contacts
      add constraint contacts_org_account_fkey
      foreign key (organization_id, account_id)
      references public.customer_accounts (organization_id, id)
      on delete set null (account_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commercial_proposals'::regclass and conname = 'commercial_proposals_org_account_fkey'
  ) then
    alter table public.commercial_proposals
      add constraint commercial_proposals_org_account_fkey
      foreign key (organization_id, account_id)
      references public.customer_accounts (organization_id, id)
      on delete set null (account_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_tasks'::regclass and conname = 'crm_tasks_org_account_fkey'
  ) then
    alter table public.crm_tasks
      add constraint crm_tasks_org_account_fkey
      foreign key (organization_id, account_id)
      references public.customer_accounts (organization_id, id)
      on delete set null (account_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_account_activities'::regclass
      and conname = 'customer_account_activities_org_lead_fkey'
  ) then
    alter table public.customer_account_activities
      add constraint customer_account_activities_org_lead_fkey
      foreign key (organization_id, lead_id)
      references public.crm_leads (organization_id, id)
      on delete set null (lead_id);
  end if;
end $f$;

create index if not exists crm_leads_org_account_idx
  on public.crm_leads (organization_id, account_id) where account_id is not null;
create index if not exists contacts_org_account_idx
  on public.contacts (organization_id, account_id) where account_id is not null;
create index if not exists commercial_proposals_org_account_idx
  on public.commercial_proposals (organization_id, account_id) where account_id is not null;
create index if not exists crm_tasks_org_account_idx
  on public.crm_tasks (organization_id, account_id) where account_id is not null;

alter table public.customer_accounts enable row level security;
alter table public.customer_account_activities enable row level security;
alter table public.organization_member_areas enable row level security;

drop policy if exists tenant_isolation_customer_accounts_all on public.customer_accounts;
create policy tenant_isolation_customer_accounts_all on public.customer_accounts
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists tenant_isolation_customer_account_activities_all on public.customer_account_activities;
create policy tenant_isolation_customer_account_activities_all on public.customer_account_activities
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

-- Áreas: todo membro LÊ; quem grava é a server action, depois de conferir que
-- o ator é admin da organização (service role). Sem policy de escrita para
-- `authenticated`, um agente não se promove a Diretoria pela REST.
drop policy if exists tenant_isolation_organization_member_areas_all on public.organization_member_areas;
drop policy if exists tenant_isolation_organization_member_areas_select on public.organization_member_areas;
create policy tenant_isolation_organization_member_areas_select on public.organization_member_areas
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

revoke all on table public.customer_accounts from public, anon, authenticated, service_role;
revoke all on table public.customer_account_activities from public, anon, authenticated, service_role;
revoke all on table public.organization_member_areas from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.customer_accounts to authenticated;
grant select, insert, update, delete on table public.customer_account_activities to authenticated;
grant select on table public.organization_member_areas to authenticated;
grant all on table public.customer_accounts to service_role;
grant all on table public.customer_account_activities to service_role;
grant all on table public.organization_member_areas to service_role;

do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;

notify pgrst, 'reload schema';
