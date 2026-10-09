import { describe, expect, it } from "vitest";
import {
  AgentProviderRuntimeConfigSchema,
  BUILT_IN_REASONING_LEVELS,
  ModelConfigSchema,
  SAMPLER_FIELD_BOUNDS,
  SAMPLER_FIELD_ORDER,
  SamplerSettingsSchema,
  ShortAgentSubagentDefinitionSchema,
  hasSamplerSettings,
  resolveEffectiveSamplerSettings,
  type SamplerFieldKey
} from "./index";

const modelBase = {
  id: "model-1",
  label: "测试模型",
  provider: "示例供应商",
  modelId: "test-model",
  api: "openai-completions",
  baseUrl: "https://api.example.test/v1",
  reasoning: false,
  defaultThinkingLevel: "off"
} as const;

const subagentBase = {
  id: "sub_a",
  name: "采样子智能体",
  description: "验证 sampler 字段兼容旧数据。",
  systemPrompt: "只用于契约测试。",
  enabled: true
};

function expectFieldRejected(key: SamplerFieldKey, value: number): void {
  const result = SamplerSettingsSchema.safeParse({ [key]: value });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.path[0] === key)).toBe(
      true
    );
  }
}

describe("SamplerSettingsSchema", () => {
  it("accepts the minimum bound of every field", () => {
    const values = {
      dryMultiplier: 0,
      dryBase: 1,
      dryAllowedLength: 0,
      dryPenaltyLastN: -1,
      xtcProbability: 0,
      xtcThreshold: 0,
      minP: 0
    };
    expect(SamplerSettingsSchema.parse(values)).toEqual(values);
  });

  it("accepts the maximum bound of every field", () => {
    const values = {
      dryMultiplier: 10,
      dryBase: 4,
      dryAllowedLength: 32,
      dryPenaltyLastN: 16_384,
      xtcProbability: 1,
      xtcThreshold: 0.5,
      minP: 1
    };
    expect(SamplerSettingsSchema.parse(values)).toEqual(values);
  });

  it.each([
    ["dryMultiplier", -0.1],
    ["dryMultiplier", 10.1],
    ["dryBase", 0.5],
    ["dryBase", 4.5],
    ["dryAllowedLength", -1],
    ["dryAllowedLength", 33],
    ["dryAllowedLength", 1.5],
    ["dryPenaltyLastN", -2],
    ["dryPenaltyLastN", 16_385],
    ["dryPenaltyLastN", 0.5],
    ["xtcProbability", -0.1],
    ["xtcProbability", 1.1],
    ["xtcThreshold", -0.1],
    ["xtcThreshold", 0.7],
    ["minP", -0.1],
    ["minP", 1.1]
  ] as const)("rejects %s = %s", (key, value) => {
    expectFieldRejected(key, value);
  });

  it("reports the offending field in the issue path", () => {
    const result = SamplerSettingsSchema.safeParse({ xtcThreshold: 0.7 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["xtcThreshold"]);
    }
  });

  it("parses to an empty object when every key is absent", () => {
    expect(SamplerSettingsSchema.parse({})).toEqual({});
  });
});

describe("old-data compatibility without sampler", () => {
  it("parses a model entry exactly as before the field existed", () => {
    const parsed = ModelConfigSchema.parse({ ...modelBase, hasApiKey: true });
    expect(parsed).toEqual({
      ...modelBase,
      hasApiKey: true,
      thinkingLevelOptions: [...BUILT_IN_REASONING_LEVELS],
      temperatureOptions: [0.1, 0.7, 1]
    });
    expect("sampler" in parsed).toBe(false);
  });

  it("parses a subagent definition exactly as before the field existed", () => {
    const parsed = ShortAgentSubagentDefinitionSchema.parse(subagentBase);
    expect(parsed).toEqual({
      ...subagentBase,
      agentMode: "standard",
      modelMode: "inherit"
    });
    expect("sampler" in parsed).toBe(false);
  });
});

describe("AgentProviderRuntimeConfig with sampler", () => {
  it("round-trips a runtime config carrying sampler values", () => {
    const parsed = AgentProviderRuntimeConfigSchema.parse({
      ...modelBase,
      apiKey: "sk-test-placeholder-invalid",
      sampler: { dryMultiplier: 0.8, dryPenaltyLastN: -1 }
    });
    expect(parsed.sampler).toEqual({ dryMultiplier: 0.8, dryPenaltyLastN: -1 });
    expect(parsed.apiKey).toBe("sk-test-placeholder-invalid");
  });

  it("keeps sampler absent for a legacy runtime config payload", () => {
    const parsed = AgentProviderRuntimeConfigSchema.parse({
      ...modelBase,
      apiKey: "sk-test-placeholder-invalid"
    });
    expect("sampler" in parsed).toBe(false);
  });
});

describe("resolveEffectiveSamplerSettings", () => {
  it("returns the model keys when only the model has sampler", () => {
    const model = { dryMultiplier: 1.2, dryPenaltyLastN: -1, minP: 0.05 };
    expect(resolveEffectiveSamplerSettings(model, undefined)).toEqual(model);
  });

  it("returns the subagent keys when only the subagent has sampler", () => {
    const subagent = { xtcProbability: 0.5, xtcThreshold: 0.2 };
    expect(resolveEffectiveSamplerSettings(undefined, subagent)).toEqual(
      subagent
    );
  });

  it("overrides only the keys the subagent sets and keeps model keys", () => {
    expect(
      resolveEffectiveSamplerSettings(
        { dryMultiplier: 1.2, dryBase: 2, minP: 0.05 },
        { dryBase: 3, xtcProbability: 0.5 }
      )
    ).toEqual({
      dryMultiplier: 1.2,
      dryBase: 3,
      xtcProbability: 0.5,
      minP: 0.05
    });
  });

  it("returns {} when both inputs are undefined", () => {
    expect(resolveEffectiveSamplerSettings(undefined, undefined)).toEqual({});
  });

  it("returns {} when both inputs are empty objects", () => {
    expect(resolveEffectiveSamplerSettings({}, {})).toEqual({});
  });

  it("sends a subagent 0 as a real value over the model setting", () => {
    expect(
      resolveEffectiveSamplerSettings(
        { dryMultiplier: 1.2 },
        { dryMultiplier: 0 }
      )
    ).toEqual({ dryMultiplier: 0 });
    expect(hasSamplerSettings({ dryMultiplier: 0 })).toBe(true);
  });
});

describe("hasSamplerSettings", () => {
  it("is false for undefined and for empty settings", () => {
    expect(hasSamplerSettings(undefined)).toBe(false);
    expect(hasSamplerSettings({})).toBe(false);
  });

  it("is true when any key is present, including 0 and -1", () => {
    expect(hasSamplerSettings({ dryAllowedLength: 0 })).toBe(true);
    expect(hasSamplerSettings({ dryPenaltyLastN: -1 })).toBe(true);
  });
});

describe("SAMPLER_FIELD_ORDER", () => {
  it("lists exactly the bounded keys in UI order", () => {
    expect([...SAMPLER_FIELD_ORDER].sort()).toEqual(
      Object.keys(SAMPLER_FIELD_BOUNDS).sort()
    );
    expect(SAMPLER_FIELD_ORDER).toEqual([
      "dryMultiplier",
      "dryBase",
      "dryAllowedLength",
      "dryPenaltyLastN",
      "xtcProbability",
      "xtcThreshold",
      "minP"
    ]);
  });
});
