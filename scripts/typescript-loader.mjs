import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  let url;
  if (specifier.startsWith("@/")) url = new URL("../src/" + specifier.slice(2), import.meta.url);
  else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) url = new URL(specifier, context.parentURL);
  if (url) {
    for (const suffix of ["", ".ts", ".tsx", ".mjs", ".js"]) {
      const candidate = new URL(url.href + suffix);
      try { await access(fileURLToPath(candidate)); return { url: candidate.href, shortCircuit: true }; } catch { /* next extension */ }
    }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (/\.tsx?$/.test(url)) {
    const source = await readFile(new URL(url), "utf8");
    return { format: "module", source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      fileName: fileURLToPath(url),
    }).outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
