import { redirect } from "next/navigation";

export const metadata = { title: "Organização — Administração Legale" };

export default function NewTenantPage() {
  redirect("/admin/tenants");
}
