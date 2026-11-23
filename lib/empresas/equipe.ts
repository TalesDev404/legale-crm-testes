/**
 * A EQUIPE DA ORGANIZAÇÃO, COM AS ÁREAS (Comercial, CS, Diretoria).
 *
 * Mesma decisão de `lib/agenda/donos-da-agenda.ts`: a RLS de
 * `user_organizations` só entrega o próprio membership a `viewer`/`agent`, e o
 * seletor de responsável precisa de todos. A leitura vai pelo client ADMIN com
 * `organization_id` vindo de fonte confiável (cookie validado por quem chama)
 * como filtro EXPLÍCITO. Sem service role, degrada para a sessão.
 */
import { isServiceRoleConfigured } from "@/lib/audit";
import { AREAS_DA_EQUIPE, type AreaDaEquipe } from "@/lib/schemas/empresas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface MembroDaEquipe {
  id: string;
  nome: string;
  email: string | null;
  papel: string;
  areas: AreaDaEquipe[];
}

export async function equipeDaOrganizacao(organizationId: string): Promise<MembroDaEquipe[]> {
  const comAdmin = isServiceRoleConfigured();
  const client = comAdmin ? createAdminClient() : await createClient();

  const [{ data: membros }, { data: areas }] = await Promise.all([
    client
      .from("user_organizations")
      .select("user_id,role")
      .eq("organization_id", organizationId)
      .is("revoked_at", null),
    client
      .from("organization_member_areas")
      .select("user_id,area")
      .eq("organization_id", organizationId),
  ]);

  const areasPorPessoa = new Map<string, AreaDaEquipe[]>();
  for (const linha of (areas ?? []) as { user_id: string; area: string }[]) {
    if (!(AREAS_DA_EQUIPE as readonly string[]).includes(linha.area)) continue;
    const lista = areasPorPessoa.get(linha.user_id) ?? [];
    lista.push(linha.area as AreaDaEquipe);
    areasPorPessoa.set(linha.user_id, lista);
  }

  const admin = comAdmin ? createAdminClient() : null;
  const resultado = await Promise.all(
    ((membros ?? []) as { user_id: string; role: string }[]).map(async (m) => {
      let nome = m.user_id.slice(0, 8);
      let email: string | null = null;
      if (admin) {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        email = data.user?.email ?? null;
        nome = (data.user?.user_metadata?.full_name as string | undefined) || email || nome;
      }
      return { id: m.user_id, nome, email, papel: m.role, areas: areasPorPessoa.get(m.user_id) ?? [] };
    }),
  );
  return resultado.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** `true` se todos os ids informados são membros ativos da organização. */
export async function saoDaEquipe(organizationId: string, ids: (string | null | undefined)[]): Promise<boolean> {
  const alvo = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (alvo.length === 0) return true;
  const client = isServiceRoleConfigured() ? createAdminClient() : await createClient();
  const { data, error } = await client
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .in("user_id", alvo);
  if (error) return false;
  return new Set((data ?? []).map((l) => l.user_id as string)).size === alvo.length;
}
