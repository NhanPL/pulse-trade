import type { CashBalance } from "./cash-balance";

// The USD total matches the K02 Cash Balance sample; neither fixture is account data.
export const CASH_BALANCE_PREVIEW = {
  available: "18642.30",
  locked: "0.00",
} satisfies CashBalance;
