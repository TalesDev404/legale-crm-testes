import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { InboxLayout } from "@/components/inbox/InboxLayout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/get-started");
  const { id } = await searchParams;
  return <InboxLayout initialSelectedId={id ?? null} />;
}
