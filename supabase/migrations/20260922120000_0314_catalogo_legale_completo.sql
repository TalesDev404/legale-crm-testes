alter table public.proposal_catalog_items
  add column if not exists opcoes_preco jsonb not null default '[]'::jsonb,
  add column if not exists minimo_opcoes integer not null default 0;

alter table public.proposal_catalog_items
  drop constraint if exists proposal_catalog_items_opcoes_preco_check;
alter table public.proposal_catalog_items
  add constraint proposal_catalog_items_opcoes_preco_check
  check (jsonb_typeof(opcoes_preco) = 'array');

alter table public.proposal_catalog_items
  drop constraint if exists proposal_catalog_items_minimo_opcoes_check;
alter table public.proposal_catalog_items
  add constraint proposal_catalog_items_minimo_opcoes_check
  check (minimo_opcoes between 0 and 40);

with catalogo(codigo, nome, descricao, categoria, cobranca, preco_escritorio_cents,
  preco_departamento_cents, setup_cents, unidade, faixas_preco, opcoes_preco,
  minimo_opcoes, ativo, ordem) as (
  values
    ('gestao_processos', 'Gestão de Processo', 'Organiza processos, prazos, movimentações e alertas.', 'modulo', 'mensal', 14225, 14225, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, true, 10),
    ('publicacoes', 'Gestão de Publicação', 'Captura e organiza publicações para a equipe jurídica.', 'modulo', 'mensal', 14225, 14225, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, true, 20),
    ('similaridade_publicacoes', 'Gestão de Similaridade entre Publicações', 'Identifica publicações semelhantes e ajuda a reduzir tratamentos repetidos.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 30),
    ('api_legale', 'API Legale', 'Libera integrações por contexto contratado.', 'modulo', 'mensal', 0, 0, 0, 'contexto', '[]'::jsonb, '[]'::jsonb, 1, false, 40),
    ('gestao_extrajudicial', 'Gestão Extrajudicial', 'Organiza demandas e atividades extrajudiciais.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 50),
    ('gestao_tempo', 'Gestão de Tempo (Time Sheet)', 'Registra e acompanha o tempo dedicado às atividades.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 60),
    ('gestao_financeira', 'Gestão Financeira', 'Acompanha receitas, despesas e informações financeiras da operação.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 70),
    ('modulo_negocial', 'Gestão Módulo Negocial', 'Organiza oportunidades e rotinas negociais.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 80),
    ('automacao_guias', 'Automação de Pagamento de Guias', 'Automatiza o fluxo de pagamento e controle de guias.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 90),
    ('legal_analytics', 'Legale Analytics', 'Indicadores para acompanhar a operação e apoiar decisões.', 'modulo', 'mensal', 19990, 19990, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, true, 100),
    ('contratos', 'Gestão de Contratos', 'Centraliza contratos, vencimentos, responsáveis e documentos.', 'modulo', 'mensal', 12800, 12800, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, true, 110),
    ('assinatura_digital', 'Integração e Gestão de Assinatura Digital por Operadora', 'Gerencia fluxos de assinatura integrados à operadora contratada.', 'modulo', 'mensal', 4225, 4225, 120000, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, true, 120),
    ('recursos_humanos', 'Gestão de Recursos Humanos', 'Centraliza rotinas e informações de recursos humanos.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 130),
    ('quadro_avisos', 'Gestão de Quadro de Avisos e Comunicação', 'Publica avisos e comunicações internas para a equipe.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 140),
    ('portal_curriculos', 'Gestão Portal de Currículos', 'Organiza a captação e a gestão de currículos.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 150),
    ('tv_legale', 'TV Legale', 'Exibe informações e painéis da operação em pontos físicos.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 160),
    ('tv_legale_ponto_fisico', 'TV Legale — Ponto físico', 'Ponto físico utilizado para exibição da TV Legale.', 'servico', 'mensal', 0, 0, 0, 'ponto', '[{"quantidade_minima":1,"preco_escritorio_cents":0,"preco_departamento_cents":0}]'::jsonb, '[]'::jsonb, 0, false, 161),
    ('tv_legale_armazenamento', 'TV Legale — Armazenamento', 'Armazenamento utilizado pela TV Legale.', 'servico', 'mensal', 150, 150, 0, 'GB', '[{"quantidade_minima":1,"preco_escritorio_cents":150,"preco_departamento_cents":150}]'::jsonb, '[]'::jsonb, 0, false, 162),
    ('ged_email', 'GED por e-mail', 'Organiza documentos recebidos e enviados por e-mail.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 170),
    ('ia_resumo_publicacao', 'IA de Resumo e Sugestão de Publicação', 'Resume publicações e sugere encaminhamentos para análise da equipe.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 180),
    ('plataforma_white_label', 'Plataforma White Label', 'Disponibiliza a plataforma com identidade visual personalizada.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 190),
    ('gestao_correspondente', 'Gestão de Correspondente', 'Organiza demandas e acompanhamento de correspondentes.', 'modulo', 'mensal', 0, 0, 0, 'módulo', '[]'::jsonb, '[]'::jsonb, 0, false, 200),
    ('usuario_legale', 'Usuário Legale', 'Acesso completo à plataforma.', 'usuario', 'mensal', 4790, 4790, 0, 'usuário', '[]'::jsonb, '[]'::jsonb, 0, true, 300),
    ('area_cliente', 'Área do Cliente', 'Acesso destinado ao cliente do escritório.', 'usuario', 'mensal', 4200, 4200, 0, 'usuário', '[]'::jsonb, '[]'::jsonb, 0, true, 310),
    ('usuario_bi', 'Usuário BI', 'Acesso aos painéis do Legale Analytics.', 'usuario', 'mensal', 3990, 3990, 0, 'usuário', '[]'::jsonb, '[]'::jsonb, 0, true, 320),
    ('usuarios_limitados', 'Usuários limitados', 'Acessos para consulta e operação conforme as permissões contratadas.', 'usuario', 'mensal', 4200, 4200, 0, 'usuário', '[{"quantidade_minima":1,"preco_escritorio_cents":4200,"preco_departamento_cents":4200},{"quantidade_minima":11,"preco_escritorio_cents":2800,"preco_departamento_cents":2800},{"quantidade_minima":31,"preco_escritorio_cents":1800,"preco_departamento_cents":1800},{"quantidade_minima":76,"preco_escritorio_cents":1500,"preco_departamento_cents":1500},{"quantidade_minima":101,"preco_escritorio_cents":1000,"preco_departamento_cents":1000}]'::jsonb, '[]'::jsonb, 0, true, 330),
    ('monitoramento_processos', 'Monitoramento de processos', 'Acompanhamento de movimentações e geração de alertas.', 'servico', 'mensal', 85, 85, 0, 'processo', '[{"quantidade_minima":100,"preco_escritorio_cents":85,"preco_departamento_cents":85},{"quantidade_minima":1000,"preco_escritorio_cents":75,"preco_departamento_cents":75},{"quantidade_minima":10000,"preco_escritorio_cents":65,"preco_departamento_cents":65},{"quantidade_minima":20001,"preco_escritorio_cents":55,"preco_departamento_cents":55}]'::jsonb, '[]'::jsonb, 0, true, 400)
)
insert into public.proposal_catalog_items
  (organization_id, codigo, nome, descricao, categoria, cobranca,
   preco_escritorio_cents, preco_departamento_cents, setup_cents, unidade,
   faixas_preco, opcoes_preco, minimo_opcoes, ativo, ordem)
select organizations.id, catalogo.*
from public.organizations
cross join catalogo
on conflict (organization_id, codigo) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  categoria = excluded.categoria,
  cobranca = excluded.cobranca,
  unidade = excluded.unidade,
  minimo_opcoes = excluded.minimo_opcoes,
  ordem = excluded.ordem;

update public.proposal_catalog_items
set ativo = false
where codigo in ('atividades_juridicas', 'tv_legale');

notify pgrst, 'reload schema';
