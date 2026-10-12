import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Pencil, Trash2, Plus, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SectionHeader, Toolbar, SearchInput } from "./MasterSection";
import { AccessControl } from "@/components/auth/AccessControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { cn } from "@/lib/utils";

interface MasterItem {
  id: number;
  label: string;
  description?: string | null;
  inactive?: boolean;
}

interface MasterListTableProps {
  tourId: string;
  title: string;
  subtitle: string;
  itemLabel: string;
  icon: LucideIcon;
  items: MasterItem[];
  colorDot?: (label: string) => string;
  onAdd: () => void;
  onEdit: (item: MasterItem) => void;
  onDelete: (id: number) => void;
  rowActions?: (item: MasterItem) => ReactNode;
  isLoading?: boolean;
}

export function MasterListTable({
  tourId,
  title,
  subtitle,
  itemLabel,
  icon,
  items,
  colorDot,
  onAdd,
  onEdit,
  onDelete,
  rowActions,
  isLoading,
}: MasterListTableProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<MasterItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={title}
        count={items.length}
        subtitle={subtitle}
        actions={
        <AccessControl feature="master" action="create">
          <Button
            data-tour={`master-${tourId}-add`}
            size="sm"
            onClick={onAdd}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("master.masterList.addNew", { title: itemLabel })}
          </Button>
        </AccessControl>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("master.masterList.search")}
          tour={`master-${tourId}-search`}
        />
      </Toolbar>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("master.masterList.columnName")}
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">
                {t("master.masterList.columnActions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-4 py-3" colSpan={2}>
                    <div className="h-4 rounded bg-secondary animate-pulse" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4">
                  <EmptyState
                    icon={icon}
                    title={t("master.masterList.empty")}
                    description={t("master.masterList.emptyHint")}
                  />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4">
                  <EmptyState
                    icon={icon}
                    title={t("master.masterList.noResults")}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((item, i) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  {...detailRowProps(() => setViewing(item))}
                  className="border-b border-border/40 group hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {colorDot && (
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            colorDot(item.label),
                          )}
                        />
                      )}
                      <div className={cn("min-w-0", item.inactive && "opacity-60")}>
                        <p className="text-sm text-foreground">
                          {item.label}
                          {item.inactive && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t("master.masterList.inactive")}
                            </span>
                          )}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                    >
                      {rowActions?.(item)}
                      <AccessControl feature="master" action="update">
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </AccessControl>
                      <AccessControl feature="master" action="delete">
                        <button
                          onClick={() => onDelete(item.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </AccessControl>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DetailDialog
        title={itemLabel}
        fields={
          viewing && [
            {
              label: t("master.masterList.columnName"),
              value: (
                <span className="inline-flex items-center gap-2">
                  {colorDot && (
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        colorDot(viewing.label),
                      )}
                    />
                  )}
                  {viewing.label}
                </span>
              ),
            },
            ...(viewing.description
              ? [
                  {
                    label: t("master.masterList.description"),
                    block: true,
                    value: (
                      <span className="whitespace-pre-wrap">
                        {viewing.description}
                      </span>
                    ),
                  },
                ]
              : []),
          ]
        }
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
