import { useState } from "react";
import { Eye, EyeOff, Network } from "lucide-react";
import { AccessControl } from "@/components/auth/AccessControl";
import { useTranslation } from "react-i18next";
import { MasterListTable } from "./MasterListTable";
import { MasterListFormDialog } from "./MasterListFormDialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { useDeleteDivision, useDivisions, useSaveDivision, useToggleDivision } from "@/hooks/useDivisions";

export function DivisionsSection() {
  const { t } = useTranslation();
  const { data: divisions = [], isLoading } = useDivisions();
  const save = useSaveDivision();
  const remove = useDeleteDivision();
  const toggle = useToggleDivision();
  const [editing, setEditing] = useState<{ id: number; label: string; description?: string | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; label: string } | null>(null);

  return (
    <>
      <MasterListTable
        tourId="divisions"
        title={t("master.masterList.divisions.title")}
        subtitle={t("master.masterList.divisions.subtitle")}
        itemLabel={t("master.masterList.divisions.itemLabel")}
        icon={Network}
        items={divisions.map((d) => ({ id: d.id, label: d.name, description: d.description, inactive: !d.is_active }))}
        onAdd={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        onEdit={(item) => {
          setEditing(item);
          setDialogOpen(true);
        }}
        onDelete={(id) => setDeleting({ id, label: divisions.find((d) => d.id === id)?.name ?? String(id) })}
        rowActions={(item) => (
          <AccessControl feature="master" action="update">
            <button
              type="button"
              onClick={() => toggle.mutate({ id: item.id, is_active: !!item.inactive })}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
              title={item.inactive ? t("master.masterList.divisions.activate") : t("master.masterList.divisions.deactivate")}
              aria-label={item.inactive ? t("master.masterList.divisions.activate") : t("master.masterList.divisions.deactivate")}
            >
              {item.inactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </AccessControl>
        )}
        isLoading={isLoading}
      />
      <MasterListFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t("master.masterList.divisions.itemLabel")}
        initialValue={editing?.label ?? null}
        initialDescription={editing?.description ?? null}
        onSubmit={(name, description) =>
          save.mutate({ id: editing?.id, name, description }, { onSuccess: () => setDialogOpen(false) })
        }
        loading={save.isPending}
      />
      <DeleteConfirmationModal
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={t("master.masterList.divisions.deleteTitle")}
        description={t("master.masterList.divisions.deleteDesc", { name: deleting?.label })}
        isPending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
