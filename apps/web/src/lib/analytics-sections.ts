export const ANALYTICS_SECTIONS = {
  quotations: {
    title: "Quotations pipeline",
    subtitle: "Quoted value, win rate and the customers driving your pipeline.",
  },
  sales: {
    title: "Sales & revenue",
    subtitle: "Confirmed sales orders, revenue growth and invoicing progress.",
  },
  invoices: {
    title: "Invoices & cash",
    subtitle: "What you billed, what you collected and what is overdue.",
  },
  purchasing: {
    title: "Purchasing & cost",
    subtitle: "Purchase order spend, receipts and your largest vendors.",
  },
  expenses: {
    title: "Expenses",
    subtitle: "Petty cash and operating costs, and where the money goes.",
  },
} as const;

export type AnalyticsSection = keyof typeof ANALYTICS_SECTIONS;

export function isAnalyticsSection(value: string): value is AnalyticsSection {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_SECTIONS, value);
}
