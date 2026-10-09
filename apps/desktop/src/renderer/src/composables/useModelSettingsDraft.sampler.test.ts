import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  BUILT_IN_REASONING_LEVELS,
  SamplerSettingsSchema,
  type ModelConfig,
  type ModelConfigInput,
  type ModelSettings,
  type ModelSettingsInput,
  type SamplerSettings
} from "@deepwrite/contracts/renderer";
import { createSamplerFieldTexts } from "../components/modelSamplerFields";
import {
  useModelSettingsDraft,
  type ModelSettingsDraftActions,
  type ModelSettingsDraftProps
} from "./useModelSettingsDraft";

const BASE_MODEL: Omit<ModelConfig, "sampler"> = {
  id: "m1",
  label: "KVMem Test Model",
  provider: "kvmem",
  modelId: "test-model-27b",
  api: "openai-completions",
  baseUrl: "https://kvmem.example.test/v1",
  reasoning: true,
  defaultThinkingLevel: "medium",
  thinkingLevelOptions: [...BUILT_IN_REASONING_LEVELS],
  temperatureOptions: [0.1, 0.7, 1],
  hasApiKey: true,
  contextWindow: 272_000,
  maxTokens: 128_000
};

function modelSettingsFixture(
  sampler?: SamplerSettings | undefined
): ModelSettings {
  return {
    defaultModelId: "m1",
    models: [
      {
        ...BASE_MODEL,
        ...(sampler === undefined ? {} : { sampler })
      }
    ]
  };
}

function draftProps(
  modelSettings: ModelSettings | null
): ModelSettingsDraftProps {
  return {
    active: true,
    modelScope: "all",
    modelSettings,
    modelLoading: false,
    modelSaving: false,
    modelError: null,
    modelTestMessage: null,
    testingModelId: null
  };
}

function fakeActions(saved: ModelSettingsInput[]): ModelSettingsDraftActions {
  return {
    saveModels: (input) => {
      // JSON round trip mirrors the IPC boundary and drops undefined keys.
      saved.push(JSON.parse(JSON.stringify(input)) as ModelSettingsInput);
    },
    testModel: () => {},
    editorOpened: () => {}
  };
}

function toConfigWithKey(input: ModelConfigInput): ModelConfig {
  return { ...input, hasApiKey: true };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("useModelSettingsDraft sampler roundtrip", () => {
  it("starts with no sampler for models saved without overrides", () => {
    const draft = useModelSettingsDraft(
      draftProps(modelSettingsFixture()),
      fakeActions([])
    );
    expect(draft.draftModels.value[0]!.sampler).toBeUndefined();
    const texts = createSamplerFieldTexts(draft.draftModels.value[0]!.sampler);
    expect(Object.values(texts).every((raw) => raw === "")).toBe(true);
  });

  it("persists sampler values through the existing save chain and echoes them on reload", () => {
    const saved: ModelSettingsInput[] = [];
    const draft = useModelSettingsDraft(
      draftProps(modelSettingsFixture()),
      fakeActions(saved)
    );
    draft.openAdvancedConfig(draft.draftModels.value[0]!);
    expect(draft.advancedConfigModel.value?.id).toBe("m1");

    const sampler: SamplerSettings = {
      dryMultiplier: 0,
      dryPenaltyLastN: -1,
      minP: 0.3
    };
    draft.saveAdvancedConfig({
      contextWindow: 200_000,
      maxTokens: 100_000,
      sampler
    });

    expect(saved).toHaveLength(1);
    const persisted = saved[0]!.models[0]!;
    expect(persisted.contextWindow).toBe(200_000);
    expect(persisted.maxTokens).toBe(100_000);
    expect(persisted.sampler).toEqual(sampler);
    // Shape matches the contracts schema exactly, key for key.
    expect(Object.keys(persisted.sampler ?? {}).sort()).toEqual([
      "dryMultiplier",
      "dryPenaltyLastN",
      "minP"
    ]);
    expect(SamplerSettingsSchema.parse(persisted.sampler)).toEqual(sampler);

    const reloaded = useModelSettingsDraft(
      draftProps({
        defaultModelId: "m1",
        models: saved[0]!.models.map(toConfigWithKey)
      }),
      fakeActions([])
    );
    expect(reloaded.draftModels.value[0]!.sampler).toEqual(sampler);
    const texts = createSamplerFieldTexts(
      reloaded.draftModels.value[0]!.sampler
    );
    expect(texts.dryMultiplier).toBe("0");
    expect(texts.dryPenaltyLastN).toBe("-1");
    expect(texts.minP).toBe("0.3");
    expect(texts.dryBase).toBe("");
  });

  it("removes cleared sampler keys from the saved model instead of storing zeros", () => {
    const saved: ModelSettingsInput[] = [];
    const draft = useModelSettingsDraft(
      draftProps(modelSettingsFixture({ dryMultiplier: 1, minP: 0.2 })),
      fakeActions(saved)
    );
    expect(draft.draftModels.value[0]!.sampler).toEqual({
      dryMultiplier: 1,
      minP: 0.2
    });

    draft.openAdvancedConfig(draft.draftModels.value[0]!);
    draft.saveAdvancedConfig({
      contextWindow: 272_000,
      maxTokens: 128_000,
      sampler: undefined
    });

    expect(saved).toHaveLength(1);
    const persisted = saved[0]!.models[0]!;
    expect("sampler" in persisted).toBe(false);

    const reloaded = useModelSettingsDraft(
      draftProps({
        defaultModelId: "m1",
        models: saved[0]!.models.map(toConfigWithKey)
      }),
      fakeActions([])
    );
    expect(reloaded.draftModels.value[0]!.sampler).toBeUndefined();
    const texts = createSamplerFieldTexts(undefined);
    expect(Object.values(texts).every((raw) => raw === "")).toBe(true);
  });

  it("keeps a partial sampler when only capacity changes", () => {
    const saved: ModelSettingsInput[] = [];
    const draft = useModelSettingsDraft(
      draftProps(modelSettingsFixture({ xtcThreshold: 0.1 })),
      fakeActions(saved)
    );
    draft.openAdvancedConfig(draft.draftModels.value[0]!);
    draft.saveAdvancedConfig({
      contextWindow: 100_000,
      maxTokens: 50_000,
      sampler: { xtcThreshold: 0.1 }
    });
    const persisted = saved[0]!.models[0]!;
    expect(persisted.sampler).toEqual({ xtcThreshold: 0.1 });
    expect(persisted.contextWindow).toBe(100_000);
  });
});
