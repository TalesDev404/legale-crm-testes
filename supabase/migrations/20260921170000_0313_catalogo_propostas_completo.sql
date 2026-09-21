alter table public.proposal_catalog_items
  add column if not exists unidade text not null default 'unidade',
  add column if not exists faixas_preco jsonb not null default '[]'::jsonb;

alter table public.proposal_catalog_items
  drop constraint if exists proposal_catalog_items_categoria_check;
alter table public.proposal_catalog_items
  add constraint proposal_catalog_items_categoria_check
  check (categoria in ('modulo', 'usuario', 'servico', 'migracao'));

alter table public.proposal_catalog_items
  drop constraint if exists proposal_catalog_items_faixas_preco_check;
alter table public.proposal_catalog_items
  add constraint proposal_catalog_items_faixas_preco_check
  check (jsonb_typeof(faixas_preco) = 'array');

update public.proposal_catalog_items set unidade = 'usuário'
where categoria = 'usuario' and unidade = 'unidade';
update public.proposal_catalog_items set unidade = 'módulo'
where categoria = 'modulo' and unidade = 'unidade';

insert into public.proposal_catalog_items
  (organization_id, codigo, nome, descricao, categoria, cobranca, preco_escritorio_cents, preco_departamento_cents, setup_cents, unidade, faixas_preco, ativo, ordem)
select id, 'usuarios_limitados', 'Usuários limitados', 'Acessos para consulta e operação conforme as permissões contratadas.', 'usuario', 'mensal', 4200, 4200, 0, 'usuário',
  '[{"quantidade_minima":1,"preco_escritorio_cents":4200,"preco_departamento_cents":4200},{"quantidade_minima":11,"preco_escritorio_cents":2800,"preco_departamento_cents":2800},{"quantidade_minima":31,"preco_escritorio_cents":1800,"preco_departamento_cents":1800},{"quantidade_minima":76,"preco_escritorio_cents":1500,"preco_departamento_cents":1500},{"quantidade_minima":101,"preco_escritorio_cents":1000,"preco_departamento_cents":1000}]'::jsonb,
  true, 140
from public.organizations
on conflict (organization_id, codigo) do nothing;

insert into public.proposal_catalog_items
  (organization_id, codigo, nome, descricao, categoria, cobranca, preco_escritorio_cents, preco_departamento_cents, setup_cents, unidade, faixas_preco, ativo, ordem)
select id, 'monitoramento_processos', 'Monitoramento de processos', 'Acompanhamento de movimentações e geração de alertas.', 'servico', 'mensal', 85, 85, 0, 'processo',
  '[{"quantidade_minima":100,"preco_escritorio_cents":85,"preco_departamento_cents":85},{"quantidade_minima":1000,"preco_escritorio_cents":75,"preco_departamento_cents":75},{"quantidade_minima":10000,"preco_escritorio_cents":65,"preco_departamento_cents":65},{"quantidade_minima":20001,"preco_escritorio_cents":55,"preco_departamento_cents":55}]'::jsonb,
  true, 200
from public.organizations
on conflict (organization_id, codigo) do nothing;

notify pgrst, 'reload schema';
