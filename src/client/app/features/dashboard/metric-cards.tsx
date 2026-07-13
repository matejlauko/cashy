import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";

export type MetricCardsProps = {
  currentBalance: number;
  monthlySpendingTotal: number;
  monthlySpendingExcludingTracked: number;
  monthlyIncomeTotal: number;
  monthlyExpenseTotal: number;
  recurringIncomeTotal: number;
  recurringExpenseTotal: number;
  budgetItemsTotal: number;
  isCurrentMonth?: boolean;
};

export function MetricCards({
  currentBalance,
  monthlySpendingTotal,
  monthlySpendingExcludingTracked,
  monthlyIncomeTotal,
  monthlyExpenseTotal,
  recurringIncomeTotal,
  recurringExpenseTotal,
  budgetItemsTotal,
  isCurrentMonth = true,
}: MetricCardsProps) {
  const availableToSpend =
    recurringIncomeTotal - recurringExpenseTotal - budgetItemsTotal;
  const budgetLeft = availableToSpend - monthlySpendingExcludingTracked;
  return (
    <div className="space-y-2">
      {/* Primary KPIs */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isCurrentMonth ? "Current Balance" : "Balance"}
            </CardTitle>
            <CardAction>
              <MetricInfo metricKey="currentBalance" />
            </CardAction>
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

        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monthly Spending
            </CardTitle>
            <CardAction>
              <MetricInfo metricKey="monthlySpending" />
            </CardAction>
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

        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Everyday Spending
            </CardTitle>
            <CardAction>
              <MetricInfo metricKey="everydaySpending" />
            </CardAction>
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
      <div className="grid grid-cols-2 gap-2">
        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income
            </CardTitle>
            <CardAction>
              <MetricInfo metricKey="income" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold tabular-nums text-emerald-600">
              +{formatMoneyMinor(monthlyIncomeTotal)}
            </span>
          </CardContent>
        </Card>

        <Card className="gap-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tracked Expenses
            </CardTitle>
            <CardAction>
              <MetricInfo metricKey="trackedExpenses" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold tabular-nums text-destructive">
              {monthlyExpenseTotal > 0 ? "\u2212" : ""}
              {formatMoneyMinor(monthlyExpenseTotal)}
            </span>
          </CardContent>
        </Card>
      </div>

      {budgetItemsTotal > 0 && (
        <div className="grid grid-cols-1 gap-2">
          <Card className="gap-1">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Budget Left
              </CardTitle>
              <CardAction>
                <MetricInfo metricKey="budgetLeft" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  budgetLeft < 0 && "text-destructive",
                )}
              >
                {formatMoneyMinor(budgetLeft)}
              </span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
