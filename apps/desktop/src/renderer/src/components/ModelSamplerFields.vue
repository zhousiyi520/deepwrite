<script setup lang="ts">
import { reactive } from "vue";
import {
  SAMPLER_FIELD_ORDER,
  type SamplerSettings
} from "@deepwrite/contracts/renderer";
import {
  collectSamplerFieldTexts,
  createSamplerFieldTexts,
  parseSamplerFieldTexts,
  samplerFieldHints,
  samplerFieldLabels,
  samplerGroupNote,
  samplerGroupTitle,
  type SamplerCollectResult,
  type SamplerFieldTexts
} from "./modelSamplerFields";

const props = defineProps<{
  /** Saved overrides hydrating the inputs; absent keys stay empty. */
  sampler?: SamplerSettings | undefined;
  /** Per-key placeholder strings, e.g. the selected model's effective values. */
  placeholders?: SamplerFieldTexts | undefined;
}>();

const emit = defineEmits<{
  "update:sampler": [sampler: SamplerSettings | undefined];
}>();

const texts = reactive<SamplerFieldTexts>(
  createSamplerFieldTexts(props.sampler)
);

function onInput(): void {
  const result = parseSamplerFieldTexts(texts);
  if (result.ok) emit("update:sampler", result.sampler);
}

defineExpose({
  /** Validates all inputs, toasting on the first invalid one. */
  collectSampler: (): SamplerCollectResult => collectSamplerFieldTexts(texts)
});
</script>

<template>
  <div class="model-sampler-fields">
    <p class="model-sampler-title">{{ samplerGroupTitle() }}</p>
    <p class="model-sampler-note">{{ samplerGroupNote() }}</p>
    <label v-for="key in SAMPLER_FIELD_ORDER" :key="key">
      <span>{{ samplerFieldLabels[key] }}</span>
      <input
        v-model="texts[key]"
        type="text"
        inputmode="decimal"
        :aria-label="samplerFieldLabels[key]"
        :placeholder="placeholders?.[key]"
        @input="onInput"
      />
      <small>{{ samplerFieldHints[key] }}</small>
    </label>
  </div>
</template>

<style scoped>
.model-sampler-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 10px;
}

.model-sampler-title {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.678571rem;
  font-weight: 600;
}

.model-sampler-note {
  grid-column: 1 / -1;
  margin: -6px 0 0;
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  line-height: 1.5;
}

.model-sampler-fields label {
  display: grid;
  gap: 5px;
  align-content: start;
  color: var(--text-secondary);
  font-size: 0.678571rem;
}

.model-sampler-fields input {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--theme-line);
  border-radius: 7px;
  outline: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font-size: 0.785714rem;
  font-variant-numeric: tabular-nums;
}

.model-sampler-fields input:focus {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--theme-line));
}

.model-sampler-fields small {
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  line-height: 1.5;
}
</style>
