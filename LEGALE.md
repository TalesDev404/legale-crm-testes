# CRM Legale

Este repositório é o CRM + Sucesso do Cliente da Legale Tecnologia, construído sobre o DeskcommCRM.
As regras de código continuam em [`CLAUDE.md`](CLAUDE.md); este arquivo explica só o que é do Legale.

## O que já existe

| Parte | Onde |
|---|---|
| Empresas (ficha única: código W, ciclo de vida, responsáveis, saúde, dados de CS) | `/app/empresas`, migration `0318` |
| Histórico de contato da empresa (comercial e CS) | ficha da empresa → "Registrar contato" |
| Nota de saúde 0–100 com motivos, e ajuste manual com justificativa | `lib/schemas/empresas.ts` → `saudeDaEmpresa` |
| Áreas da equipe (Comercial, Sucesso do Cliente, Diretoria) | `/app/team?aba=areas` |
| Funis "Comercial Legale" e "Implantação (CS)" | `lib/empresas/funis-do-legale.ts` + script abaixo |
| Propostas com o catálogo do Legale | `/app/propostas` (migrations `0311`–`0316`) |
| Conexão Outlook para e-mails com aprovação | migration `0317` |

## Subir no Supabase + Vercel

1. **Supabase:** crie um projeto (região São Paulo) e aplique o schema `supabase/baseline.sql` com a
   connection string do **Session pooler** (Project Settings → Database). O arquivo é grande demais para o
   SQL Editor; use `psql`:

   ```bash
   psql "<connection string do session pooler>" -v ON_ERROR_STOP=1 -f supabase/baseline.sql
   ```

   Para atualizar um banco que já existe, rode o mesmo arquivo de novo **sem** `ON_ERROR_STOP` (é idempotente).

   Três coisas que pegaram na primeira instalação (17/11/2026):
   - **Antes do baseline**, crie as extensões no `public` (o dump as usa mas não cria):
     `create extension if not exists vector with schema public; create extension if not exists citext with schema public; create extension if not exists pg_trgm with schema public;`
   - **Quebras de linha:** no Windows o checkout fica em CRLF e um bloco do baseline confere o md5 de um
     texto — aplique o arquivo convertido para LF (no Linux/Vercel isso não acontece).
   - **Senha do banco com `#`, `%`, `*` etc.** precisa ir codificada na URL (`#` → `%23`, `%` → `%25`).
   - O app em produção exige `WAHA_*` e `UPSTASH_*`. O Legale v1 não usa nenhum dos dois: valores de
     "desligado" bastam (ver o fim do `.env.local`).
   - O primeiro dono é criado com `OWNER_EMAIL=... OWNER_PASSWORD=... OWNER_ORG_NAME=Legale npx tsx scripts/bootstrap-owner.ts`
     (não existe tela de cadastro). Depois, o script dos funis abaixo marca a organização como configurada,
     pulando o assistente de WhatsApp/IA do produto base.
2. **Vercel:** importe este repositório. Em *Environment Variables*, preencha pelo menos:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API);
   - `INTERNAL_SECRET`, `INTERNAL_CRON_SECRET`, `CPF_ENCRYPTION_KEY`, `AI_CRED_AES_KEY` (gere com `openssl rand -hex 32`).
   Os demais itens de `.env.example` são opcionais (WhatsApp, Google, IA).
3. **Primeiro acesso:** crie a conta da organização "Legale" pela tela de cadastro.
4. **Funis do Legale:** com o `.env.local` apontando para o mesmo Supabase, rode:

   ```bash
   npx tsx scripts/legale-configurar-organizacao.ts --org <slug-ou-id-da-organizacao> --simular
   npx tsx scripts/legale-configurar-organizacao.ts --org <slug-ou-id-da-organizacao>
   ```

   O script é idempotente: cria ou atualiza os dois funis, define o comercial como padrão e arquiva o funil
   "Pedidos" de e-commerce se ele estiver vazio. Nunca apaga etapa.
5. **Equipe:** convide Carla, Junior, Lino, Camila etc. em Equipe e marque as áreas na aba "Áreas".

## Importar a planilha "Controle de CRM e CS"

Feito em 26/11/2026 (91 empresas, 25 negócios, 84 contatos, 273 atividades, 6 tarefas). Para repetir
depois de mudar a planilha — o script não duplica nada, só atualiza:

1. Ler as abas 1–5 da planilha no SharePoint (conector Microsoft 365) e gerar o `raw.json` com as
   abas como listas de linhas (mesmo formato de `painel-comercial/tools/parse.js`). **Fora do git.**
2. `npx tsx scripts/legale-importar-planilha.ts --org legale --arquivo <raw.json> --simular`
3. Sem avisos estranhos, rodar de novo sem `--simular`.

Regras: empresas unificadas por código W ou nome comparável + apelidos; CRM vira negócio no funil
Comercial (perdido sem motivo = "Não registrado"); CS define cliente/ex-cliente; históricos viram
atividades da empresa. Responsável sem usuário no CRM (Carla) fica em branco — rode o import de novo
depois de convidá-la e a carteira é preenchida.

## Próximas fases

1. Importar as propostas da ferramenta antiga (legalecrm.vercel.app) e ligá-las às empresas.
2. Outlook: apresentações da agenda movem o funil; e-mails entram na linha do tempo.
3. Radar de upsell, metas por responsável, automações de follow-up, formulário do site com triagem.

## Pendências conhecidas do ambiente

- A suíte `pnpm test:unit` tem 61 falhas que já existem no `main` deste fork quando rodada no Windows
  (finais de linha CRLF, ausência de `.github/workflows`). Nenhuma vem do código do Legale.
- `pnpm test:db` precisa de Docker com WSL; não foi rodado nesta máquina.
