create table if not exists public.proposal_catalog_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo text not null, nome text not null, descricao text not null default '', categoria text not null check (categoria in ('modulo','usuario','servico')),
  cobranca text not null default 'mensal' check (cobranca in ('mensal','unica')), preco_escritorio_cents bigint not null default 0 check (preco_escritorio_cents>=0),
  preco_departamento_cents bigint not null default 0 check (preco_departamento_cents>=0), setup_cents bigint not null default 0 check (setup_cents>=0),
  ativo boolean not null default true, ordem integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,codigo)
);
drop trigger if exists trg_proposal_catalog_items_updated_at on public.proposal_catalog_items;
create trigger trg_proposal_catalog_items_updated_at before update on public.proposal_catalog_items for each row execute function public.fn_set_updated_at();
alter table public.proposal_catalog_items enable row level security;
drop policy if exists proposal_catalog_items_select on public.proposal_catalog_items;
create policy proposal_catalog_items_select on public.proposal_catalog_items for select using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
drop policy if exists proposal_catalog_items_write on public.proposal_catalog_items;
create policy proposal_catalog_items_write on public.proposal_catalog_items for all using (public.fn_role_at_least(organization_id,'admin') or public.fn_is_platform_admin()) with check (public.fn_role_at_least(organization_id,'admin') or public.fn_is_platform_admin());
revoke all on public.proposal_catalog_items from anon,authenticated,service_role; grant select,insert,update,delete on public.proposal_catalog_items to authenticated; grant all on public.proposal_catalog_items to service_role;
do $f$ begin perform public.fn_aplicar_travas_de_suporte(); end $f$;
notify pgrst,'reload schema';
