export const EXPENSE_CATEGORIES = [
  ["food", "Food & drink"], ["taxi", "Taxi & rideshare"], ["transport", "Train, flight, public transport"],
  ["car", "Fuel & parking"], ["hotel", "Hotel"], ["materials", "Cables & materials"], ["tools", "Tools & equipment"],
  ["software", "Software & subscriptions"], ["phone", "Phone & internet"], ["other", "Other"],
] as const;
export const categoryLabel = (k: string) => EXPENSE_CATEGORIES.find(([id]) => id === k)?.[1] ?? "Other";
