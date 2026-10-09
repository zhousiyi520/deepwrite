import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SAMPLER_FIELD_BOUNDS,
  SAMPLER_FIELD_ORDER,
  type SamplerFieldKey,
  type SamplerSettings
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import {
  collectSamplerFieldTexts,
  createSamplerFieldTexts,
  diffSamplerSettings,
  parseSamplerFieldTexts,
  samplerFieldHints,
  samplerFieldLabels,
  type SamplerFieldTexts
} from "./modelSamplerFields";

function emptyTexts(): SamplerFieldTexts {
  return createSamplerFieldTexts(undefined);
}

function texts(
  partial: Partial<Record<SamplerFieldKey, string>>
): SamplerFieldTexts {
  return { ...emptyTexts(), ...partial };
}

function samplerOf(
  partial: Partial<Record<SamplerFieldKey, number>>
): SamplerSettings {
  return partial as SamplerSettings;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ModelSamplerFields hydration", () => {
  it("keeps every input empty for a model without sampler overrides", () => {
    const texts = createSamplerFieldTexts(undefined);
    expect(Object.keys(texts)).toEqual([...SAMPLER_FIELD_ORDER]);
    expect(Object.values(texts).every((raw) => raw === "")).toBe(true);
  });

  it("hydrates saved values including 0 and -1 as typed text", () => {
    const texts = createSamplerFieldTexts(
      samplerOf({
        dryMultiplier: 0,
        dryBase: 4,
        dryPenaltyLastN: -1,
        minP: 0.5
      })
    );
    expect(texts.dryMultiplier).toBe("0");
    expect(texts.dryBase).toBe("4");
    expect(texts.dryPenaltyLastN).toBe("-1");
    expect(texts.minP).toBe("0.5");
    expect(texts.dryAllowedLength).toBe("");
    expect(texts.xtcProbability).toBe("");
    expect(texts.xtcThreshold).toBe("");
  });

  it("labels every field and documents bounds plus the 0/-1 semantics", () => {
    for (const key of SAMPLER_FIELD_ORDER) {
      expect(samplerFieldLabels[key].length).toBeGreaterThan(0);
      const hint = samplerFieldHints[key];
      expect(hint).toContain(String(SAMPLER_FIELD_BOUNDS[key].min));
      expect(hint).toContain(String(SAMPLER_FIELD_BOUNDS[key].max));
    }
    expect(samplerFieldHints.dryMultiplier).toContain("0");
    expect(samplerFieldHints.xtcProbability).toContain("0");
    expect(samplerFieldHints.xtcThreshold).toContain("0.5");
    expect(samplerFieldHints.dryPenaltyLastN).toContain("-1");
  });
});

describe("ModelSamplerFields collection", () => {
  it("collects filled fields into the payload with keys matching inputs", () => {
    const result = parseSamplerFieldTexts(
      texts({
        dryMultiplier: "0.9",
        dryBase: "2",
        dryAllowedLength: "4",
        dryPenaltyLastN: "-1",
        xtcProbability: "0.1",
        xtcThreshold: "0.5",
        minP: "0.05"
      })
    );
    expect(result).toEqual({
      ok: true,
      sampler: samplerOf({
        dryMultiplier: 0.9,
        dryBase: 2,
        dryAllowedLength: 4,
        dryPenaltyLastN: -1,
        xtcProbability: 0.1,
        xtcThreshold: 0.5,
        minP: 0.05
      })
    });
  });

  it("drops cleared keys from the payload instead of storing 0", () => {
    const result = parseSamplerFieldTexts(
      texts({ dryMultiplier: "1", minP: "0.2" })
    );
    expect(result.ok).toBe(true);
    if (!result.ok || !result.sampler) return;
    expect(Object.keys(result.sampler).sort()).toEqual([
      "dryMultiplier",
      "minP"
    ]);
    expect("xtcThreshold" in result.sampler).toBe(false);
    expect("xtcProbability" in result.sampler).toBe(false);
  });

  it("keeps 0 and -1 as valid sent values instead of treating them as unset", () => {
    const result = parseSamplerFieldTexts(
      texts({ dryMultiplier: "0", dryPenaltyLastN: "-1", xtcProbability: "0" })
    );
    expect(result).toEqual({
      ok: true,
      sampler: samplerOf({
        dryMultiplier: 0,
        dryPenaltyLastN: -1,
        xtcProbability: 0
      })
    });
  });

  it("resolves all-empty inputs to undefined so nothing is sent", () => {
    expect(parseSamplerFieldTexts(emptyTexts())).toEqual({
      ok: true,
      sampler: undefined
    });
  });

  it("trims whitespace and accepts a full-width minus sign", () => {
    expect(parseSamplerFieldTexts(texts({ minP: " 0.5 " }))).toEqual({
      ok: true,
      sampler: samplerOf({ minP: 0.5 })
    });
    expect(
      parseSamplerFieldTexts(texts({ dryPenaltyLastN: "\u22121" }))
    ).toEqual({
      ok: true,
      sampler: samplerOf({ dryPenaltyLastN: -1 })
    });
  });
});

