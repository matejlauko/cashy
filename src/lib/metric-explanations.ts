export type MetricExplanation = {
  calculation: string;
  description?: string;
};

export const metricExplanations = {
  currentBalance: {
    calculation: "Sum of all account balances",
  },
  monthlySpending: {
    calculation: "Sum of all expense transactions this month",
  },
  everydaySpending: {
    calculation: "Monthly spending minus tracked expenses",
    description:
      "What you spent outside of recurring and budgeted items — your day-to-day discretionary spending.",
  },
  income: {
    calculation: "Sum of all income transactions this month",
  },
  trackedExpenses: {
    calculation: "Sum of all tracked expense transactions this month",
    description: "Expenses linked to recurring transactions or budget items.",
  },
  recurringIncome: {
    calculation: "Sum of all recurring income items",
  },
  recurringExpenses: {
    calculation: "Sum of all recurring expense items",
  },
  budgetLeft: {
    calculation:
      "Recurring income − recurring expenses − budget items − everyday spending",
    description:
      "How much of your planned available-to-spend amount remains after everyday purchases.",
  },
  totalPlanned: {
    calculation: "Sum of all budget item amounts",
  },
  availableToSpend: {
    calculation: "Recurring income − recurring expenses − budget items",
    description:
      "The amount left for everyday spending after all planned obligations.",
  },
} as const satisfies Record<string, MetricExplanation>;

export type MetricKey = keyof typeof metricExplanations;
