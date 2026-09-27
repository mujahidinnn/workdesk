import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useDateFnsLocale } from "@/lib/dateLocale";
import type { PeriodType } from "@/lib/period";
import { cn } from "@/lib/utils";

const PERIOD_TYPES: PeriodType[] = ["daily", "monthly", "yearly"];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 4 + i);

interface AttendancePeriodFilterProps {
  periodType: PeriodType;
  onPeriodTypeChange: (t: PeriodType) => void;
  date: Date;
  onDateChange: (d: Date) => void;
}

export function AttendancePeriodFilter({
  periodType,
  onPeriodTypeChange,
  date,
  onDateChange,
}: AttendancePeriodFilterProps) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();

  function setMonth(monthIndex: number) {
    onDateChange(new Date(date.getFullYear(), monthIndex, 1));
  }

  function setYear(year: number) {
    onDateChange(new Date(year, date.getMonth(), 1));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin">
        {PERIOD_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onPeriodTypeChange(type)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              periodType === type
                ? "bg-card text-foreground border border-border shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`attendance.period.${type}`)}
          </button>
        ))}
      </div>

      {periodType === "daily" && (
        <DatePickerField
          label=""
          value={format(date, "yyyy-MM-dd")}
          onChange={(v) => v && onDateChange(new Date(`${v}T00:00:00`))}
          required
          className="w-40"
        />
      )}

      {periodType === "monthly" && (
        <div className="flex items-center gap-2">
          <Select
            value={String(date.getMonth())}
            onValueChange={(v) => setMonth(Number(v))}
          >
            <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i} value={String(i)} className="text-sm">
                  {format(new Date(2000, i, 1), "MMMM", { locale })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(date.getFullYear())}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-sm">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {periodType === "yearly" && (
        <Select
          value={String(date.getFullYear())}
          onValueChange={(v) => setYear(Number(v))}
        >
          <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)} className="text-sm">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
