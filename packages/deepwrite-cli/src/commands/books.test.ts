import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliError } from "../cli-error";
import { listBooks } from "./books";

interface FixtureOptions {
  catalogRegistry: string | null;
  longRegistry: string | null;
  projectManifests: Record<string, string>;
}

let fixtureRoot: string | undefined;

async function withFixture(
  build: (root: string) => Promise<FixtureOptions>
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-cli-books-"));
  fixtureRoot = root;
  const options = await build(root);
  for (const [name, manifest] of Object.entries(options.projectManifests)) {
    const directory = join(root, name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "deepwrite.json"), manifest, "utf8");
  }
  if (options.catalogRegistry !== null) {
    await writeFile(
      join(root, "catalog-registry.json"),
      options.catalogRegistry,
      "utf8"
    );
  }
  if (options.longRegistry !== null) {
    await writeFile(
      join(root, "long-project-registry.json"),
      options.longRegistry,
      "utf8"
    );
  }
  return root;
}

afterEach(async () => {
  if (fixtureRoot !== undefined) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  }
});

describe("listBooks", () => {
  it("lists catalog and long entries with manifest titles", async () => {
    const root = await withFixture(async (root) => ({
      catalogRegistry: JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            id: "story-1",
            domain: "book",
            projectDirectory: join(root, "workspace-a")
          }
        ]
      }),
      longRegistry: JSON.stringify({
        schemaVersion: 1,
        projects: [
          { bookId: "long-1", projectDirectory: join(root, "workspace-b") }
        ]
      }),
      projectManifests: {
        "workspace-a": JSON.stringify({ title: "示例短篇" }),
        "workspace-b": JSON.stringify({ title: "示例长篇" })
      }
    }));
    const { entries, notes } = await listBooks(root);
    expect(notes).toEqual([]);
    expect(entries).toEqual([
      {
        id: "story-1",
        kind: "book",
        title: "示例短篇",
        path: join(root, "workspace-a")
      },
      {
        id: "long-1",
        kind: "long-book",
        title: "示例长篇",
        path: join(root, "workspace-b")
      }
    ]);
  });

  it("skips long entries marked for deletion", async () => {
    const root = await withFixture(async (root) => ({
      catalogRegistry: null,
      longRegistry: JSON.stringify({
        schemaVersion: 1,
        projects: [
          { bookId: "long-1", projectDirectory: join(root, "w1") },
          {
            bookId: "long-2",
            projectDirectory: join(root, "w2"),
            deletion: "1"
          }
        ]
      }),
      projectManifests: {}
    }));
    const { entries } = await listBooks(root);
    expect(entries.map((entry) => entry.id)).toEqual(["long-1"]);
  });

  it("falls back to the id when deepwrite.json is unreadable", async () => {
    const root = await withFixture(async (root) => ({
      catalogRegistry: JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            id: "story-1",
            domain: "book",
            projectDirectory: join(root, "workspace-a")
          }
        ]
      }),
      longRegistry: null,
      projectManifests: { "workspace-a": "{broken json" }
    }));
    const { entries } = await listBooks(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe("story-1");
  });

  it("returns an empty list with notes when registries are missing", async () => {
    const root = await withFixture(async () => ({
      catalogRegistry: null,
      longRegistry: null,
      projectManifests: {}
    }));
    const { entries, notes } = await listBooks(root);
    expect(entries).toEqual([]);
    expect(notes).toEqual([
      "未找到 catalog-registry.json，跳过短篇/资料注册表。",
      "未找到 long-project-registry.json，跳过长篇注册表。"
    ]);
  });

  it("fails friendly on corrupt catalog registry JSON", async () => {
    const root = await withFixture(async () => ({
      catalogRegistry: "{broken json",
      longRegistry: null,
      projectManifests: {}
    }));
    await expect(listBooks(root)).rejects.toThrow(CliError);
  });

  it("fails friendly on a schema-invalid catalog registry", async () => {
    const root = await withFixture(async () => ({
      catalogRegistry: JSON.stringify({ projects: [] }),
      longRegistry: null,
      projectManifests: {}
    }));
    await expect(listBooks(root)).rejects.toThrow(
      "catalog-registry.json 内容损坏"
    );
  });
});
