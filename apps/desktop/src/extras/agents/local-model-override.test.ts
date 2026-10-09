import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXTRAS_LOCAL_MODEL_OVERRIDES,
  resolveExtrasRunModelId
} from "./local-model-override";

const MAPPED_AGENT_IDS = [
  "long-book-analysis",
  "short-book-analysis",
  "revision-analysis",
  "style-comparison"
] as const;

describe("resolveExtrasRunModelId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("without DEEPWRITE_SMOKE (production fail-closed path)", () => {
    it("pins the four one-shot analysis agents to the local model", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", undefined);
      for (const agentId of MAPPED_AGENT_IDS) {
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
      vi.stubEnv("DEEPWRITE_SMOKE", undefined);
      expect(resolveExtrasRunModelId("chat-normal", "model_any_cloud")).toBe(
        "model_any_cloud"
      );
      expect(
        resolveExtrasRunModelId("long-book-decomposition", "model_snapshot_id")
      ).toBe("model_snapshot_id");
    });

    it("passes an undefined requested model through for unmapped agents", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", undefined);
      expect(resolveExtrasRunModelId("chat-normal", undefined)).toBeUndefined();
    });

    it("still pins mapped agents when the requested model is undefined", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", undefined);
      expect(resolveExtrasRunModelId("long-book-analysis", undefined)).toBe(
        "model_74478acd"
      );
    });
  });

  describe("with DEEPWRITE_SMOKE=1 (packaged smoke bypass)", () => {
    it("returns the requested model id as-is for mapped agents", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", "1");
      for (const agentId of MAPPED_AGENT_IDS) {
        expect(resolveExtrasRunModelId(agentId, "model_requested")).toBe(
          "model_requested"
        );
      }
    });

    it("passes an undefined requested model through for mapped agents", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", "1");
      expect(
        resolveExtrasRunModelId("long-book-analysis", undefined)
      ).toBeUndefined();
    });

    it("passes unmapped agent ids through unchanged", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", "1");
      expect(resolveExtrasRunModelId("chat-normal", "model_any_cloud")).toBe(
        "model_any_cloud"
      );
      expect(
        resolveExtrasRunModelId("long-book-decomposition", "model_snapshot_id")
      ).toBe("model_snapshot_id");
    });

    it("passes an undefined requested model through for unmapped agents", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", "1");
      expect(resolveExtrasRunModelId("chat-normal", undefined)).toBeUndefined();
    });
  });

  describe('with DEEPWRITE_SMOKE values other than "1" (strict gate)', () => {
    it("treats DEEPWRITE_SMOKE=0 like unset", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", "0");
      for (const agentId of MAPPED_AGENT_IDS) {
        expect(resolveExtrasRunModelId(agentId, "model_any_cloud")).toBe(
          "model_74478acd"
        );
      }
      expect(resolveExtrasRunModelId("chat-normal", "model_any_cloud")).toBe(
        "model_any_cloud"
      );
    });

    it("treats DEEPWRITE_SMOKE=true like unset", () => {
      vi.stubEnv("DEEPWRITE_SMOKE", "true");
      for (const agentId of MAPPED_AGENT_IDS) {
        expect(resolveExtrasRunModelId(agentId, "model_any_cloud")).toBe(
          "model_74478acd"
        );
      }
      expect(resolveExtrasRunModelId("long-book-analysis", undefined)).toBe(
        "model_74478acd"
      );
    });
  });
});
