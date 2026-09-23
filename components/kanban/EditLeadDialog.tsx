"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import type { Lead } from "@/lib/types/leads";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { parseReaisToCents } from "@/lib/money";
import { EcoDoValor } from "./EcoDoValor";

interface FormShape {
  title: string;
  description: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
}

function centsToReais(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function EditLeadDialog({ open, onOpenChange, lead, pipelineId }: Props) {
  const t = useT();
  const edit = useEditLead(pipelineId);
  const valorVemDaProposta = lead.proposal_monthly_cents != null;

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsToReais(lead.proposal_monthly_cents ?? lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: lead.title,
        description: lead.description ?? "",
        valueReais: centsToReais(lead.proposal_monthly_cents ?? lead.value_cents),
        tagsRaw: (lead.tags ?? []).join(", "),
        expected_close_date: lead.expected_close_date ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id, lead.proposal_monthly_cents, lead.value_cents]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const reais = (values.valueReais ?? "").trim();
    let valueCents: number | null = null;
    if (!valorVemDaProposta && reais.length > 0) {
      valueCents = parseReaisToCents(reais);
      if (valueCents === null) {
        form.setError("valueReais", { message: t("Valor inválido") });
        return;
      }
    }

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      ...(!valorVemDaProposta ? { value_cents: valueCents } : {}),
      tags,
      expected_close_date: values.expected_close_date || null,
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? t("Dados inválidos"));
      return;
    }

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });
      toast.success(t("Lead atualizado"));
      onOpenChange(false);
    } catch {
      // toast already shown
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Editar lead")}</DialogTitle>
          <DialogDescription>
            {t("Atualize os campos. Mover de etapa ou marcar ganho/perdido tem opções próprias.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("Título")}</Label>
            <Input id="title" {...form.register("title", { required: true, minLength: 2 })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("Descrição")}</Label>
            <Textarea id="description" rows={3} {...form.register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="valueReais">
                {valorVemDaProposta ? "Mensalidade das propostas (R$)" : t("Valor (R$)")}
              </Label>
              <Input
                id="valueReais"
                inputMode="decimal"
                placeholder="0,00"
                disabled={valorVemDaProposta}
                {...form.register("valueReais")}
              />
              {valorVemDaProposta ? (
                <p className="text-xs text-muted-foreground">
                  Calculado pelas propostas vinculadas. O valor manual permanece salvo.
                </p>
              ) : (
                <EcoDoValor control={form.control} />
              )}
              {form.formState.errors.valueReais && (
                <p className="text-xs text-error-fg">{form.formState.errors.valueReais.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_close_date">{t("Fechamento previsto")}</Label>
              <Input
                id="expected_close_date"
                type="date"
                {...form.register("expected_close_date")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagsRaw">{t("Tags (separadas por vírgula)")}</Label>
            <Input id="tagsRaw" placeholder="vip, recompra" {...form.register("tagsRaw")} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={edit.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={edit.isPending}>
              {edit.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