describe("ModelSamplerFields validation", () => {
  it.each(["abc", "1,5", "1e3", "0.5x", "+"])(
    "rejects %s as an invalid number",
    (raw) => {
      const result = parseSamplerFieldTexts(texts({ minP: raw }));
      expect(result).toEqual({
        ok: false,
        issue: { key: "minP", reason: "invalid" }
      });
    }
  );

  it.each([
    ["dryMultiplier", "-0.1"],
    ["dryMultiplier", "10.1"],
    ["dryBase", "0.5"],
    ["dryBase", "4.5"],
    ["dryAllowedLength", "33"],
    ["dryPenaltyLastN", "-2"],
    ["dryPenaltyLastN", "16385"],
    ["xtcProbability", "1.5"],
    ["xtcThreshold", "0.6"],
    ["minP", "1.2"]
  ] as const)("rejects %s = %s as out of bounds", (key, raw) => {
    const result = parseSamplerFieldTexts(texts({ [key]: raw }));
    expect(result).toEqual({
      ok: false,
      issue: { key, reason: "bounds" }
    });
  });

  it.each([
    ["dryAllowedLength", "1.5"],
    ["dryPenaltyLastN", "0.5"]
  ] as const)("rejects %s = %s as a non-integer", (key, raw) => {
    const result = parseSamplerFieldTexts(texts({ [key]: raw }));
    expect(result).toEqual({
      ok: false,
      issue: { key, reason: "integer" }
    });
  });
});

describe("ModelSamplerFields save blocking", () => {
  it("blocks an xtcThreshold of 0.7 with a toast naming the field and bound", () => {
    const warning = vi.spyOn(uiMessage, "warning");
    const result = collectSamplerFieldTexts(
      texts({ xtcThreshold: "0.7", minP: "0.2" })
    );
    expect(result).toEqual({ ok: false });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(samplerFieldLabels.xtcThreshold)
    );
    const content = warning.mock.calls[0]![0]!;
    expect(content).toContain("0.5");
  });

  it("reports only the first invalid field in display order per attempt", () => {
    const warning = vi.spyOn(uiMessage, "warning");
    const result = collectSamplerFieldTexts(
      texts({ dryBase: "0.5", xtcThreshold: "0.7" })
    );
    expect(result).toEqual({ ok: false });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(samplerFieldLabels.dryBase)
    );
  });

  it("collects valid input without any toast", () => {
    const warning = vi.spyOn(uiMessage, "warning");
    const result = collectSamplerFieldTexts(texts({ dryMultiplier: "0" }));
    expect(result).toEqual({ ok: true, sampler: { dryMultiplier: 0 } });
    expect(warning).not.toHaveBeenCalled();
  });
});

describe("diffSamplerSettings", () => {
  it("keeps only the keys that differ from the model-level sampler", () => {
    const model = samplerOf({ dryMultiplier: 0.5, xtcProbability: 0.2 });
    expect(
      diffSamplerSettings(
        model,
        samplerOf({ dryMultiplier: 0.8, xtcProbability: 0.2, minP: 0.05 })
      )
    ).toEqual({ dryMultiplier: 0.8, minP: 0.05 });
  });

  it("collapses to undefined when every key matches or is unset", () => {
    const model = samplerOf({ dryMultiplier: 0.5 });
    expect(
      diffSamplerSettings(model, samplerOf({ dryMultiplier: 0.5 }))
    ).toBeUndefined();
    expect(diffSamplerSettings(model, undefined)).toBeUndefined();
    expect(diffSamplerSettings(undefined, undefined)).toBeUndefined();
  });

  it("treats 0 and -1 as real override values", () => {
    expect(
      diffSamplerSettings(
        samplerOf({ dryMultiplier: 0 }),
        samplerOf({ dryMultiplier: 0 })
      )
    ).toBeUndefined();
    expect(
      diffSamplerSettings(
        undefined,
        samplerOf({ dryMultiplier: 0, dryPenaltyLastN: -1 })
      )
    ).toEqual({ dryMultiplier: 0, dryPenaltyLastN: -1 });
  });
});
