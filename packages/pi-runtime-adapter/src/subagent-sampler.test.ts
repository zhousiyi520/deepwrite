import type { StreamFn } from "@earendil-works/pi-agent-core";
import type {
  AgentProviderRuntimeConfig,
  SamplerSettings
} from "@deepwrite/contracts";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  buildProviderRuntime,
  resolveRunSamplingValues,
  toPiThinkingLevel
} from "./provider-runtime";
import {
  buildParentSamplerRuntimeSpec,
  resolveSubagentModel
} from "./subagent-model";
import type { BuildSpawnSubagentToolInput } from "./subagent-runtime";

function runtimeConfig(
  overrides: Partial<AgentProviderRuntimeConfig>
): AgentProviderRuntimeConfig {
  return {
    id: "sampler-model",
    label: "Sampler model",
    provider: "deepseek",
    modelId: "deepseek-chat",
    api: "openai-completions",
    baseUrl: "https://provider.example.test/v1",
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["low", "high", "max"],
    temperatureOptions: [0.2, 0.6, 1.1],
    apiKey: "invalid-test-key",
    ...overrides
  };
}

const SAMPLING_BODY_KEYS = [
  "dry_multiplier",
  "dry_base",
  "dry_allowed_length",
  "dry_penalty_last_n",
  "xtc_probability",
  "xtc_threshold",
  "min_p"
] as const;

