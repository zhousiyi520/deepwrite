import { describe, expect, it } from "vitest";
import dialogSource from "./ModelAdvancedConfigDialog.vue?raw";
import samplerComponentSource from "./ModelSamplerFields.vue?raw";
import samplerLogicSource from "./modelSamplerFields.ts?raw";
import featureSource from "./ModelSettingsFeature.vue?raw";

describe("ModelAdvancedConfigDialog sampler group", () => {
  it("renders the sampler group only for openai-completions entries", () => {
    // Anchor in the template: the generic ref type in <script> shares the prefix.
    const templateStart = dialogSource.indexOf("</script>");
    const mount = dialogSource.indexOf("<ModelSamplerFields", templateStart);
    expect(mount).toBeGreaterThan(-1);
    // The guard sits on the component tag itself, right after its start.
    const guard = dialogSource.indexOf(
      "model.api === 'openai-completions'",
      mount
    );
    expect(guard).toBeGreaterThan(mount);
    // Feature mount surface untouched: the dialog stays the only consumer.
    expect(featureSource).toContain('@save="saveAdvancedConfig"');
    expect(featureSource).toContain("<ModelAdvancedConfigDialog");
  });

  it("mounts the group below maxTokens and collects it before save", () => {
    const templateStart = dialogSource.indexOf("</script>");
    const mount = dialogSource.indexOf("<ModelSamplerFields", templateStart);
    expect(mount).toBeGreaterThan(-1);
    const maxTokensIndex = dialogSource.indexOf(
      "maximumTokensGeneratedInASingleReply"
    );
    expect(mount).toBeGreaterThan(maxTokensIndex);
    expect(dialogSource).toContain('ref="samplerFields"');
    const saveBody = dialogSource.slice(
      dialogSource.indexOf("function save(): void {"),
      templateStart
    );
    expect(saveBody).toContain("collectSampler()");
    expect(saveBody).toContain("if (sampler === null) return;");
    expect(saveBody).toContain(
      'emit("save", { contextWindow, maxTokens, sampler });'
    );
  });

  it("skips sampler collection for entries without the group", () => {
    expect(dialogSource).toContain('model.api !== "openai-completions"');
  });

  it("keeps failure feedback on the fixed toast channel without inline error nodes", () => {
    expect(samplerLogicSource).toContain("uiMessage.warning(");
    expect(samplerComponentSource).not.toContain("samplerError");
    expect(samplerComponentSource).not.toContain('role="alert"');
    expect(dialogSource).not.toContain("samplerError");
  });

  it("renders the seven inputs in the contracts display order", () => {
    expect(samplerComponentSource).toContain(
      'v-for="key in SAMPLER_FIELD_ORDER"'
    );
    expect(samplerLogicSource).toContain("SAMPLER_FIELD_BOUNDS");
    expect(samplerLogicSource).toContain("createSamplerFieldTexts");
  });

  it("stays within the 300-line review gate", () => {
    expect(dialogSource.trimEnd().split("\n").length).toBeLessThanOrEqual(300);
  });
});
