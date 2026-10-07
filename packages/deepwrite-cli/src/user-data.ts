import { join } from "node:path";
import { CliError } from "./cli-error";

/**
 * Pure resolution: an explicit --user-data path wins; otherwise the desktop
 * shared userData directory (`<APPDATA>/@deepwrite/desktop`) is derived from
 * the given APPDATA root. Throws a friendly CliError when neither exists.
 */
export function resolveUserDataDir(
  raw: string | undefined,
  appData: string | undefined
): string {
  if (raw !== undefined && raw !== "") return raw;
  if (appData === undefined || appData === "") {
    throw new CliError(
      "无法确定用户数据目录：环境变量 APPDATA 未设置。请用 --user-data <目录> 显式指定。"
    );
  }
  return join(appData, "@deepwrite", "desktop");
}
