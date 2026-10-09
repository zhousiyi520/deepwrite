import type {
  AgentProviderRuntimeConfig,
  SamplerSettings
} from "@deepwrite/contracts";
import { describe, expect, it } from "vitest";
import { resolveRunModel } from "./kernel/run-model";
import type { AgentRunPlan } from "./kernel/run-plan";
import { buildProviderRuntime } from "./provider-runtime";
import { toSamplingParams } from "./sampling-params";

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

async function captureStreamPayload(
  config: AgentProviderRuntimeConfig
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(config);
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

const FULL_SAMPLER: SamplerSettings = {
  dryMultiplier: 0,
  dryBase: 1.8,
  dryAllowedLength: 0,
  dryPenaltyLastN: -1,
  xtcProbability: 0.5,
  xtcThreshold: 0.1,
  minP: 0
};

const SAMPLING_BODY_KEYS = [
  "dry_multiplier",
  "dry_base",
  "dry_allowed_length",
  "dry_penalty_last_n",
  "xtc_probability",
  "xtc_threshold",
  "min_p"
] as const;

/**
 * Sorted request-body keys of a no-sampler openai-completions run, pinned
 * against the pre-change pipeline. If a future catalog model starts carrying
 * samplingParams, this pin fails and the assertion must be tightened together
 * with the gate's coverage.
 */
const NO_SAMPLER_BASELINE_KEYS = [
  "max_tokens",
  "messages",
  "model",
  "prompt_cache_key",
  "prompt_cache_retention",
  "stream",
  "stream_options",
  "thinking"
];

describe("toSamplingParams", () => {
  it("maps every configured key to its snake_case request key", () => {
    expect(toSamplingParams(FULL_SAMPLER)).toEqual({
      dry_multiplier: 0,
      dry_base: 1.8,
      dry_allowed_length: 0,
      dry_penalty_last_n: -1,
      xtc_probability: 0.5,
      xtc_threshold: 0.1,
      min_p: 0
    });
  });

  it("sends a zero value instead of dropping it", () => {
    expect(toSamplingParams({ dryMultiplier: 0 })).toEqual({
      dry_multiplier: 0
    });
  });

  it("omits unset keys from a partial sampler", () => {
    expect(toSamplingParams({ xtcProbability: 0.3, minP: 0.05 })).toEqual({
      xtc_probability: 0.3,
      min_p: 0.05
    });
  });

  it("returns undefined for undefined and empty inputs", () => {
    expect(toSamplingParams(undefined)).toBeUndefined();
    expect(toSamplingParams({})).toBeUndefined();
  });
});

describe("provider runtime sampler gating", () => {
  it("sends all seven snake_case sampler keys on openai-completions bodies", async () => {
    const payload = await captureStreamPayload(
      runtimeConfig({ sampler: FULL_SAMPLER })
    );

    expect(payload).toMatchObject({
      dry_multiplier: 0,
      dry_base: 1.8,
      dry_allowed_length: 0,
      dry_penalty_last_n: -1,
      xtc_probability: 0.5,
      xtc_threshold: 0.1,
      min_p: 0
    });
  });

  it.each([
    ["openai-responses", "openai", "gpt-5.6-sol"],
    ["anthropic-messages", "anthropic", "claude-sonnet-4-5"],
    ["google-generative-ai", "google", "gemini-2.5-pro"]
  ] as const)(
    "keeps sampling keys off %s bodies even with a full sampler set",
    async (api, provider, modelId) => {
      const payload = await captureStreamPayload(
        runtimeConfig({ api, provider, modelId, sampler: FULL_SAMPLER })
      );

      for (const key of SAMPLING_BODY_KEYS) {
        expect(payload).not.toHaveProperty(key);
      }
    }
  );

  it("keeps the no-sampler request body at its pre-change key set", async () => {
    const payload = await captureStreamPayload(runtimeConfig({}));

    expect(payload.model).toBe("deepseek-chat");
    for (const key of SAMPLING_BODY_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(Object.keys(payload).sort()).toEqual(NO_SAMPLER_BASELINE_KEYS);
  });

  it("never routes faux runs through buildProviderRuntime, leaving sampler fields unreachable", () => {
    const fauxRunId = "sampler-faux-run";
    const plan: AgentRunPlan = {
      target: { runId: fauxRunId, sessionId: "sampler-faux-session" },
      eventSource: { runId: fauxRunId, sessionId: "sampler-faux-session" },
      portableToolSchemaProfile: "default",
      fauxResponses: () => [],
      build: () => ({ systemPrompt: "", tools: [] }),
      userMessageContent: () => "OK"
    };

    const runModel = resolveRunModel(
      plan,
      { provider: "deepwrite-faux", model: "local-writer", mode: "local-faux" },
      100
    );

    expect(runModel.model.api).toBe("deepwrite-faux");
    expect(runModel.model.samplingParams).toBeUndefined();
  });
});
