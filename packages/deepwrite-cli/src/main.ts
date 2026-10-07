import { parseCliArgs } from "./args";
import { runBooksCommand } from "./commands/books";
import { runModelsCommand } from "./commands/models";
import { runVersionCommand } from "./commands/version";
import { CliError } from "./cli-error";
import { resolveUserDataDir } from "./user-data";

async function dispatch(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  switch (args.command) {
    case undefined:
      console.error(
        "用法：deepwrite-cli <命令> [--user-data <目录>]\n命令：--version、models、books、smoke"
      );
      return 1;
    case "version":
      runVersionCommand();
      return 0;
    case "smoke":
      console.error("smoke 命令尚未实现。");
      return 1;
    case "models":
      await runModelsCommand(
        resolveUserDataDir(args.userData, process.env.APPDATA)
      );
      return 0;
    case "books":
      await runBooksCommand(
        resolveUserDataDir(args.userData, process.env.APPDATA)
      );
      return 0;
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await dispatch();
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
    } else {
      console.error("命令执行失败，请检查用户数据目录是否可读。");
    }
    process.exitCode = 1;
  }
}

await main();
