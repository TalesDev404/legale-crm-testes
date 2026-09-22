import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { formatCents } from "@/lib/money";
import {
  catalogoComercialEfetivo,
  separarCodigoDaOpcao,
  type ItemDoCatalogo,
} from "@/lib/schemas/proposta-catalogo";
import {
  COLUNAS_DA_PROPOSTA,
  FAIXAS_MONITORAMENTO,
  FAIXAS_USUARIOS_LIMITADOS,
  type ItemDaProposta,
  type PropostaComercial,
} from "@/lib/schemas/propostas";
import { createClient } from "@/lib/supabase/server";

import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposta comercial" };

const NAO_INCLUIDOS_FIXOS = [
  {
    codigo: "migracao_dados",
    nome: "Migração de dados",
    descricao: "Transferência de dados de outro sistema, quando não detalhada no investimento.",
  },
  {
    codigo: "dashboards_customizados",
    nome: "Dashboards customizados",
    descricao: "Painéis sob medida, além dos recursos contratados do Legale Analytics.",
  },
  {
    codigo: "projetos_personalizados_rpa",
    nome: "Projetos personalizados e RPA",
    descricao: "Desenvolvimentos e automações que exigem escopo próprio.",
  },
  {
    codigo: "lia",
    nome: "Lia — módulo de inteligência artificial",
    descricao: "Disponível para contratação separada quando não estiver detalhada no escopo.",
  },
] as const;

function dataPorExtenso(data: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${data}T12:00:00Z`));
}

function dataCurta(data: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${data}T12:00:00Z`),
  );
}

function codigoBase(codigo: string) {
  if (codigo.endsWith("_setup")) return codigo.slice(0, -6);
  return separarCodigoDaOpcao(codigo)?.[0] ?? codigo;
}

function quantidadeComUnidade(item: ItemDaProposta) {
  const unidade = item.unidade ?? "unidade";
  const plural = item.quantidade === 1 || unidade.endsWith("s") ? unidade : `${unidade}s`;
  return `${item.quantidade.toLocaleString("pt-BR")} ${plural}`;
}

function RodapeDaPagina({ cliente, pagina }: { cliente: string; pagina: number }) {
  return (
    <footer className="proposal-page-footer mt-auto flex items-center justify-between border-t border-[#e4ddeb] pt-5 text-[10px] font-semibold tracking-[.08em] text-[#70687e] uppercase">
      <span>Legale&nbsp;&nbsp;/&nbsp;&nbsp;{cliente}</span>
      <span>{String(pagina).padStart(2, "0")}&nbsp;&nbsp;/&nbsp;&nbsp;06</span>
    </footer>
  );
}

function CabecalhoDaPagina({
  cliente,
  pagina,
  chamada,
  titulo,
  descricao,
}: {
  cliente: string;
  pagina: number;
  chamada: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-8 border-b border-[#e4ddeb] pb-5">
        <Image
          src="/brand/legale-logo-oficial.png"
          width={184}
          height={61}
          alt="Legale"
          className="h-auto w-[132px]"
          priority
        />
        <span className="text-right text-[10px] font-semibold tracking-[.08em] text-[#70687e] uppercase">
          Proposta comercial&nbsp;&nbsp;/&nbsp;&nbsp;{cliente}
        </span>
      </header>
      <div className="pt-7">
        <p className="text-[11px] font-bold tracking-[.16em] text-[#7927e8] uppercase">{chamada}</p>
        <h2 className="mt-3 text-[34px] leading-tight font-semibold tracking-[-.025em] text-[#291c3f]">
          {titulo}
        </h2>
        <p className="mt-4 max-w-[660px] text-[15px] leading-6 text-[#70687e]">{descricao}</p>
      </div>
      <div className="sr-only">Página {pagina} de 6</div>
    </>
  );
}

function Selo({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "inline-flex rounded-full bg-[#edf0f1] px-3 py-1 text-[9px] font-bold tracking-[.08em] text-[#657178] uppercase"
          : "inline-flex rounded-full bg-[#e3f3ee] px-3 py-1 text-[9px] font-bold tracking-[.08em] text-[#007e78] uppercase"
      }
    >
      {children}
    </span>
  );
}

