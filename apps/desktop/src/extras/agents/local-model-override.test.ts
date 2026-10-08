import { describe, expect, it } from "vitest";
import {
  EXTRAS_LOCAL_MODEL_OVERRIDES,
  resolveExtrasRunModelId
} from "./local-model-override";

describe("resolveExtrasRunModelId", () => {
  it("pins the four one-shot analysis agents to the local model", () => {
    for (const agentId of [
      "long-book-analysis",
      "short-book-analysis",
      "revision-analysis",
      "style-comparison"
    ]) {
      expect(resolveExtrasRunModelId(agentId, "model_any_cloud")).toBe(
        "model_74478acd"
      );
    }
    expect(Object.keys(EXTRAS_LOCAL_MODEL_OVERRIDES).sort()).toEqual([
      "long-book-analysis",
      "revision-analysis",
      "short-book-analysis",
      "style-comparison"
    ]);
  });

  it("passes unmapped agent ids through unchanged", () => {
    expect(resolveExtrasRunModelId("chat-normal", "model_any_cloud")).toBe(
      "model_any_cloud"
    );
    expect(
      resolveExtrasRunModelId("long-book-decomposition", "model_snapshot_id")
    ).toBe("model_snapshot_id");
  });

  it("passes an undefined requested model through", () => {
    expect(resolveExtrasRunModelId("chat-normal", undefined)).toBeUndefined();
    expect(resolveExtrasRunModelId("long-book-analysis", undefined)).toBe(
      "model_74478acd"
    );
  });
});
