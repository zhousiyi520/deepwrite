import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DeviceSyncCatalogRegistrySchema,
  DeviceSyncLongRegistrySchema,
  DeviceSyncTitleSchema
} from "@deepwrite/contracts";
import { CliError } from "../cli-error";
import { renderTable } from "../table";

export interface CliBookEntry {
  id: string;
  kind: string;
  title: string;
  path: string;
}

export interface CliBookList {
  entries: CliBookEntry[];
  notes: string[];
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readOptionalJson(path: string, label: string): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw new CliError(`无法读取${label}：${path}。`);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new CliError(`${label}损坏，无法解析 JSON：${path}。`);
  }
}

async function readBookTitle(
  projectDirectory: string,
  fallbackId: string
): Promise<string> {
  try {
    const source = await readFile(
      join(projectDirectory, "deepwrite.json"),
      "utf8"
    );
    const parsed = DeviceSyncTitleSchema.safeParse(JSON.parse(source));
    return parsed.success ? parsed.data.title : fallbackId;
  } catch {
    return fallbackId;
  }
}

export async function listBooks(userDataDir: string): Promise<CliBookList> {
  const entries: CliBookEntry[] = [];
  const notes: string[] = [];

  const catalog = await readOptionalJson(
    join(userDataDir, "catalog-registry.json"),
    "作品注册表 catalog-registry.json"
  );
  if (catalog === null) {
    notes.push("未找到 catalog-registry.json，跳过短篇/资料注册表。");
  } else {
    const registry = DeviceSyncCatalogRegistrySchema.safeParse(catalog);
    if (!registry.success) {
      throw new CliError("catalog-registry.json 内容损坏，无法读取。");
    }
    for (const project of registry.data.projects) {
      entries.push({
        id: project.id,
        kind: project.domain,
        title: await readBookTitle(project.projectDirectory, project.id),
        path: project.projectDirectory
      });
    }
  }

  const long = await readOptionalJson(
    join(userDataDir, "long-project-registry.json"),
    "长篇注册表 long-project-registry.json"
  );
  if (long === null) {
    notes.push("未找到 long-project-registry.json，跳过长篇注册表。");
  } else {
    const registry = DeviceSyncLongRegistrySchema.safeParse(long);
    if (!registry.success) {
      throw new CliError("long-project-registry.json 内容损坏，无法读取。");
    }
    for (const project of registry.data.projects) {
      if (project.deletion) continue;
      entries.push({
        id: project.bookId,
        kind: "long-book",
        title: await readBookTitle(project.projectDirectory, project.bookId),
        path: project.projectDirectory
      });
    }
  }

  return { entries, notes };
}

export async function runBooksCommand(userDataDir: string): Promise<void> {
  const { entries, notes } = await listBooks(userDataDir);
  for (const note of notes) console.log(note);
  if (entries.length === 0) {
    console.log("未找到已注册的作品。");
    return;
  }
  console.log(
    renderTable(
      ["id", "kind", "title", "path"],
      entries.map((entry) => [entry.id, entry.kind, entry.title, entry.path])
    )
  );
}