function LinhaDeInvestimento({
  item,
  moeda,
  exibirUnitario = true,
}: {
  item: ItemDaProposta;
  moeda: string;
  exibirUnitario?: boolean;
}) {
  return (
    <tr className="border-b border-[#e4ddeb] last:border-0">
      <td className="px-4 py-2.5 align-top">
        <strong className="font-semibold text-[#291c3f]">{item.nome}</strong>
        {item.descricao ? (
          <span className="mt-0.5 block text-[10px] leading-4 text-[#70687e]">
            {item.descricao}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap text-[#554b64]">
        {quantidadeComUnidade(item)}
      </td>
      {exibirUnitario ? (
        <td className="px-3 py-2.5 text-right align-top whitespace-nowrap text-[#554b64]">
          {formatCents(item.valor_unitario_cents, moeda)}
        </td>
      ) : null}
      <td className="px-4 py-2.5 text-right align-top font-semibold whitespace-nowrap text-[#291c3f]">
        {formatCents(item.total_cents, moeda)}
      </td>
    </tr>
  );
}

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const supabase = await createClient();
  const [{ data }, { data: catalogRows }] = await Promise.all([
    supabase
      .from("commercial_proposals")
      .select(COLUNAS_DA_PROPOSTA)
      .eq("organization_id", activeOrg.orgId)
      .eq("id", id)
      .single(),
    supabase
      .from("proposal_catalog_items")
      .select("*")
      .eq("organization_id", activeOrg.orgId)
      .order("ordem"),
  ]);
  if (!data) notFound();

  const proposal = data as unknown as PropostaComercial;
  const catalogo = catalogoComercialEfetivo(catalogRows as ItemDoCatalogo[] | null);
  const monthlyItems = proposal.items.filter((item) => item.cobranca === "mensal");
  const oneTimeItems = proposal.items.filter((item) => item.cobranca === "unica");
  const userItems = monthlyItems.filter((item) => item.categoria === "usuario");
  const moduleItems = monthlyItems.filter((item) => item.categoria !== "usuario");
  const scopeItems = proposal.items.filter(
    (item) =>
      ["modulo", "servico", "monitoramento"].includes(item.categoria) &&
      !item.codigo.endsWith("_setup"),
  );
  const selectedCodes = new Set(proposal.items.map((item) => codigoBase(item.codigo)));
  const temMigracao = proposal.items.some((item) => item.categoria === "migracao");
  const temModuloDeIa = proposal.items.some((item) => {
    const codigo = codigoBase(item.codigo);
    return codigo === "lia" || codigo.includes("ia_") || codigo.includes("inteligencia_artificial");
  });
  const catalogoNaoIncluido = catalogo
    .filter(
      (item) =>
        item.ativo &&
        (item.categoria === "modulo" || item.categoria === "servico") &&
        !selectedCodes.has(item.codigo),
    )
    .map((item) => ({ codigo: item.codigo, nome: item.nome, descricao: item.descricao }));
  const naoIncluidos = [
    ...NAO_INCLUIDOS_FIXOS.filter(
      (item) =>
        !selectedCodes.has(item.codigo) &&
        !(item.codigo === "migracao_dados" && temMigracao) &&
        !(item.codigo === "lia" && temModuloDeIa),
    ),
    ...catalogoNaoIncluido.filter(
      (item) => !NAO_INCLUIDOS_FIXOS.some((fixo) => fixo.codigo === item.codigo),
    ),
  ].slice(0, 5);
  const usuarioLimitado = proposal.items.find((item) => item.codigo === "usuario_limitado");
  const monitoramento = proposal.items.find((item) => item.codigo === "monitoramento_processos");
  const destino = proposal.client_kind === "escritorio" ? "escritório" : "departamento";
  const destinoLongo =
    proposal.client_kind === "escritorio" ? "escritório de advocacia" : "departamento jurídico";
  const descricaoDoEscopo = `${scopeItems.length} ${
    scopeItems.length === 1 ? "solução contratada" : "soluções contratadas"
  } para a rotina do ${destinoLongo} ${proposal.client_name}.`;

  return (
    <main className="proposal-shell bg-[#f7f6f9] px-4 py-6 sm:px-6">
      <div className="proposal-actions mx-auto mb-5 flex max-w-[794px] items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/app/propostas">Voltar</Link>
        </Button>
        <PrintButton />
      </div>

      <article className="proposal-document mx-auto max-w-[794px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
        <section className="proposal-page relative flex min-h-[1123px] flex-col overflow-hidden bg-[#f7f6f9] px-[56px] py-[58px]">
          <div className="proposal-cover-rings" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <header className="relative z-10">
            <Image
              src="/brand/legale-logo-oficial.png"
              width={184}
              height={61}
              alt="Legale"
              className="h-auto w-[170px]"
              priority
            />
            <div className="mt-10 h-1 w-12 bg-[#7927e8]" />
            <p className="mt-7 text-[11px] font-bold tracking-[.08em] text-[#7927e8] uppercase">
              Proposta comercial
            </p>
          </header>

          <div className="relative z-10 mt-14 max-w-[640px]">
            <p className="proposal-client-wordmark text-[48px] leading-none font-black tracking-[-.04em] text-[#291c3f] uppercase">
              {proposal.client_name}
            </p>
            <h1 className="mt-20 text-[43px] leading-[1.16] font-light tracking-[-.035em] text-[#291c3f]">
              Gestão jurídica para
              <strong className="mt-1 block font-bold text-[#7927e8]">o seu {destino}.</strong>
            </h1>
            <p className="mt-9 max-w-[600px] text-[16px] leading-7 text-[#291c3f]">
              Processos, publicações, contratos e atividades jurídicas em uma plataforma, com
              análise de dados e recursos de inteligência artificial.
            </p>
          </div>

          <div className="relative z-10 mt-24">
            {proposal.recipient_name ? (
              <>
                <p className="text-[10px] font-bold tracking-[.06em] text-[#70687e] uppercase">
                  Preparada para
                </p>
                <p className="mt-4 text-[18px] font-bold text-[#291c3f]">
                  {proposal.recipient_name}
                </p>
              </>
            ) : null}
            <p className="mt-3 text-[13px] text-[#70687e]">
              {proposal.client_name}&nbsp;&nbsp;|&nbsp;&nbsp;{dataPorExtenso(proposal.issue_date)}
            </p>
          </div>

          <footer className="relative z-10 mt-auto flex items-center justify-between border-t border-[#e4ddeb] pt-7 text-[10px] font-semibold tracking-[.06em] text-[#70687e] uppercase">
            <span>Legale&nbsp;&nbsp;/&nbsp;&nbsp;{proposal.client_name}</span>
            <span>Proposta comercial</span>
          </footer>
        </section>

        <section className="proposal-page flex min-h-[1123px] flex-col px-[56px] py-[58px]">
          <CabecalhoDaPagina
            cliente={proposal.client_name}
            pagina={2}
            chamada="Sobre o Legale"
            titulo="Experiência que transforma."
            descricao="Tecnologia especializada para a gestão de escritórios e departamentos jurídicos."
          />
          <div className="mt-12">
            <p className="text-[10px] font-bold tracking-[.12em] text-[#7927e8] uppercase">
              Nossa trajetória
            </p>
            <h3 className="mt-4 max-w-[650px] text-[32px] leading-[1.18] font-semibold tracking-[-.025em] text-[#291c3f]">
              <span className="text-[#7927e8]">34 anos</span> de experiência em tecnologia para o
              setor jurídico
            </h3>
            <div className="mt-8 h-px w-full bg-[#e4ddeb]" />
            <div className="mt-8 space-y-5 text-[15px] leading-7 text-[#70687e]">
              <p>
                O Legale nasceu da experiência da Qualy System, empresa que há 34 anos atua com
                tecnologia aplicada ao mercado jurídico. Essa trajetória deu origem a uma plataforma
                desenvolvida a partir das necessidades reais de escritórios e departamentos
                jurídicos.
              </p>
              <p>
                Hoje, a Legale combina essa experiência com evolução contínua, inovação e
                inteligência de dados para simplificar a operação jurídica e apoiar seus clientes em
                seus desafios do dia a dia.
              </p>
            </div>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4">
            {[
              {
                titulo: "Suporte próximo e humanizado",
                texto:
                  "Atendimento especializado, feito por pessoas que conhecem a plataforma e acompanham o cliente na solução de suas necessidades.",
              },
              {
                titulo: "Customer Success",
                texto:
                  "Acompanhamento próximo para apoiar a adoção da plataforma, identificar oportunidades de melhoria e contribuir para que o cliente obtenha cada vez mais valor com o Legale.",
              },
            ].map((item) => (
              <div key={item.titulo} className="rounded-xl bg-[#f6f3fa] p-5">
                <div className="h-1 w-8 bg-[#7927e8]" />
                <h4 className="mt-5 text-[16px] font-semibold text-[#291c3f]">{item.titulo}</h4>
                <p className="mt-3 text-[12px] leading-5 text-[#70687e]">{item.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[11px] text-[#70687e]">Legale | Ribeirão Preto — SP</p>
          <RodapeDaPagina cliente={proposal.client_name} pagina={2} />
        </section>

        <section className="proposal-page flex min-h-[1123px] flex-col px-[56px] py-[58px]">
          <CabecalhoDaPagina
            cliente={proposal.client_name}
            pagina={3}
            chamada="Escopo de contratação"
            titulo="Sua contratação."
            descricao={descricaoDoEscopo}
          />
          <ul className="mt-11 border-t border-[#e4ddeb]">
            {scopeItems.map((item) => (
              <li
                key={item.codigo}
                className="flex justify-between gap-8 border-b border-[#e4ddeb] py-5"
              >
                <div className="min-w-0">
                  <h3 className="text-[16px] leading-5 font-semibold text-[#291c3f]">
                    {item.nome}
                  </h3>
                  <p className="mt-2 text-[12px] leading-5 text-[#70687e]">
                    {item.descricao || "Incluído nesta proposta comercial."}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-bold tracking-[.08em] text-[#007e78] uppercase">
                    Incluído
                  </span>
                  {item.quantidade > 1 ? (
                    <p className="mt-2 text-[10px] font-semibold text-[#70687e]">
                      {quantidadeComUnidade(item)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <RodapeDaPagina cliente={proposal.client_name} pagina={3} />
        </section>

        <section className="proposal-page flex min-h-[1123px] flex-col px-[56px] py-[58px]">
          <CabecalhoDaPagina
            cliente={proposal.client_name}
            pagina={4}
            chamada="Investimento"
            titulo="Investimento detalhado."
            descricao="Mensalidade e ativação aparecem separadas para facilitar a leitura do investimento."
          />
          {userItems.length > 0 ? (
            <div className="mt-10">
              <p className="mb-4 text-[10px] font-bold tracking-[.12em] text-[#7927e8] uppercase">
                Licenças de acesso
              </p>
              <div className="overflow-hidden rounded-lg border border-[#e4ddeb]">
                <table className="w-full table-fixed text-[11px]">
                  <thead className="bg-[#291c3f] text-white">
                    <tr>
                      <th className="w-[43%] px-4 py-2.5 text-left font-semibold">Modalidade</th>
                      <th className="w-[19%] px-3 py-2.5 text-right font-semibold">Quantidade</th>
                      <th className="w-[19%] px-3 py-2.5 text-right font-semibold">Unitário</th>
                      <th className="w-[19%] px-4 py-2.5 text-right font-semibold">Total / mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userItems.map((item) => (
                      <LinhaDeInvestimento
                        key={item.codigo}
                        item={item}
                        moeda={proposal.currency}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className={userItems.length > 0 ? "mt-7" : "mt-10"}>
            <p className="mb-4 text-[10px] font-bold tracking-[.12em] text-[#7927e8] uppercase">
              Módulos e serviços incluídos
            </p>
            <div className="overflow-hidden rounded-lg border border-[#e4ddeb]">
              <table className="w-full table-fixed text-[11px]">
                <thead className="bg-[#291c3f] text-white">
                  <tr>
                    <th className="w-[58%] px-4 py-2.5 text-left font-semibold">Item contratado</th>
                    <th className="w-[21%] px-3 py-2.5 text-right font-semibold">Quantidade</th>
                    <th className="w-[21%] px-4 py-2.5 text-right font-semibold">Total / mês</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleItems.map((item) => (
                    <LinhaDeInvestimento
                      key={item.codigo}
                      item={item}
                      moeda={proposal.currency}
                      exibirUnitario={false}
                    />
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between bg-[#7927e8] px-4 py-4 text-white">
                <span className="text-[11px] font-bold tracking-[.06em] uppercase">
                  Total mensal
                </span>
                <strong className="text-[21px]">
                  {formatCents(proposal.monthly_total_cents, proposal.currency)}
                </strong>
              </div>
            </div>
          </div>
          {oneTimeItems.length > 0 ? (
            <div className="mt-7 overflow-hidden rounded-lg bg-[#f6f3fa]">
              <div className="border-b border-[#e4ddeb] px-4 py-3 text-[10px] font-bold tracking-[.1em] text-[#70687e] uppercase">
                Ativação, implantação e serviços pontuais
              </div>
              {oneTimeItems.map((item) => (
                <div
                  key={item.codigo}
                  className="flex items-start justify-between gap-5 border-b border-[#e4ddeb] px-4 py-3 text-[11px] last:border-0"
                >
                  <span>
                    <strong className="block text-[#291c3f]">{item.nome}</strong>
                    {item.descricao ? (
                      <span className="mt-0.5 block text-[10px] text-[#70687e]">
                        {item.descricao}
                      </span>
                    ) : null}
                  </span>
                  <strong className="shrink-0 text-[14px] text-[#291c3f]">
                    {formatCents(item.total_cents, proposal.currency)}
                  </strong>
                </div>
              ))}
              <div className="flex items-center justify-between bg-[#eee7fa] px-4 py-3 text-[#291c3f]">
                <span className="text-[10px] font-bold tracking-[.06em] uppercase">
                  Total único
                </span>
                <strong className="text-[16px]">
                  {formatCents(proposal.activation_total_cents, proposal.currency)}
                </strong>
              </div>
            </div>
          ) : null}
          <RodapeDaPagina cliente={proposal.client_name} pagina={4} />
        </section>

        <section className="proposal-page flex min-h-[1123px] flex-col px-[56px] py-[58px]">
          <CabecalhoDaPagina
            cliente={proposal.client_name}
            pagina={5}
            chamada="Escopo"
            titulo="O que está contemplado."
            descricao="Serviços incluídos e possibilidades de contratação adicional."
          />
          <div className="mt-11">
            <Selo>Incluído sem custo adicional</Selo>
            <h3 className="mt-5 text-[20px] font-semibold text-[#291c3f]">
              Treinamento do sistema
            </h3>
            <p className="mt-2 text-[14px] text-[#70687e]">
              Bonificado, com até 8 horas de treinamento.
            </p>
          </div>
          <div className="mt-9 border-t border-[#e4ddeb] pt-7">
            <Selo muted>Não incluído nesta proposta</Selo>
            <p className="mt-5 text-[13px] leading-6 text-[#70687e]">
              Os itens abaixo não integram os valores apresentados. Podem ser avaliados em uma
              contratação adicional.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-x-7 gap-y-6">
              {naoIncluidos.map((item) => (
                <div key={item.codigo}>
                  <h4 className="text-[13px] font-semibold text-[#291c3f]">{item.nome}</h4>
                  <p className="mt-1 text-[11px] leading-4 text-[#70687e]">{item.descricao}</p>
                </div>
              ))}
            </div>
          </div>
          {proposal.notes ? (
            <div className="mt-9 rounded-xl border border-[#e4ddeb] p-5">
              <h3 className="text-[12px] font-semibold text-[#291c3f]">Observações da proposta</h3>
              <p className="mt-2 text-[11px] leading-5 whitespace-pre-line text-[#70687e]">
                {proposal.notes}
              </p>
            </div>
          ) : null}
          <RodapeDaPagina cliente={proposal.client_name} pagina={5} />
        </section>

        <section className="proposal-page flex min-h-[1123px] flex-col px-[56px] py-[58px]">
          <CabecalhoDaPagina
            cliente={proposal.client_name}
            pagina={6}
            chamada="Condições e referências"
            titulo="Tabelas de referência."
            descricao="Faixas comerciais para usuários limitados e monitoramento de processos."
          />
          <div className="mt-9">
            <p className="mb-3 text-[10px] font-bold tracking-[.12em] text-[#7927e8] uppercase">
              Usuário limitado
            </p>
            <div className="overflow-hidden rounded-lg border border-[#e4ddeb]">
              <table className="w-full text-[11px]">
                <thead className="bg-[#291c3f] text-white">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Faixa de usuários</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Valor unitário / mês</th>
                  </tr>
                </thead>
                <tbody>
                  {FAIXAS_USUARIOS_LIMITADOS.map((faixa) => (
                    <tr key={faixa.ate} className="border-b border-[#e4ddeb] last:border-0">
                      <td className="px-4 py-2 text-[#554b64]">
                        {Number.isFinite(faixa.ate)
                          ? `Até ${faixa.ate.toLocaleString("pt-BR")}`
                          : "Acima de 100"}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[#291c3f]">
                        {formatCents(faixa.valor_cents, proposal.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-7">
            <p className="mb-3 text-[10px] font-bold tracking-[.12em] text-[#7927e8] uppercase">
              Monitoramento de processos
            </p>
            <div className="overflow-hidden rounded-lg border border-[#e4ddeb]">
              <table className="w-full text-[11px]">
                <thead className="bg-[#291c3f] text-white">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Quantidade de processos</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Valor unitário</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Contratação mínima mensal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FAIXAS_MONITORAMENTO.map((faixa) => (
                    <tr key={faixa.minimo} className="border-b border-[#e4ddeb] last:border-0">
                      <td className="px-4 py-2 text-[#554b64]">
                        {faixa.minimo === 100
                          ? "Contratação mínima de 100"
                          : faixa.minimo === 20_001
                            ? "Acima de 20.000"
                            : `A partir de ${faixa.minimo.toLocaleString("pt-BR")}`}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[#291c3f]">
                        {formatCents(faixa.valor_cents, proposal.currency)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[#291c3f]">
                        {formatCents(
                          (faixa.minimo === 20_001 ? 20_000 : faixa.minimo) * faixa.valor_cents,
                          proposal.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {usuarioLimitado || monitoramento ? (
            <div className="mt-7 rounded-xl bg-[#eee7fa] px-5 py-4">
              <p className="text-[9px] font-bold tracking-[.1em] text-[#7927e8] uppercase">
                Condições aplicadas a {proposal.client_name}
              </p>
              <div className="mt-2 space-y-1 text-[11px] leading-4 text-[#291c3f]">
                {usuarioLimitado ? (
                  <p>
                    <strong>Usuários limitados:</strong>{" "}
                    {usuarioLimitado.quantidade.toLocaleString("pt-BR")} usuários por{" "}
                    {formatCents(usuarioLimitado.valor_unitario_cents, proposal.currency)} cada/mês.
                  </p>
                ) : null}
                {monitoramento ? (
                  <p>
                    <strong>Monitoramento:</strong>{" "}
                    {monitoramento.quantidade.toLocaleString("pt-BR")} processos por{" "}
                    {formatCents(monitoramento.valor_unitario_cents, proposal.currency)} cada/mês.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="mt-6">
            <h3 className="text-[15px] font-semibold text-[#7927e8]">Condições comerciais</h3>
            <div className="mt-2 text-[10px] leading-4 text-[#291c3f]">
              <p>Início dos trabalhos após a assinatura do contrato.</p>
              <p className="whitespace-pre-line">
                {proposal.payment_terms ||
                  "Início da cobrança mensal conforme definido em contrato."}
              </p>
              <p>
                Proposta emitida em {dataCurta(proposal.issue_date)}, válida até{" "}
                {dataCurta(proposal.valid_until)}.
              </p>
            </div>
            <p className="mt-3 text-[9px] leading-4 text-[#70687e]">
              Custos externos da operadora de assinatura digital e da operadora de publicação são de
              responsabilidade da {proposal.client_name}.
            </p>
          </div>
          <div className="mt-auto rounded-lg bg-[#f1ebfa] px-5 py-4">
            <p className="text-[9px] font-bold tracking-[.08em] text-[#7927e8] uppercase">
              Fale com o Legale
            </p>
            <div className="mt-2 flex items-center justify-between gap-5 text-[11px] text-[#291c3f]">
              <span>(16) 3234-2720&nbsp;&nbsp;|&nbsp;&nbsp;(16) 99176-5466</span>
              <span className="text-right">
                contato@legaleweb.com.br&nbsp;&nbsp;|&nbsp;&nbsp;legaleweb.com.br
              </span>
            </div>
          </div>
          <RodapeDaPagina cliente={proposal.client_name} pagina={6} />
        </section>
      </article>
    </main>
  );
}
