import { redirect } from "next/navigation";

export const metadata = { title: "Cadastro na instalação" };
export const dynamic = "force-dynamic";

/** Compatibilidade com favoritos antigos: cadastro aberto não existe no CRM Legale. */
export default function Page() {
  redirect("/admin/dashboard");
}
