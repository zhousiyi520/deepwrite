import { createScopedTranslator } from "../i18n";
import {
  SAMPLER_FIELD_BOUNDS,
  SAMPLER_FIELD_ORDER,
  type SamplerFieldKey,
  type SamplerSettings
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("components.modelSamplerFields");

/** Raw text state of the seven sampler inputs, keyed in display order. */
export type SamplerFieldTexts = Record<SamplerFieldKey, string>;

const INTEGER_SAMPLER_FIELDS: ReadonlySet<SamplerFieldKey> = new Set([
  "dryAllowedLength",
  "dryPenaltyLastN"
]);

/** Hydrates input texts from saved values; unset keys become empty strings. */
export function createSamplerFieldTexts(
  sampler?: SamplerSettings | undefined
): SamplerFieldTexts {
  const texts = {} as SamplerFieldTexts;
  for (const key of SAMPLER_FIELD_ORDER) {
    const value = sampler?.[key];
    texts[key] = value === undefined ? "" : String(value);
  }
  return texts;
}

/** Getters keep the translated labels live across language switches. */
export const samplerFieldLabels: Record<SamplerFieldKey, string> = {
  get dryMultiplier() {
    return t("dryMultiplier");
  },
  get dryBase() {
    return t("dryBase");
  },
  get dryAllowedLength() {
    return t("dryAllowedLength");
  },
  get dryPenaltyLastN() {
    return t("dryPenaltyLastN");
  },
  get xtcProbability() {
    return t("xtcProbability");
  },
  get xtcThreshold() {
    return t("xtcThreshold");
  },
  get minP() {
    return t("minP");
  }
};

export const samplerFieldHints: Record<SamplerFieldKey, string> = {
  get dryMultiplier() {
    return t("dryMultiplierHint");
  },
  get dryBase() {
    return t("dryBaseHint");
  },
  get dryAllowedLength() {
    return t("dryAllowedLengthHint");
  },
  get dryPenaltyLastN() {
    return t("dryPenaltyLastNHint");
  },
  get xtcProbability() {
    return t("xtcProbabilityHint");
  },
  get xtcThreshold() {
    return t("xtcThresholdHint");
  },
  get minP() {
    return t("minPHint");
  }
};

export const samplerGroupTitle = (): string => t("samplerOverrides");
export const samplerGroupNote = (): string => t("emptyItemsAreNotSent");

export type SamplerFieldIssue = {
  key: SamplerFieldKey;
  reason: "invalid" | "integer" | "bounds";
};

export type SamplerParseResult =
  | { ok: true; sampler: SamplerSettings | undefined }
  | { ok: false; issue: SamplerFieldIssue };

/**
 * Filled inputs (including 0 and -1) become payload keys; empty inputs stay
 * unset. The first invalid field aborts with a located issue.
 */
export function parseSamplerFieldTexts(
  texts: SamplerFieldTexts
): SamplerParseResult {
  const sampler: SamplerSettings = {};
  let filled = false;
  for (const key of SAMPLER_FIELD_ORDER) {
    const raw = (texts[key] ?? "").trim().replace(/\u2212/g, "-");
    if (!raw) continue;
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(raw)) {
      return { ok: false, issue: { key, reason: "invalid" } };
    }
    const value = Number(raw);
    if (INTEGER_SAMPLER_FIELDS.has(key) && !Number.isInteger(value)) {
      return { ok: false, issue: { key, reason: "integer" } };
    }
    const bounds = SAMPLER_FIELD_BOUNDS[key];
    if (value < bounds.min || value > bounds.max) {
      return { ok: false, issue: { key, reason: "bounds" } };
    }
    sampler[key] = value;
    filled = true;
  }
  return { ok: true, sampler: filled ? sampler : undefined };
}

export type SamplerCollectResult =
  { ok: true; sampler: SamplerSettings | undefined } | { ok: false };

/**
 * Keeps only the keys where the collected value differs from the model-level
 * sampler, so a subagent override stores just the keys it actually replaces.
 * All-equal or empty collections collapse to `undefined` (no override key).
 */
export function diffSamplerSettings(
  base: SamplerSettings | undefined,
  value: SamplerSettings | undefined
): SamplerSettings | undefined {
  const diff: SamplerSettings = {};
  let differs = false;
  for (const key of SAMPLER_FIELD_ORDER) {
    const current = value?.[key];
    if (current === undefined || Object.is(current, base?.[key])) continue;
    diff[key] = current;
    differs = true;
  }
  return differs ? diff : undefined;
}

/** Public surface of ModelSamplerFields.vue for template refs and reuse. */
export interface ModelSamplerFieldsInstance {
  /** Validates all inputs, toasting on the first invalid one. */
  collectSampler(): SamplerCollectResult;
}

/** Parse plus toast feedback on the first invalid field; never blocks layout. */
export function collectSamplerFieldTexts(
  texts: SamplerFieldTexts
): SamplerCollectResult {
  const result = parseSamplerFieldTexts(texts);
  if (result.ok) return result;
  const { key, reason } = result.issue;
  const bounds = SAMPLER_FIELD_BOUNDS[key];
  if (reason === "invalid") {
    uiMessage.warning(
      t("enterAValidNumberFor", { arg0: samplerFieldLabels[key] })
    );
  } else if (reason === "integer") {
    uiMessage.warning(
      t("enterAnIntegerBetweenValueAndValue", {
        arg0: samplerFieldLabels[key],
        arg1: bounds.min,
        arg2: bounds.max
      })
    );
  } else {
    uiMessage.warning(
      t("enterAValueBetweenValueAndValue", {
        arg0: samplerFieldLabels[key],
        arg1: bounds.min,
        arg2: bounds.max
      })
    );
  }
  return { ok: false };
}
