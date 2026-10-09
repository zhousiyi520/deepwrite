import { describe, expect, it } from "vitest";
import type {
  ModelConfig,
  ShortAgentSubagentDefinition
} from "@deepwrite/contracts";
import { useSubagentModelConfig } from "./useSubagentModelConfig";

const opus = {
  id: "model-opus",
  label: "Opus",
  thinkingLevelOptions: ["low", "high"],
  temperatureOptions: [0.2, 0.6, 1],
  defaultThinkingLevel: "high"
} as unknown as ModelConfig;
const sonnet = {
  id: "model-sonnet",
  label: "Sonnet",
  thinkingLevelOptions: ["medium"],
  temperatureOptions: [0.3, 0.9],
  defaultThinkingLevel: "medium"
} as unknown as ModelConfig;

function subagent(
  overrides: Partial<ShortAgentSubagentDefinition> = {}
): ShortAgentSubagentDefinition {
  return {
    id: "subagent_a",
    name: "连续性审阅",
    description: "检查前后一致性",
    systemPrompt: "只核对设定。",
    enabled: true,
    agentMode: "standard",
    modelMode: "inherit",
    ...overrides
  };
}

function setup(disabled = false, preferredModelId?: () => string | null) {
  return useSubagentModelConfig({
    models: () => [opus, sonnet],
    disabled: () => disabled,
    ...(preferredModelId ? { preferredModelId } : {})
  });
}

describe("useSubagentModelConfig", () => {
  it("lists configured models and builds reasoning options from the chosen model", () => {
    const config = setup();
    expect(config.modelOptions.value.map((option) => option.value)).toEqual([
      "model-opus",
      "model-sonnet"
    ]);
    expect(
      config
        .thinkingOptionsFor(subagent({ modelId: "model-sonnet" }))
        .map((option) => option.value)
    ).toEqual(["off", "medium"]);
    // Without a model the editor still offers every built-in level.
    expect(config.thinkingOptionsFor(subagent())[0]?.value).toBe("off");
    expect(config.thinkingOptionsFor(subagent()).length).toBeGreaterThan(2);
    expect(
      config
        .temperatureOptionsFor(subagent({ modelId: "model-opus" }))
        .map((option) => option.value)
    ).toEqual([0.2, 0.6, 1]);
  });

  it("switching to a separate model picks the first model with its defaults", () => {
    const config = setup();
    const item = subagent();
    config.setModelMode(item, "custom");
    expect(item).toMatchObject({
      modelMode: "custom",
      modelId: "model-opus",
      thinkingLevel: "high",
      temperature: 0.6
    });
  });

  it("switching back to the primary agent model drops the separate settings", () => {
    const config = setup();
    const item = subagent({
      modelMode: "custom",
      modelId: "model-opus",
      thinkingLevel: "off",
      temperature: 1
    });
    config.setModelMode(item, "inherit");
    expect(item.modelMode).toBe("inherit");
    expect(item).not.toHaveProperty("modelId");
    expect(item).not.toHaveProperty("thinkingLevel");
    expect(item).not.toHaveProperty("temperature");
  });

  it("applies the defaults of a newly selected model", () => {
    const config = setup();
    const item = subagent({ modelMode: "custom", modelId: "model-opus" });
    config.setModelId(item, "model-sonnet");
    expect(item).toMatchObject({
      modelId: "model-sonnet",
      thinkingLevel: "medium",
      temperature: 0.9
    });
  });

  it("keeps a valid temperature but repairs an invalid one when reasoning is turned off", () => {
    const config = setup();
    const valid = subagent({
      modelMode: "custom",
      modelId: "model-opus",
      thinkingLevel: "high",
      temperature: 1
    });
    config.setThinkingLevel(valid, "off");
    expect(valid).toMatchObject({ thinkingLevel: "off", temperature: 1 });

    const invalid = subagent({
      modelMode: "custom",
      modelId: "model-opus",
      thinkingLevel: "high",
      temperature: 0.45
    });
    config.setThinkingLevel(invalid, "off");
    expect(invalid.temperature).toBe(0.6);
  });

  it("ignores edits while the form is disabled", () => {
    const config = setup(true);
    const item = subagent();
    config.setModelMode(item, "custom");
    config.setModelId(item, "model-sonnet");
    config.setThinkingLevel(item, "off");
    config.setTemperature(item, 1);
    expect(item).toEqual(subagent());
  });

  it("stores and clears sampler overrides without touching other settings", () => {
    const config = setup();
    const item = subagent({ modelMode: "custom", modelId: "model-opus" });
    config.setSampler(item, { dryMultiplier: 0.8 });
    expect(item.sampler).toEqual({ dryMultiplier: 0.8 });
    expect(item.modelId).toBe("model-opus");
    config.setSampler(item, undefined);
    expect(item).not.toHaveProperty("sampler");
  });

  it("ignores sampler edits while the form is disabled", () => {
    const config = setup(true);
    const item = subagent();
    config.setSampler(item, { dryMultiplier: 0.8 });
    expect(item).not.toHaveProperty("sampler");
  });

  it("resolves the effective sampler from the selected or preferred model", () => {
    const withSampler = {
      ...sonnet,
      sampler: { dryMultiplier: 0.5 }
    } as unknown as ModelConfig;
    const config = useSubagentModelConfig({
      models: () => [opus, withSampler],
      disabled: () => false,
      preferredModelId: () => "model-sonnet"
    });
    // Custom mode: the selected entry's sampler.
    expect(
      config.modelSamplerFor(
        subagent({ modelMode: "custom", modelId: "model-sonnet" })
      )
    ).toEqual({ dryMultiplier: 0.5 });
    // Inherit mode: the workspace's preferred model.
    expect(config.modelSamplerFor(subagent())).toEqual({ dryMultiplier: 0.5 });
    // No preferred model, or a model without sampler settings.
    const plain = setup();
    expect(plain.modelSamplerFor(subagent())).toBeUndefined();
    expect(
      plain.modelSamplerFor(
        subagent({ modelMode: "custom", modelId: "model-opus" })
      )
    ).toBeUndefined();
  });

  it("summarises how the subagent picks its model", () => {
    const config = setup();
    const inherited = config.subagentModelSummary(subagent());
    const unselected = config.subagentModelSummary(
      subagent({ modelMode: "custom" })
    );
    const high = config.subagentModelSummary(
      subagent({
        modelMode: "custom",
        modelId: "model-opus",
        thinkingLevel: "high"
      })
    );
    const off = config.subagentModelSummary(
      subagent({
        modelMode: "custom",
        modelId: "model-opus",
        thinkingLevel: "off",
        temperature: 0.6
      })
    );
    expect(new Set([inherited, unselected, high, off]).size).toBe(4);
    expect(high).toContain("Opus");
    expect(off).toContain("Opus");
    expect(off).toContain("0.6");
  });
});
