import Image from "next/image";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compacta?: boolean;
};

/** Identidade fixa do CRM interno da Legale. */
export function MarcaLegale({ className, compacta = false }: Props) {
  return (
    <div className={cn("inline-flex items-center", className)}>
      <Image
        src="/brand/legale-logo-oficial.png"
        alt="Legale"
        width={2599}
        height={773}
        priority
        className={cn("w-auto object-contain", compacta ? "h-8" : "h-10")}
      />
    </div>
  );
}
