-- CHANCE DE FECHAMENTO POR ETAPA E FINALIDADE DO CONTATO NA EMPRESA.
--
-- `crm_stages.win_probability` (0–100) é a chance de um negócio parado naquela
-- etapa virar contrato. É o que transforma "R$ X em negociação" em pipeline
-- PONDERADO no painel: um negócio de R$ 5 mil em "Novo lead" (10%) não pesa o
-- mesmo que um de R$ 5 mil em "Negociação" (75%). Nula = etapa sem chance
-- definida, e o painel a trata como 0 em vez de inventar.
--
-- `contacts.account_roles` diz para que serve cada pessoa DENTRO da empresa:
-- quem decide, quem assina, quem cuida do financeiro/NF, quem é o usuário-chave
-- do sistema, quem é o contato de TI. A planilha só tinha "nome do contato", e
-- o CS liga para a pessoa errada quando precisa de assinatura ou de boleto.
-- Vocabulário fechado espelhado em `lib/schemas/empresas.ts` (FINALIDADES).

alter table public.crm_stages
  add column if not exists win_probability smallint
    check (win_probability is null or win_probability between 0 and 100);

alter table public.contacts
  add column if not exists account_roles text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contacts'::regclass and conname = 'contacts_account_roles_check'
  ) then
    alter table public.contacts
      add constraint contacts_account_roles_check
      check (account_roles <@ array['decisor', 'signatario', 'financeiro', 'usuario_chave', 'ti']::text[]);
  end if;
end $$;
