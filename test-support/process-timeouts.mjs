// Synthetic startup can be slow under concurrent native Windows test load.
// Keep these test budgets separate from the product's configurable deadlines.
export const SUBPROCESS_TIMEOUT_MS = 5000;
export const CLEANUP_TIMEOUT_MS = 3000;