/** Captures the serialized request body, aborting the stream at onPayload. */
async function capturePayload(
  streamFn: StreamFn,
  model: Model<Api>
): Promise<Record<string, unknown>> {
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Reply with OK only.",
      messages: [{ role: "user", content: "OK", timestamp: Date.now() }]
    },
    {
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

type SpawnInputOverrides = {
  [K in keyof BuildSpawnSubagentToolInput]?:
    BuildSpawnSubagentToolInput[K] | undefined;
};

function spawnInput(
  overrides: SpawnInputOverrides = {}
): BuildSpawnSubagentToolInput {
  const { model, streamFn } = buildProviderRuntime(runtimeConfig({}));
  return {
    parentSessionId: "sampler-parent-session",
    model,
    thinkingLevel: "off",
    streamFn,
    definitions: [],
    buildChildTools: () => [],
    ...(overrides.parentSamplerRuntime
      ? { parentSamplerRuntime: overrides.parentSamplerRuntime }
      : {}),
    ...(overrides.subagentRuntimeConfigs
      ? { subagentRuntimeConfigs: overrides.subagentRuntimeConfigs }
      : {}),
    ...(overrides.buildCustomModelRuntime
      ? { buildCustomModelRuntime: overrides.buildCustomModelRuntime }
      : {})
  };
}

/** Mirrors the run-tools.ts buildCustomModelRuntime implementation. */
function customRuntimeBuilder(): {
  build: NonNullable<BuildSpawnSubagentToolInput["buildCustomModelRuntime"]>;
  receivedConfigs: AgentProviderRuntimeConfig[];
} {
  const receivedConfigs: AgentProviderRuntimeConfig[] = [];
  return {
    receivedConfigs,
    build: (config, options) => {
      receivedConfigs.push(config);
      const childThinking =
        options?.thinkingLevel ?? config.defaultThinkingLevel ?? "medium";
      const childTemperature =
        childThinking === "off"
          ? (options?.temperature ?? config.temperatureOptions[1])
          : undefined;
      const childRuntime = buildProviderRuntime(
        config,
        childTemperature,
        childThinking,
        {}
      );
      return {
        model: childRuntime.model,
        streamFn: childRuntime.streamFn,
        thinkingLevel: toPiThinkingLevel(childThinking)
      };
    }
  };
}

describe("buildParentSamplerRuntimeSpec", () => {
  it("carries the parent config with its run-effective sampling values", () => {
    const parent = runtimeConfig({ defaultThinkingLevel: "medium" });
    const spec = buildParentSamplerRuntimeSpec(
      { runtimeConfig: parent, thinkingLevel: "high", temperature: 0.9 },
      "default"
    );
    expect(spec).toEqual({
      config: parent,
      configuredThinkingLevel: "high",
      effectiveTemperature: undefined,
      portableToolSchemaProfile: "default"
    });
    expect(spec).toEqual(
      expect.objectContaining(resolveRunSamplingValues(parent, "high", 0.9))
    );
  });

  it("resolves the run temperature only while thinking is off", () => {
    const parent = runtimeConfig({});
    const spec = buildParentSamplerRuntimeSpec(
      { runtimeConfig: parent, thinkingLevel: "off", temperature: 0.9 },
      "default"
    );
    expect(spec?.configuredThinkingLevel).toBe("off");
    // The run temperature wins over temperatureOptions; a config-default
    // fallback would send 0.6 instead.
    expect(spec?.effectiveTemperature).toBe(0.9);
  });

  it("is undefined on faux paths without a parent runtime config", () => {
    expect(
      buildParentSamplerRuntimeSpec(
        { thinkingLevel: "off", temperature: 0.9 },
        "default"
      )
    ).toBeUndefined();
  });
});

describe("resolveSubagentModel sampler overrides", () => {
  it("rebuilds an inherit child from the parent config with the merged sampler and pinned run values", async () => {
    const parent = runtimeConfig({
      defaultThinkingLevel: "medium",
      sampler: { dryMultiplier: 0.5, xtcProbability: 0.2 }
    });
    const input = spawnInput({
      parentSamplerRuntime: buildParentSamplerRuntimeSpec(
        { runtimeConfig: parent, thinkingLevel: "high", temperature: 0.9 },
        "default"
      )
    });
    const resolved = resolveSubagentModel(
      input,
      { modelMode: "inherit", sampler: { dryMultiplier: 0.8, minP: 0.05 } },
      "子智能体「写手」"
    );

    expect(resolved.model.samplingParams).toEqual({
      dry_multiplier: 0.8,
      xtc_probability: 0.2,
      min_p: 0.05
    });
    // Pinned to the run's effective thinking level, not the config default.
    expect(resolved.thinkingLevel).toBe("high");
    const payload = await capturePayload(resolved.streamFn, resolved.model);
    for (const key of SAMPLING_BODY_KEYS) {
      if (
        key === "dry_multiplier" ||
        key === "xtc_probability" ||
        key === "min_p"
      ) {
        continue;
      }
      expect(payload).not.toHaveProperty(key);
    }
    // Non-off thinking sends no temperature, and never a temperatureOptions
    // fallback value.
    expect(payload).not.toHaveProperty("temperature");
  });

  it("keeps the parent-run temperature on a rebuilt inherit child with thinking off", async () => {
    const parent = runtimeConfig({
      sampler: { dryMultiplier: 0.5, xtcProbability: 0.2 }
    });
    const input = spawnInput({
      parentSamplerRuntime: buildParentSamplerRuntimeSpec(
        { runtimeConfig: parent, thinkingLevel: "off", temperature: 0.9 },
        "default"
      )
    });
    const resolved = resolveSubagentModel(
      input,
      { modelMode: "inherit", sampler: { minP: 0.05 } },
      "子智能体「写手」"
    );

    expect(resolved.thinkingLevel).toBe("off");
    const payload = await capturePayload(resolved.streamFn, resolved.model);
    expect(payload.min_p).toBe(0.05);
    expect(payload.xtc_probability).toBe(0.2);
    expect(payload.temperature).toBe(0.9);
  });

  it("merges cross keys under a custom child model", async () => {
    const customConfig = runtimeConfig({
      id: "custom-model",
      modelId: "custom-model",
      sampler: { dryMultiplier: 0.4, dryBase: 1.6, xtcThreshold: 0.1 }
    });
    const builder = customRuntimeBuilder();
    const input = spawnInput({
      subagentRuntimeConfigs: { custom_model: customConfig },
      buildCustomModelRuntime: builder.build
    });
    const resolved = resolveSubagentModel(
      input,
      {
        modelMode: "custom",
        modelId: "custom_model",
        sampler: { dryMultiplier: 0.9, xtcProbability: 0.3, minP: 0.07 }
      },
      "子智能体「写手」"
    );

    const merged: SamplerSettings = {
      dryMultiplier: 0.9,
      dryBase: 1.6,
      xtcProbability: 0.3,
      xtcThreshold: 0.1,
      minP: 0.07
    };
    expect(builder.receivedConfigs[0]).toEqual({
      ...customConfig,
      sampler: merged
    });
    expect(resolved.model.samplingParams).toEqual({
      dry_multiplier: 0.9,
      dry_base: 1.6,
      xtc_probability: 0.3,
      xtc_threshold: 0.1,
      min_p: 0.07
    });
  });

  it("keeps both paths byte-identical when no sampler override is set", () => {
    const customConfig = runtimeConfig({
      id: "custom-model",
      modelId: "custom-model",
      sampler: { dryMultiplier: 0.4 }
    });
    const builder = customRuntimeBuilder();
    const input = spawnInput({
      subagentRuntimeConfigs: { custom_model: customConfig },
      buildCustomModelRuntime: builder.build
    });

    const inherited = resolveSubagentModel(
      input,
      { modelMode: "inherit" },
      "子智能体「写手」"
    );
    expect(inherited.model).toBe(input.model);
    expect(inherited.streamFn).toBe(input.streamFn);
    expect(inherited.thinkingLevel).toBe(input.thinkingLevel);

    const inheritedUndefinedSamplerInput = spawnInput({
      parentSamplerRuntime: buildParentSamplerRuntimeSpec(
        { runtimeConfig: runtimeConfig({}), thinkingLevel: "high" },
        "default"
      )
    });
    const inheritedUndefinedSampler = resolveSubagentModel(
      inheritedUndefinedSamplerInput,
      { modelMode: "inherit", sampler: undefined },
      "子智能体「写手」"
    );
    expect(inheritedUndefinedSampler.model).toBe(
      inheritedUndefinedSamplerInput.model
    );

    const custom = resolveSubagentModel(
      input,
      { modelMode: "custom", modelId: "custom_model" },
      "子智能体「写手」"
    );
    expect(builder.receivedConfigs[0]).toBe(customConfig);
    expect(custom.model.samplingParams).toEqual({ dry_multiplier: 0.4 });
  });

  it("keeps sampling keys off rebuilt anthropic inherit children", async () => {
    const parent = runtimeConfig({
      api: "anthropic-messages",
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      sampler: { dryMultiplier: 0.5 }
    });
    const input = spawnInput({
      parentSamplerRuntime: buildParentSamplerRuntimeSpec(
        { runtimeConfig: parent, thinkingLevel: "off", temperature: 0.9 },
        "default"
      )
    });
    const resolved = resolveSubagentModel(
      input,
      { modelMode: "inherit", sampler: { dryMultiplier: 0.8, minP: 0.05 } },
      "子智能体「写手」"
    );

    expect(resolved.model.samplingParams).toBeUndefined();
    const payload = await capturePayload(resolved.streamFn, resolved.model);
    for (const key of SAMPLING_BODY_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});
