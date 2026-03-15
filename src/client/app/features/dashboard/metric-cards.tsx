import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type MetricCardsProps = {
  currentBalance: number;
  monthlySpendingTotal: number;
  monthlySpendingExcludingTracked: number;
  monthlyIncomeTotal: number;
  monthlyExpenseTotal: number;
  recurringIncomeTotal: number;
  recurringExpenseTotal: number;
};

export function MetricCards({
  currentBalance,
  monthlySpendingTotal,
  monthlySpendingExcludingTracked,
  monthlyIncomeTotal,
  monthlyExpenseTotal,
  recurringIncomeTotal,
  recurringExpenseTotal,
}: MetricCardsProps) {
  return (
    <div className="space-y-3">
      {/* Primary KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                currentBalance < 0 && "text-destructive",
              )}
            >
              {formatMoneyMinor(currentBalance)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monthly Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                monthlySpendingTotal < 0 && "text-muted-foreground",
              )}
            >
              {formatMoneyMinor(monthlySpendingTotal)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Everyday Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                monthlySpendingExcludingTracked < 0 && "text-muted-foreground",
              )}
            >
              {formatMoneyMinor(monthlySpendingExcludingTracked)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-lg font-semibold tabular-nums text-emerald-600">
              +{formatMoneyMinor(monthlyIncomeTotal)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tracked Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-lg font-semibold tabular-nums text-destructive">
              {monthlyExpenseTotal > 0 ? "\u2212" : ""}
              {formatMoneyMinor(monthlyExpenseTotal)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Recurring KPIs */}
      {(recurringIncomeTotal > 0 || recurringExpenseTotal > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recurring Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-lg font-semibold tabular-nums text-emerald-600">
                +{formatMoneyMinor(recurringIncomeTotal)}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recurring Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-lg font-semibold tabular-nums text-destructive">
                {recurringExpenseTotal > 0 ? "\u2212" : ""}
                {formatMoneyMinor(recurringExpenseTotal)}
              </span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
