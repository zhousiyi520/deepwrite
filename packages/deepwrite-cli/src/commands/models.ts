import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CliError } from "../cli-error";
import { renderTable } from "../table";

/**
 * Loose view of a model entry on disk. Deliberately picks only identity
 * fields and ignores every other key: this command must never read or print
 * credential material such as the top-level `encryptedApiKeys` map.
 */
const ModelEntrySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    provider: z.string().min(1),
    modelId: z.string().min(1),
    api: z.string().optional(),
    baseUrl: z.string().optional(),
    managedBy: z.string().optional()
  })
  .passthrough();

const ModelsFileSchema = z
  .object({ models: z.array(z.unknown()) })
  .passthrough();

export interface CliModelEntry {
  id: string;
  label: string;
  provider: string;
  modelId: string;
  api: string | undefined;
  baseUrl: string | undefined;
  managedBy: string | undefined;
}

export function parseModelEntries(source: string): CliModelEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(source) as unknown;
  } catch {
    throw new CliError("模型配置文件损坏，无法解析 JSON。");
  }
  const file = ModelsFileSchema.safeParse(raw);
  if (!file.success) {
    throw new CliError("模型配置文件损坏，缺少 models 列表。");
  }
  const entries: CliModelEntry[] = [];
  for (const candidate of file.data.models) {
    const parsed = ModelEntrySchema.safeParse(candidate);
    if (!parsed.success) continue;
    entries.push({
      id: parsed.data.id,
      label: parsed.data.label,
      provider: parsed.data.provider,
      modelId: parsed.data.modelId,
      api: parsed.data.api,
      baseUrl: parsed.data.baseUrl,
      managedBy: parsed.data.managedBy
    });
  }
  return entries;
}

export async function loadModelEntries(
  userDataDir: string
): Promise<CliModelEntry[]> {
  const path = join(userDataDir, "config", "models.json");
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new CliError(`无法读取模型配置文件：${path}（缺失或不可读）。`);
  }
  return parseModelEntries(source);
}

export async function runModelsCommand(userDataDir: string): Promise<void> {
  const entries = await loadModelEntries(userDataDir);
  if (entries.length === 0) {
    console.log("未找到模型条目。");
    return;
  }
  console.log(
    renderTable(
      ["id", "label", "provider", "modelId"],
      entries.map((entry) => [
        entry.id,
        entry.label,
        entry.provider,
        entry.modelId
      ])
    )
  );
}
