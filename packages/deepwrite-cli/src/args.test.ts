import { describe, expect, it } from "vitest";
import { CliError } from "./cli-error";
import { parseCliArgs } from "./args";

describe("parseCliArgs", () => {
  it("parses --version", () => {
    expect(parseCliArgs(["--version"])).toEqual({ command: "version" });
  });

  it("parses the models command", () => {
    expect(parseCliArgs(["models"])).toEqual({ command: "models" });
  });

  it("parses the books command", () => {
    expect(parseCliArgs(["books"])).toEqual({ command: "books" });
  });

  it("parses the smoke command", () => {
    expect(parseCliArgs(["smoke"])).toEqual({ command: "smoke" });
  });

  it("returns no command for empty argv", () => {
    expect(parseCliArgs([])).toEqual({ command: undefined });
  });

  it("reads --user-data from the next token", () => {
    expect(parseCliArgs(["models", "--user-data", "E:/fixture/data"])).toEqual({
      command: "models",
      userData: "E:/fixture/data"
    });
  });

  it("reads the --user-data=<path> form", () => {
    expect(parseCliArgs(["books", "--user-data=E:/fixture/data"])).toEqual({
      command: "books",
      userData: "E:/fixture/data"
    });
  });

  it("accepts --user-data before the command", () => {
    expect(parseCliArgs(["--user-data", "E:/fixture/data", "models"])).toEqual({
      command: "models",
      userData: "E:/fixture/data"
    });
  });

  it("rejects unknown flags with a friendly error", () => {
    expect(() => parseCliArgs(["--json"])).toThrow(CliError);
  });

  it("rejects unknown positionals with a friendly error", () => {
    expect(() => parseCliArgs(["deploy"])).toThrow(CliError);
  });

  it("rejects multiple commands", () => {
    expect(() => parseCliArgs(["models", "books"])).toThrow(CliError);
  });

  it("rejects --user-data without a value", () => {
    expect(() => parseCliArgs(["models", "--user-data"])).toThrow(CliError);
  });

  it("rejects a repeated --user-data", () => {
    expect(() =>
      parseCliArgs(["models", "--user-data=E:/a", "--user-data=E:/b"])
    ).toThrow(CliError);
  });
});
