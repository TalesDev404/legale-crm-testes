-- Uma proposta pertence opcionalmente a um negócio do funil; uma tarefa pode
-- apontar para uma proposta específica. Os vínculos preservam organization_id
-- no próprio FK, pois usuários podem participar de mais de uma organização.
create unique index if not exists crm_leads_org_id_id_unique
  on public.crm_leads (organization_id, id);
create unique index if not exists commercial_proposals_org_id_id_unique
  on public.commercial_proposals (organization_id, id);

alter table public.commercial_proposals
  add column if not exists lead_id uuid;
alter table public.crm_tasks
  add column if not exists proposal_id uuid;

do $f$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.commercial_proposals'::regclass
      and conname = 'commercial_proposals_org_lead_fkey'
  ) then
    alter table public.commercial_proposals
      add constraint commercial_proposals_org_lead_fkey
      foreign key (organization_id, lead_id)
      references public.crm_leads (organization_id, id)
      on delete set null (lead_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_tasks'::regclass
      and conname = 'crm_tasks_org_proposal_fkey'
  ) then
    alter table public.crm_tasks
      add constraint crm_tasks_org_proposal_fkey
      foreign key (organization_id, proposal_id)
      references public.commercial_proposals (organization_id, id)
      on delete set null (proposal_id);
  end if;
end $f$;

create index if not exists commercial_proposals_org_lead_idx
  on public.commercial_proposals (organization_id, lead_id)
  where lead_id is not null;
create index if not exists crm_tasks_org_proposal_idx
  on public.crm_tasks (organization_id, proposal_id)
  where proposal_id is not null;

-- Quando o comercial mover uma proposta para outro card, as tarefas ligadas
-- seguem o mesmo negócio. A atualização acontece na mesma transação.
create or replace function public.fn_sincronizar_negocio_das_tarefas_da_proposta()
returns trigger language plpgsql as $f$
begin
  update public.crm_tasks
     set lead_id = new.lead_id
   where organization_id = new.organization_id
     and proposal_id = new.id
     and lead_id is distinct from new.lead_id;
  return new;
end $f$;

drop trigger if exists trg_sincronizar_negocio_das_tarefas_da_proposta
  on public.commercial_proposals;
create trigger trg_sincronizar_negocio_das_tarefas_da_proposta
  after update of lead_id on public.commercial_proposals
  for each row when (old.lead_id is distinct from new.lead_id)
  execute function public.fn_sincronizar_negocio_das_tarefas_da_proposta();

notify pgrst, 'reload schema';
