import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compacta?: boolean;
};

/** Identidade fixa do CRM interno da Legale. */
export function MarcaLegale({ className, compacta = false }: Props) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)} aria-label="Legale">
      <svg
        aria-hidden
        viewBox="0 0 44 36"
        className={cn("shrink-0", compacta ? "h-8 w-9" : "h-10 w-12")}
      >
        <path d="M4 8.5 12.2 3 23 10.1l-8.2 5.6Z" fill="#8F4AF4" />
        <path d="m14.8 15.7 8.2-5.6 8.4 5.5-8.2 5.7Z" fill="#5D82F4" />
        <path d="m23.2 21.3 8.2-5.7 8.3 5.5-8.2 5.8Z" fill="#7024E8" />
        <path d="m6.7 22.1 8.1-6.4 8.4 5.6-8.3 7.1Z" fill="#43D6B3" />
      </svg>
      {!compacta ? (
        <span className="text-[1.65rem] font-semibold tracking-[-0.045em] text-[#282431]">
          legale
        </span>
      ) : null}
    </div>
  );
}
