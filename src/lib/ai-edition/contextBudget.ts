/** A user-selected reference for the history meter, not a provider context limit. */
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 80_000;
export const MIN_CONTEXT_BUDGET_TOKENS = 1_000;
export const MAX_CONTEXT_BUDGET_TOKENS = 2_000_000;

export function isValidContextBudget(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= MIN_CONTEXT_BUDGET_TOKENS &&
		value <= MAX_CONTEXT_BUDGET_TOKENS
	);
}

export function resolveContextBudget(value: unknown): number {
	return isValidContextBudget(value) ? value : DEFAULT_CONTEXT_BUDGET_TOKENS;
}
