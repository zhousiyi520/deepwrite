import type { StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  AgentRuntimeRef,
  AgentProviderRuntimeConfig,
  ShortAgentSubagentDefinition,
  ThinkingLevel as ConfiguredThinkingLevel
} from "@deepwrite/contracts";
import {
  hasSamplerSettings,
  resolveEffectiveSamplerSettings
} from "@deepwrite/contracts";
import {
  buildProviderRuntime,
  resolveRunSamplingValues,
  toPiThinkingLevel
} from "./provider-runtime";
import type { PortableToolSchemaProfile } from "./portable-tool-schema";
import { runtimeFromConfig, runtimeFromModel } from "./subagent-helpers";
import type { BuildSpawnSubagentToolInput } from "./subagent-types";

/** Model choice of a member or a draw evaluator; `inherit` is the parent's. */
export type SubagentModelSettings = Pick<
  ShortAgentSubagentDefinition,
  "modelMode" | "modelId" | "thinkingLevel" | "temperature" | "sampler"
>;

export interface ResolvedSubagentModel {
  model: Model<Api>;
  streamFn: StreamFn;
  thinkingLevel: ThinkingLevel;
}

function customModelId(settings: SubagentModelSettings): string | undefined {
  return settings.modelMode === "custom"
    ? settings.modelId?.trim() || undefined
    : undefined;
}

/**
 * The parent-run sampling rebuild spec handed to spawn inputs: the parent's
 * own provider config plus its effective thinking level and temperature.
 * `undefined` on faux paths, where inherit-mode children keep the parent
 * runtime untouched.
 */
export function buildParentSamplerRuntimeSpec(
  target: {
    runtimeConfig?: AgentProviderRuntimeConfig;
    thinkingLevel?: ConfiguredThinkingLevel;
    temperature?: number;
  },
  portableToolSchemaProfile: PortableToolSchemaProfile
): BuildSpawnSubagentToolInput["parentSamplerRuntime"] {
  if (!target.runtimeConfig) return undefined;
  const { configuredThinkingLevel, effectiveTemperature } =
    resolveRunSamplingValues(
      target.runtimeConfig,
      target.thinkingLevel,
      target.temperature
    );
  return {
    config: target.runtimeConfig,
    configuredThinkingLevel,
    effectiveTemperature,
    portableToolSchemaProfile
  };
}

export function subagentModelRuntime(
  input: BuildSpawnSubagentToolInput,
  settings: SubagentModelSettings
): AgentRuntimeRef {
  const modelId = customModelId(settings);
  const config = modelId ? input.subagentRuntimeConfigs?.[modelId] : undefined;
  return config
    ? runtimeFromConfig(config)
    : (input.parentRuntime ?? runtimeFromModel(input.model));
}

/** Throws a message naming `owner` when a custom model is unavailable. */
export function resolveSubagentModel(
  input: BuildSpawnSubagentToolInput,
  settings: SubagentModelSettings,
  owner: string
): ResolvedSubagentModel {
  if (settings.modelMode !== "custom") {
    const rebuild = input.parentSamplerRuntime;
    if (hasSamplerSettings(settings.sampler) && rebuild) {
      // Inherit-mode override: rebuild the parent runtime from its own config
      // with the merged sampler. thinkingLevel and temperature are the
      // parent-run effective values, never re-resolved from config defaults.
      const merged = resolveEffectiveSamplerSettings(
        rebuild.config.sampler,
        settings.sampler
      );
      const runtime = buildProviderRuntime(
        { ...rebuild.config, sampler: merged },
        rebuild.effectiveTemperature,
        rebuild.configuredThinkingLevel,
        { portableToolSchemaProfile: rebuild.portableToolSchemaProfile }
      );
      return {
        model: runtime.model,
        streamFn: runtime.streamFn,
        thinkingLevel: toPiThinkingLevel(rebuild.configuredThinkingLevel)
      };
    }
    return {
      model: input.model,
      streamFn: input.streamFn,
      thinkingLevel: input.thinkingLevel
    };
  }
  const modelId = customModelId(settings);
  if (!modelId) throw new Error(`${owner}未配置模型。`);
  const runtimeConfig = input.subagentRuntimeConfigs?.[modelId];
  if (!runtimeConfig) {
    throw new Error(
      `${owner}配置的模型不可用，请重新保存智能体团队或刷新模型配置。`
    );
  }
  if (!input.buildCustomModelRuntime) {
    throw new Error("当前运行时不支持子智能体单独配置模型。");
  }
  // Custom-mode override: the child's own model config is the base; the
  // subagent sampler replaces keys one by one. Without an override the exact
  // original config object is forwarded, keeping the no-sampler path intact.
  const derivedConfig = hasSamplerSettings(settings.sampler)
    ? {
        ...runtimeConfig,
        sampler: resolveEffectiveSamplerSettings(
          runtimeConfig.sampler,
          settings.sampler
        )
      }
    : runtimeConfig;
  return input.buildCustomModelRuntime(derivedConfig, {
    ...(settings.thinkingLevel !== undefined
      ? { thinkingLevel: settings.thinkingLevel }
      : {}),
    ...(settings.temperature !== undefined
      ? { temperature: settings.temperature }
      : {})
  });
}

/**
 * The visible turn coordinator owns the complete retry budget. Keep provider
 * SDK retries disabled for inherited and custom child models as well,
 * otherwise one child attempt can fan out into 2+ requests.
 */
export function withoutProviderRetries(streamFn: StreamFn): StreamFn {
  return (requestModel, streamContext, options) =>
    streamFn(requestModel, streamContext, { ...options, maxRetries: 0 });
}
