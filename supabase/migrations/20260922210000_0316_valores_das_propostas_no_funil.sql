-- Mensalidade e valor único são somados separadamente por card. O valor manual
-- é preservado para voltar a aparecer quando o último vínculo for removido.
alter table public.crm_leads
  add column if not exists proposal_monthly_cents bigint,
  add column if not exists proposal_activation_cents bigint;

do $f$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_leads'::regclass
      and conname = 'crm_leads_proposal_monthly_cents_nonnegative'
  ) then
    alter table public.crm_leads
      add constraint crm_leads_proposal_monthly_cents_nonnegative
      check (proposal_monthly_cents >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.crm_leads'::regclass
      and conname = 'crm_leads_proposal_activation_cents_nonnegative'
  ) then
    alter table public.crm_leads
      add constraint crm_leads_proposal_activation_cents_nonnegative
      check (proposal_activation_cents >= 0);
  end if;
end $f$;

create or replace function private.fn_atualizar_valores_das_propostas_do_card(
  p_organization_id uuid, p_lead_id uuid
) returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $f$
declare mensal bigint; unico bigint;
begin
  if p_lead_id is null then return; end if;
  if auth.uid() is not null
     and not (public.fn_is_platform_admin() or public.fn_role_at_least(p_organization_id, 'agent'))
  then
    raise exception 'Apenas agentes podem alterar o valor derivado das propostas.';
  end if;

  -- Serializa dois vínculos concorrentes para que a última escrita veja ambos.
  perform 1 from public.crm_leads
   where organization_id = p_organization_id and id = p_lead_id
   for no key update;

  select sum(monthly_total_cents)::bigint, sum(activation_total_cents)::bigint
    into mensal, unico
    from public.commercial_proposals
   where organization_id = p_organization_id and lead_id = p_lead_id;

  update public.crm_leads
     set proposal_monthly_cents = mensal,
         proposal_activation_cents = unico
   where organization_id = p_organization_id
     and id = p_lead_id
     and (proposal_monthly_cents is distinct from mensal
          or proposal_activation_cents is distinct from unico);
end $f$;

create or replace function private.fn_sincronizar_valores_das_propostas()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $f$
begin
  if tg_op = 'INSERT' then
    perform private.fn_atualizar_valores_das_propostas_do_card(new.organization_id, new.lead_id);
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform private.fn_atualizar_valores_das_propostas_do_card(old.organization_id, old.lead_id);
    return old;
  end if;

  -- Nos movimentos entre cards, trave sempre na mesma ordem.
  if old.lead_id is distinct from new.lead_id then
    if new.lead_id is null or (old.lead_id is not null and old.lead_id < new.lead_id) then
      perform private.fn_atualizar_valores_das_propostas_do_card(old.organization_id, old.lead_id);
      perform private.fn_atualizar_valores_das_propostas_do_card(new.organization_id, new.lead_id);
    else
      perform private.fn_atualizar_valores_das_propostas_do_card(new.organization_id, new.lead_id);
      perform private.fn_atualizar_valores_das_propostas_do_card(old.organization_id, old.lead_id);
    end if;
  elsif old.monthly_total_cents is distinct from new.monthly_total_cents
        or old.activation_total_cents is distinct from new.activation_total_cents then
    perform private.fn_atualizar_valores_das_propostas_do_card(new.organization_id, new.lead_id);
  end if;
  return new;
end $f$;

revoke all on function private.fn_atualizar_valores_das_propostas_do_card(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.fn_sincronizar_valores_das_propostas()
  from public, anon, authenticated;

drop trigger if exists trg_commercial_proposals_totals
  on public.commercial_proposals;
create trigger trg_commercial_proposals_totals
  after insert or update of lead_id, monthly_total_cents, activation_total_cents or delete
  on public.commercial_proposals
  for each row execute function private.fn_sincronizar_valores_das_propostas();

-- Reflete propostas já vinculadas antes desta migração.
update public.crm_leads as lead
   set proposal_monthly_cents = totals.mensal,
       proposal_activation_cents = totals.unico
  from (
    select organization_id, lead_id,
           sum(monthly_total_cents)::bigint as mensal,
           sum(activation_total_cents)::bigint as unico
      from public.commercial_proposals
     where lead_id is not null
     group by organization_id, lead_id
  ) as totals
 where lead.organization_id = totals.organization_id
   and lead.id = totals.lead_id
   and (lead.proposal_monthly_cents is distinct from totals.mensal
        or lead.proposal_activation_cents is distinct from totals.unico);

notify pgrst, 'reload schema';
