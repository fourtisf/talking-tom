/**
 * The capability token that unlocks currency mutation on `GameState`.
 *
 * `Economy.ts` is the ONLY module allowed to import this. That is enforced two
 * ways: `eslint.config.js` restricts the import path, and `GameState` throws at
 * runtime if the token does not match. Spec §7 / §15.
 */
export const CURRENCY_MUTATION_KEY: unique symbol = Symbol('biskit.economy-only');

export type CurrencyMutationKey = typeof CURRENCY_MUTATION_KEY;
