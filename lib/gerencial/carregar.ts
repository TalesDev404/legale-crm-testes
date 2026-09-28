/** Evita que o limite de linhas da API transforme um total parcial em número definitivo. */
export async function carregarPaginas<T>(
  pagina: (
    de: number,
    ate: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  limite = 10000,
  porPagina = 1000,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let offset = 0; offset < limite; offset += porPagina) {
    const { data, error } = await pagina(offset, offset + porPagina - 1);
    if (error) throw new Error(`Não foi possível carregar o painel: ${error.message}`);
    const slice = data ?? [];
    rows.push(...slice);
    if (slice.length < porPagina) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
