import { z } from "zod";

/**
 * Per-field bounds for the sampler overrides, keyed in UI display order.
 * Field names are camelCase here; the llama.cpp request mapping
 * (`dry_multiplier` etc.) happens at the runtime boundary, not in contracts.
 */
export const SAMPLER_FIELD_BOUNDS = {
  /** DRY sequence multiplier. 0 = DRY explicitly off, which is still sent. */
  dryMultiplier: { min: 0, max: 10 },
  dryBase: { min: 1, max: 4 },
  dryAllowedLength: { min: 0, max: 32 },
  /** -1 = derive the DRY window from the context length. */
  dryPenaltyLastN: { min: -1, max: 16_384 },
  xtcProbability: { min: 0, max: 1 },
  xtcThreshold: { min: 0, max: 0.5 },
  minP: { min: 0, max: 1 }
} as const;

export type SamplerFieldKey = keyof typeof SAMPLER_FIELD_BOUNDS;

/** UI display order of the sampler override fields. */
export const SAMPLER_FIELD_ORDER: readonly SamplerFieldKey[] = [
  "dryMultiplier",
  "dryBase",
  "dryAllowedLength",
  "dryPenaltyLastN",
  "xtcProbability",
  "xtcThreshold",
  "minP"
];

function boundedNumber({
  min,
  max
}: {
  min: number;
  max: number;
}): z.ZodNumber {
  return z.number().finite().min(min).max(max);
}

/**
 * Sampler overrides (DRY / XTC / min-p). Sending semantics: a present key is
 * sent even when its value is 0 (0 = explicitly off); only an absent key
 * means "not configured", so fields are `.optional()` instead of defaulted.
 */
export const SamplerSettingsSchema = z.object({
  dryMultiplier: boundedNumber(SAMPLER_FIELD_BOUNDS.dryMultiplier).optional(),
  dryBase: boundedNumber(SAMPLER_FIELD_BOUNDS.dryBase).optional(),
  dryAllowedLength: boundedNumber(SAMPLER_FIELD_BOUNDS.dryAllowedLength)
    .int()
    .optional(),
  dryPenaltyLastN: boundedNumber(SAMPLER_FIELD_BOUNDS.dryPenaltyLastN)
    .int()
    .optional(),
  xtcProbability: boundedNumber(SAMPLER_FIELD_BOUNDS.xtcProbability).optional(),
  xtcThreshold: boundedNumber(SAMPLER_FIELD_BOUNDS.xtcThreshold).optional(),
  minP: boundedNumber(SAMPLER_FIELD_BOUNDS.minP).optional()
});
export type SamplerSettings = z.infer<typeof SamplerSettingsSchema>;

/**
 * Per-key `subagent ?? model` merge: a subagent override replaces the model
 * value key by key, keys it omits stay at the model level, and two absent
 * inputs resolve to `{}`. 0 counts as a value, never as unset.
 */
export function resolveEffectiveSamplerSettings(
  modelSampler?: SamplerSettings | undefined,
  subagentSampler?: SamplerSettings | undefined
): SamplerSettings {
  const effective: SamplerSettings = {};
  for (const key of SAMPLER_FIELD_ORDER) {
    const value = subagentSampler?.[key] ?? modelSampler?.[key];
    if (value !== undefined) {
      effective[key] = value;
    }
  }
  return effective;
}

/** True when at least one sampler key is configured (0 counts as set). */
export function hasSamplerSettings(
  sampler?: SamplerSettings | undefined
): boolean {
  if (sampler === undefined) {
    return false;
  }
  return SAMPLER_FIELD_ORDER.some((key) => sampler[key] !== undefined);
}
