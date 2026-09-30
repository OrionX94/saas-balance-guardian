export type BalanceState = "healthy" | "recharge_due";

export function balanceState(balance: number, triggerBalance: number): BalanceState {
  return balance <= triggerBalance ? "recharge_due" : "healthy";
}
