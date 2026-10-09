import {
  SAMPLER_FIELD_ORDER,
  type SamplerFieldKey,
  type SamplerSettings
} from "@deepwrite/contracts";

/**
 * llama.cpp request keys for the sampler overrides, keyed by the camelCase
 * contract field. The table is exhaustive over `SamplerFieldKey`: adding a
 * contract field fails this `satisfies` check until the request mapping is
 * extended, so the two vocabularies cannot drift apart.
 */
const SAMPLER_REQUEST_KEYS = {
  dryMultiplier: "dry_multiplier",
  dryBase: "dry_base",
  dryAllowedLength: "dry_allowed_length",
  dryPenaltyLastN: "dry_penalty_last_n",
  xtcProbability: "xtc_probability",
  xtcThreshold: "xtc_threshold",
  minP: "min_p"
} as const satisfies Record<SamplerFieldKey, string>;

/**
 * Maps configured sampler overrides to the `samplingParams` request record.
 * A present key is sent even when its value is 0 (0 = explicitly off); only
 * an absent key is omitted. Returns undefined when nothing is configured.
 */
export function toSamplingParams(
  sampler?: SamplerSettings
): Record<string, unknown> | undefined {
  if (sampler === undefined) {
    return undefined;
  }
  const params: Record<string, unknown> = {};
  for (const camelKey of SAMPLER_FIELD_ORDER) {
    const value = sampler[camelKey];
    if (value !== undefined) {
      params[SAMPLER_REQUEST_KEYS[camelKey]] = value;
    }
  }
  return Object.keys(params).length > 0 ? params : undefined;
}
