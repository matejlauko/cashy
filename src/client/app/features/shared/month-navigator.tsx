import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  prevMonthKey,
  nextMonthKey,
  currentMonthKey,
  formatMonthLabel,
} from "@/lib/date";

type MonthNavigatorProps = {
  month: string;
  onChange: (month: string) => void;
};

export function MonthNavigator({ month, onChange }: MonthNavigatorProps) {
  const isCurrentMonth = month === currentMonthKey();

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => onChange(prevMonthKey(month))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {formatMonthLabel(month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => onChange(nextMonthKey(month))}
        disabled={isCurrentMonth}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
