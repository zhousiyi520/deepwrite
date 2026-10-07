import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "./cli-error";
import { resolveUserDataDir } from "./user-data";

describe("resolveUserDataDir", () => {
  it("prefers the explicit --user-data path", () => {
    expect(resolveUserDataDir("E:/fixture/data", "C:/AppData/Roaming")).toBe(
      "E:/fixture/data"
    );
  });

  it("joins the desktop shared directory under the APPDATA root", () => {
    expect(
      resolveUserDataDir(
        undefined,
        "C:/Users/user.example.test/AppData/Roaming"
      )
    ).toBe(
      join(
        "C:/Users/user.example.test/AppData/Roaming",
        "@deepwrite",
        "desktop"
      )
    );
  });

  it("treats an empty --user-data as unset", () => {
    expect(resolveUserDataDir("", "C:/AppData/Roaming")).toBe(
      join("C:/AppData/Roaming", "@deepwrite", "desktop")
    );
  });

  it("fails with a friendly message when APPDATA is missing", () => {
    expect(() => resolveUserDataDir(undefined, undefined)).toThrow(CliError);
  });
});
