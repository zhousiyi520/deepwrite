/**
 * Friendly, user-facing CLI failure. Caught once in main.ts and printed
 * without a stack trace; anything else surfaces as a generic failure.
 */
export class CliError extends Error {}
