import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/master-hub/MasterSection";
import { useAuth } from "@/context/auth";
import { useAiQuota, useAiSettings } from "@/hooks/useAi";

export function AiSettingsSection() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const editable = canUpdate("master");
  const { data, update } = useAiSettings();
  const { data: quota } = useAiQuota();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (data) setValue(String(data.daily_limit));
  }, [data]);

  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("master.ai.title")}
        subtitle={t("master.ai.subtitle")}
      />
      <div className="flex max-w-sm flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="ai-limit">
          {t("master.ai.dailyLimit")}
        </label>
        <div className="flex gap-2">
          <Input
            id="ai-limit"
            type="number"
            min={0}
            value={value}
            disabled={!editable}
            onChange={(e) => setValue(e.target.value)}
          />
          {editable && (
            <Button
              size="sm"
              disabled={!valid || update.isPending || n === data?.daily_limit}
              onClick={() => update.mutate(n)}
            >
              {t("common.save")}
            </Button>
          )}
        </div>
        {quota && (
          <p className="text-xs text-muted-foreground">
            {t("master.ai.yourUsage", { used: quota.used, limit: quota.limit })}
          </p>
        )}
      </div>
    </div>
  );
}
