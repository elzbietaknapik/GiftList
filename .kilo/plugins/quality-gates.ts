/// <reference types="node" />
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "@kilocode/plugin";

const LINTABLE = /\.(?:[cm]?[jt]sx?)$/i;
const EDIT_TOOLS = new Set([
  "edit",
  "write",
  "multi_edit",
  "multiedit",
  "patch",
  "apply_patch",
  "create",
  "edit_file",
  "write_file",
]);
const MAX_FEEDBACK = 4000;

export type LintResult = { ok: boolean; output: string };
export type LintRunner = (root: string, files: string[]) => Promise<LintResult>;

function truncate(text: string): string {
  return text.length > MAX_FEEDBACK ? `${text.slice(0, MAX_FEEDBACK)}\n… (truncated)` : text;
}

export function eslintEntry(root: string): string | null {
  const entry = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
  return existsSync(entry) ? entry : null;
}

export function nodeBinary(): string {
  const configured = process.env.QUALITY_GATES_NODE?.trim();
  if (configured) return configured;
  const npmNode = process.env.npm_node_execpath?.trim();
  return npmNode || "node";
}

export const runEslint: LintRunner = (root, files) =>
  new Promise((resolve) => {
    const entry = eslintEntry(root);
    if (!entry) {
      resolve({
        ok: false,
        output: `eslint is not installed under ${path.join(root, "node_modules", "eslint")} — nothing was verified.`,
      });
      return;
    }
    execFile(
      nodeBinary(),
      [entry, "--quiet", "--no-color", ...files],
      {
        cwd: root,
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", GREP_OPTIONS: "" },
      },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        if (!error) {
          resolve({ ok: true, output });
          return;
        }
        resolve({ ok: false, output: output || String(error.message) });
      },
    );
  });

function patchPaths(text: string): string[] {
  if (!text.includes("*** ")) return [];
  return text.split(/\r?\n/).flatMap((line) => {
    const match = /^\*\*\* (?:Update File|Add File|Move to): (.+)$/.exec(line);
    return match ? [match[1].trim()] : [];
  });
}

export function collectEditedPaths(args: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string") {
        if (/^(?:filePath|file_path|filepath|path)$/i.test(key)) {
          found.add(child);
        } else if (/^(?:patch|patchText|patch_text|diff|input|command)$/i.test(key)) {
          for (const p of patchPaths(child)) found.add(p);
        }
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(args, 0);
  return [...found];
}

export function resolveLintable(root: string, candidates: string[]): string[] {
  const resolved = new Set<string>();
  for (const candidate of candidates) {
    if (!LINTABLE.test(candidate)) continue;
    const absolute = path.isAbsolute(candidate) ? path.normalize(candidate) : path.resolve(root, candidate);
    const relative = path.relative(root, absolute);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    if (!existsSync(absolute)) continue;
    resolved.add(absolute);
  }
  return [...resolved];
}

export function formatFeedback(root: string, files: string[], output: string): string {
  const names = files.map((file) => path.relative(root, file)).join(", ");
  return `\n\n[quality-gates] ESLint failed for ${names}. Fix these before continuing:\n${truncate(output.trim())}`;
}

export const QualityGatesPlugin: Plugin = async (input, options) => {
  const root = input.worktree || input.directory;
  const runner = (options?.runLint as LintRunner | undefined) ?? runEslint;

  return {
    "tool.execute.after": async (event, output) => {
      const tool = typeof event?.tool === "string" ? event.tool.toLowerCase() : "";
      if (!EDIT_TOOLS.has(tool)) return;

      const files = resolveLintable(root, collectEditedPaths(event?.args));
      if (files.length === 0) return;

      const result = await runner(root, files);
      if (result.ok) return;

      const previous = typeof output.output === "string" ? output.output : "";
      output.output = `${previous}${formatFeedback(root, files, result.output)}`;
      output.metadata = {
        ...(output.metadata && typeof output.metadata === "object" ? output.metadata : {}),
        qualityGates: { failed: true, files: files.map((file) => path.relative(root, file)), output: result.output },
      };
    },
  };
};

export default QualityGatesPlugin;
