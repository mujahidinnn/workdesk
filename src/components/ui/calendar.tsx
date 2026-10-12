import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayButton, DayPicker, type DateRange } from "react-day-picker";
import { isAfter, isSameDay } from "date-fns";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  todayClassName?: string;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  todayClassName,
  ...props
}: CalendarProps) {
  const [hovered, setHovered] = React.useState<Date>();
  const range =
    props.mode === "range"
      ? ((props as { selected?: DateRange }).selected)
      : undefined;
  const picking =
    !!range?.from && (!range.to || isSameDay(range.from, range.to));
  const preview =
    picking && hovered && range?.from
      ? isAfter(hovered, range.from)
        ? { from: range.from, to: hovered }
        : { from: hovered, to: range.from }
      : undefined;

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        nav: "flex items-center justify-between absolute inset-x-1 top-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_caption: "flex justify-center items-center h-9",
        caption_label: "text-sm font-medium text-foreground",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:first-child>button]:rounded-l-md [&:last-child>button]:rounded-r-md",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" {...chevronProps} />
          ) : (
            <ChevronRight className="h-4 w-4" {...chevronProps} />
          ),
        DayButton: (buttonProps) => (
          <CalendarDayButton {...buttonProps} todayClassName={todayClassName} />
        ),
      }}
      {...props}
      modifiers={{
        ...props.modifiers,
        preview: preview ?? [],
        preview_edge: picking && hovered ? hovered : [],
        preview_from: preview ? preview.from : [],
        preview_to: preview ? preview.to : [],
      }}
      onDayMouseEnter={(date, m, e) => {
        setHovered(date);
        props.onDayMouseEnter?.(date, m, e);
      }}
      onDayMouseLeave={(date, m, e) => {
        setHovered(undefined);
        props.onDayMouseLeave?.(date, m, e);
      }}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  todayClassName,
  ...props
}: React.ComponentProps<typeof DayButton> & { todayClassName?: string }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-9 w-9 p-0 font-normal",
        modifiers.today &&
          !modifiers.selected &&
          (todayClassName ?? "bg-accent text-accent-foreground"),
        modifiers.selected &&
          !modifiers.range_middle &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        modifiers.range_middle &&
          "rounded-none bg-primary/15 text-foreground hover:bg-primary/25",
        modifiers.preview &&
          !modifiers.selected &&
          "rounded-none bg-primary/15 text-foreground hover:bg-primary/15",
        modifiers.preview_edge &&
          !modifiers.selected &&
          "bg-primary/30 hover:bg-primary/30",
        modifiers.preview_from &&
          !modifiers.preview_to &&
          "rounded-l-md rounded-r-none",
        modifiers.preview_to &&
          !modifiers.preview_from &&
          "rounded-r-md rounded-l-none",
        modifiers.range_start && !modifiers.range_end && "rounded-r-none",
        modifiers.range_end && !modifiers.range_start && "rounded-l-none",
        className,
      )}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
