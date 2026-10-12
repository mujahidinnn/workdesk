import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function EditableText({
  value,
  onSave,
  placeholder,
  disabled,
  className,
  multiline = true,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if (next !== (value?.trim() || null)) onSave(next);
  }

  if (editing && !disabled) {
    return (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
          if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className={cn("text-sm", multiline ? "min-h-[90px]" : "min-h-0 resize-none", className)}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={cn(
        "w-full whitespace-pre-wrap rounded-md px-2 py-1.5 text-left text-sm",
        !disabled && "hover:bg-muted",
        value ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}
