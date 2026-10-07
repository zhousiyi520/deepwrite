import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliError } from "../cli-error";
import { loadModelEntries, parseModelEntries } from "./models";

const v3Fixture = JSON.stringify({
  version: 3,
  defaultModelId: "m-1",
  models: [
    {
      id: "m-1",
      label: "Fixture-13B",
      provider: "example.test",
      modelId: "fixture-13b",
      api: "openai-completions",
      baseUrl: "https://api.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["off"],
      temperatureOptions: [0.1, 0.7, 1]
    },
    {
      id: "m-free",
      label: "Managed-Fixture",
      provider: "example.test",
      modelId: "fixture-free",
      api: "openai-completions",
      baseUrl: "https://free.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["off"],
      temperatureOptions: [0.1, 0.7, 1],
      managedBy: "deepwrite-free"
    }
  ],
  encryptedApiKeys: { "m-1": "placeholder-not-a-real-key" }
});

let fixtureRoot: string | undefined;

async function makeFixture(modelsJson: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-cli-models-"));
  fixtureRoot = root;
  await mkdir(join(root, "config"), { recursive: true });
  await writeFile(join(root, "config", "models.json"), modelsJson, "utf8");
  return root;
}

afterEach(async () => {
  if (fixtureRoot !== undefined) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  }
});

describe("parseModelEntries", () => {
  it("extracts only identity fields from a v3 file", () => {
    const entries = parseModelEntries(v3Fixture);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "m-1",
      label: "Fixture-13B",
      provider: "example.test",
      modelId: "fixture-13b"
    });
    expect(entries[1]?.managedBy).toBe("deepwrite-free");
  });

  it("never exposes credential material", () => {
    const entries = parseModelEntries(v3Fixture);
    const printed = JSON.stringify(entries);
    expect(printed).not.toContain("encryptedApiKeys");
    expect(printed).not.toContain("placeholder-not-a-real-key");
    expect(Object.keys(entries[0] ?? {})).not.toContain("encryptedApiKeys");
  });

  it("ignores malformed entries instead of failing", () => {
    const entries = parseModelEntries(
      JSON.stringify({ models: [{ id: "broken" }, null, "x"] })
    );
    expect(entries).toEqual([]);
  });

  it("fails friendly on corrupt JSON", () => {
    expect(() => parseModelEntries("{broken json")).toThrow(CliError);
  });

  it("fails friendly when the models list is missing", () => {
    expect(() => parseModelEntries(JSON.stringify({ version: 3 }))).toThrow(
      CliError
    );
  });
});

describe("loadModelEntries", () => {
  it("reads models.json from <userData>/config", async () => {
    const root = await makeFixture(v3Fixture);
    const entries = await loadModelEntries(root);
    expect(entries).toHaveLength(2);
  });

  it("fails friendly when models.json is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-cli-models-"));
    fixtureRoot = root;
    await expect(loadModelEntries(root)).rejects.toThrow(CliError);
  });

  it("fails friendly on a corrupt models.json file", async () => {
    const root = await makeFixture("{broken json");
    await expect(loadModelEntries(root)).rejects.toThrow(CliError);
  });

  it("keeps the fixture on disk unread after the command", async () => {
    const root = await makeFixture(v3Fixture);
    await loadModelEntries(root);
    const raw = await readFile(join(root, "config", "models.json"), "utf8");
    expect(raw).toBe(v3Fixture);
  });
});
