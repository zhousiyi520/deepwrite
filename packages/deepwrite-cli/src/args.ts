import { CliError } from "./cli-error";

export type CliCommand = "version" | "models" | "books" | "smoke";

export interface CliArgs {
  command: CliCommand | undefined;
  userData?: string;
}

const COMMANDS: readonly CliCommand[] = ["models", "books", "smoke"];
const USER_DATA_FLAG = "--user-data";

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let command: CliCommand | undefined;
  let userData: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) break;
    if (token === USER_DATA_FLAG || token.startsWith(`${USER_DATA_FLAG}=`)) {
      const inline = token.startsWith(`${USER_DATA_FLAG}=`);
      const value = inline
        ? token.slice(USER_DATA_FLAG.length + 1)
        : argv[index + 1];
      if (value === undefined || value === "") {
        throw new CliError("--user-data 需要一个目录路径参数。");
      }
      if (userData !== undefined) {
        throw new CliError("--user-data 只能指定一次。");
      }
      userData = value;
      if (!inline) index += 1;
      continue;
    }
    if (token === "--version") {
      command = requireSingleCommand(command, "version");
      continue;
    }
    const positional = COMMANDS.find((candidate) => candidate === token);
    if (positional !== undefined) {
      command = requireSingleCommand(command, positional);
      continue;
    }
    throw new CliError(
      `未知参数：${token}。可用命令：--version、models、books、smoke；可用选项：--user-data <目录>。`
    );
  }
  const args: CliArgs = { command };
  if (userData !== undefined) args.userData = userData;
  return args;
}

function requireSingleCommand(
  current: CliCommand | undefined,
  next: CliCommand
): CliCommand {
  if (current !== undefined) {
    throw new CliError(`只能指定一个命令，同时收到：${current} 和 ${next}。`);
  }
  return next;
}
