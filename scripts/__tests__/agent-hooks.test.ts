/// <reference types="node" />
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  QualityGatesPlugin,
  type LintRunner,
} from "../../.kilo/plugins/quality-gates";

const root = process.cwd();
const fixtureDir = path.join(root, "src", "__agent_hooks_probe__");
const brokenFile = "src/__agent_hooks_probe__/broken.tsx";
const cleanFile = "src/__agent_hooks_probe__/clean.ts";

const brokenSource = `import { useState } from "react";

export function Broken({ on }: { on: boolean }) {
  if (on) {
    const [value] = useState(0);
    return <>{value}</>;
  }
  return null;
}
`;

const cleanSource = `export const answer = 42;
`;

async function runHook(
  args: unknown,
  options: { tool?: string; runner?: LintRunner; pluginRoot?: string } = {},
) {
  const plugin = await QualityGatesPlugin(
    { directory: options.pluginRoot ?? root, worktree: options.pluginRoot ?? root } as never,
    options.runner ? { runLint: options.runner } : {},
  );
  const output = {
    title: "edit",
    output: "ok: edited",
    metadata: undefined as unknown,
  };
  await plugin["tool.execute.after"]!(
    { tool: options.tool ?? "edit", sessionID: "session-1", callID: "call-1", args },
    output as never,
  );
  return output;
}

function stubRunner(result = { ok: true, output: "" }) {
  return vi.fn<LintRunner>(async () => result);
}

beforeAll(() => {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(path.join(root, brokenFile), brokenSource, "utf8");
  writeFileSync(path.join(root, cleanFile), cleanSource, "utf8");
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe("quality-gates per-edit hook", () => {
  it("reports ESLint errors for the edited file through the tool output", async () => {
    const output = await runHook({ filePath: brokenFile });

    expect(output.output).toContain("[quality-gates]");
    expect(output.output).toContain(brokenFile.replaceAll("\\", "/").split("/").pop()!);
    expect(output.output).toContain("react-hooks/rules-of-hooks");
    expect(output.output.startsWith("ok: edited")).toBe(true);
    expect(output.metadata).toMatchObject({ qualityGates: { failed: true } });
  });

  it("reports ESLint errors when the host runtime is the kilo binary", async () => {
    const originalExecPath = process.execPath;
    Object.defineProperty(process, "execPath", {
      value: path.join(os.tmpdir(), "kilo"),
      configurable: true,
    });

    try {
      const output = await runHook({ filePath: brokenFile });

      expect(output.output).toContain("react-hooks/rules-of-hooks");
      expect(output.output).not.toContain("Commands:");
      expect(output.metadata).toMatchObject({ qualityGates: { failed: true } });
    } finally {
      Object.defineProperty(process, "execPath", { value: originalExecPath, configurable: true });
    }
  });

  it("leaves the tool output untouched for a clean file", async () => {
    const output = await runHook({ filePath: cleanFile });

    expect(output.output).toBe("ok: edited");
    expect(output.metadata).toBeUndefined();
  });

  it("skips a file the linter does not cover", async () => {
    const runner = stubRunner();
    const output = await runHook({ filePath: "README.md" }, { runner });

    expect(runner).not.toHaveBeenCalled();
    expect(output.output).toBe("ok: edited");
  });

  it("skips a path that does not exist", async () => {
    const runner = stubRunner();
    const output = await runHook({ filePath: "src/__agent_hooks_probe__/missing.ts" }, { runner });

    expect(runner).not.toHaveBeenCalled();
    expect(output.output).toBe("ok: edited");
  });

  it("skips empty and non-edit payloads", async () => {
    const runner = stubRunner();

    const empty = await runHook({}, { runner });
    const noArgs = await runHook(undefined, { runner });
    const notJson = await runHook("not json", { runner });
    const readTool = await runHook({ filePath: brokenFile }, { tool: "read", runner });

    expect(runner).not.toHaveBeenCalled();
    for (const output of [empty, noArgs, notJson, readTool]) {
      expect(output.output).toBe("ok: edited");
    }
  });

  it("fails loudly when the linter is missing", async () => {
    const otherRoot = mkdtempSync(path.join(os.tmpdir(), "quality-gates-"));
    try {
      writeFileSync(path.join(otherRoot, "probe.ts"), cleanSource, "utf8");
      const output = await runHook({ filePath: "probe.ts" }, { pluginRoot: otherRoot });

      expect(output.output).toContain("eslint is not installed");
      expect(output.metadata).toMatchObject({ qualityGates: { failed: true } });
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("checks every file in a multi-file payload", async () => {
    const output = await runHook({ edits: [{ filePath: cleanFile }, { filePath: brokenFile }] });

    expect(output.output).toContain("[quality-gates]");
    expect(output.output).toContain("broken.tsx");
    expect(output.output).toContain("react-hooks/rules-of-hooks");
  });

  it("ignores files outside the checkout", async () => {
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), "quality-gates-outside-"));
    try {
      const outsideFile = path.join(outsideRoot, "outside.ts");
      writeFileSync(outsideFile, cleanSource, "utf8");
      const runner = stubRunner();
      const output = await runHook({ filePath: outsideFile }, { runner });

      expect(runner).not.toHaveBeenCalled();
      expect(output.output).toBe("ok: edited");
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("reads file paths out of an apply_patch payload", async () => {
    const runner = stubRunner({ ok: false, output: "patch failure" });
    const command = `*** Begin Patch\n*** Update File: ${brokenFile}\n*** End Patch`;
    const output = await runHook({ command }, { tool: "apply_patch", runner });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][1]).toEqual([path.join(root, brokenFile)]);
    expect(output.output).toContain("patch failure");
  });
});
