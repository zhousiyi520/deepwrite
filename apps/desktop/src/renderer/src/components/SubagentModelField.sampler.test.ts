import { describe, expect, it } from "vitest";
import {
  LONG_AGENT_IDS,
  LongAgentTeamSettingsInputSchema,
  SHORT_WORKSPACE_AGENT_IDS,
  WorkspaceAgentTeamSettingsInputSchema
} from "@deepwrite/contracts/renderer";
import editorSource from "./AgentTeamSubagentEditor.vue?raw";
import panelSource from "./AgentTeamSettingsPanel.vue?raw";
import longPanelSource from "./LongAgentTeamSettingsPanel.vue?raw";
import longTemplateSource from "./LongAgentTeamSettingsPanel.template.html?raw";
import helpersSource from "./agentTeamSettingsEditorHelpers.ts?raw";
import samplerFieldsSource from "./ModelSamplerFields.vue?raw";
import modelFieldSource from "./SubagentModelField.vue?raw";
import templateSource from "./AgentTeamSettingsPanel.template.html?raw";

const subagentBase = {
  id: "subagent_writer",
  name: "肉戏写手",
  description: "负责指定小节写作",
  systemPrompt: "只写指定小节。",
  enabled: true
} as const;

describe("SubagentModelField sampler overrides", () => {
  it("shows the sampler override area under both model modes", () => {
    const mount = modelFieldSource.indexOf("<ModelSamplerFields");
    expect(mount).toBeGreaterThan(-1);
    // No model-mode guard around the mount: inherit and custom both offer it.
    const lineStart = modelFieldSource.lastIndexOf("\n", mount);
    expect(modelFieldSource.slice(lineStart, mount)).not.toContain('v-if="');
    expect(modelFieldSource).toContain(
      ':sampler="sampler"\n        :placeholders="samplerPlaceholders"'
    );
    // Placeholders come from the selected model's effective sampler.
    expect(modelFieldSource).toContain(
      "createSamplerFieldTexts(props.modelSampler)"
    );
    expect(samplerFieldsSource).toContain(':placeholder="placeholders?.[key]"');
  });

  it("stores only the diff keys against the selected model", () => {
    expect(modelFieldSource).toContain(
      'emit("setSampler", diffSamplerSettings(props.modelSampler, value));'
    );
  });

  it("keeps the editor passthrough within its 10-line budget", () => {
    expect(editorSource).toContain(':sampler="subagent.sampler"');
    expect(editorSource).toContain(':model-sampler="modelSampler"');
    expect(editorSource).toContain(
      "@set-sampler=\"emit('setSampler', $event)\""
    );
    // 346 lines before the passthrough; +10 lines is the review gate.
    expect(editorSource.trimEnd().split("\n").length).toBeLessThanOrEqual(356);
  });

  it("wires both team panels to the sampler passthrough and save chain", () => {
    for (const template of [templateSource, longTemplateSource]) {
      expect(template).toContain(':model-sampler="modelSamplerFor(');
      expect(template).toContain("@set-sampler=");
    }
    for (const source of [panelSource, longPanelSource]) {
      expect(source).toContain("sampler !== undefined");
      expect(source).toContain("modelSamplerFor");
    }
    // Persisted-field participation of the draft signature.
    expect(helpersSource).toContain("subagent.sampler ?? null");
  });
});

describe("team save roundtrip with sampler overrides", () => {
  it("keeps a subagent sampler through the short team save schema in both modes", () => {
    for (const modelMode of ["inherit", "custom"] as const) {
      const parsed = WorkspaceAgentTeamSettingsInputSchema.parse({
        workspaceType: "short",
        parallelSubagents: false,
        teams: SHORT_WORKSPACE_AGENT_IDS.map((parentAgentId, index) => ({
          parentAgentId,
          subagents:
            index === 0
              ? [
                  {
                    ...subagentBase,
                    ...(modelMode === "custom"
                      ? { modelId: "model_custom", thinkingLevel: "high" }
                      : {}),
                    modelMode,
                    sampler: { dryMultiplier: 0.8, dryPenaltyLastN: -1 }
                  }
                ]
              : []
        }))
      });
      expect(parsed.workspaceType).toBe("short");
      const saved = parsed.teams[0]?.subagents[0];
      expect(saved?.sampler).toEqual({
        dryMultiplier: 0.8,
        dryPenaltyLastN: -1
      });
    }
  });

  it("keeps a subagent sampler through the long team save schema", () => {
    const parsed = LongAgentTeamSettingsInputSchema.parse({
      workspaceType: "long",
      parallelSubagents: false,
      teams: LONG_AGENT_IDS.map((parentAgentId, index) => ({
        parentAgentId,
        subagents:
          index === 0
            ? [
                {
                  ...subagentBase,
                  modelMode: "inherit",
                  sampler: { minP: 0.05 }
                }
              ]
            : []
      }))
    });
    expect(parsed.teams[0]?.subagents[0]?.sampler).toEqual({ minP: 0.05 });
  });

  it("keeps old definitions without a sampler byte-identical", () => {
    const parsed = WorkspaceAgentTeamSettingsInputSchema.parse({
      workspaceType: "short",
      parallelSubagents: false,
      teams: SHORT_WORKSPACE_AGENT_IDS.map((parentAgentId, index) => ({
        parentAgentId,
        subagents:
          index === 0 ? [{ ...subagentBase, modelMode: "inherit" }] : []
      }))
    });
    const saved = parsed.teams[0]?.subagents[0];
    expect(saved).not.toHaveProperty("sampler");
    expect(saved).toEqual({
      ...subagentBase,
      agentMode: "standard",
      modelMode: "inherit"
    });
  });
});
