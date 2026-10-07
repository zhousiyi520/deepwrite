import packageJson from "../../package.json" with { type: "json" };

export function cliVersion(): string {
  return packageJson.version;
}

export function runVersionCommand(): void {
  console.log(cliVersion());
}
