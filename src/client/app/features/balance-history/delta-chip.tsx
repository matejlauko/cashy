import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import { signedDelta, type AccountType } from "./signed-delta";

type DeltaChipProps = {
  prev: number | null;
  curr: number;
  accountType: AccountType;
  className?: string;
};

export function DeltaChip({ prev, curr, accountType, className }: DeltaChipProps) {
  const { delta, direction } = signedDelta(accountType, prev, curr);

  if (direction === "none" || direction === "flat") {
    return (
      <span
        className={cn(
          "text-[11px] font-medium text-muted-foreground tabular-nums",
          className,
        )}
      >
        —
      </span>
    );
  }

  const sign = delta! > 0 ? "+" : "";
  const label = `${sign}${formatMoneyMinor(delta!)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        direction === "up" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        direction === "down" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      {label}
    </span>
  );
}
