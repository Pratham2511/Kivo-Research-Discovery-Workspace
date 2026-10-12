import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emptyWorkspace } from "../src/lib/workspace/schema.ts";
import { searchPage, sortSearchPapers, searchValidation } from "../src/lib/workspace/search.ts";
import { persistWorkspace } from "../src/lib/workspace/persistence.ts";
import { newestSnapshot, nextSaveTime } from "../src/lib/workspace/storage-snapshot.ts";
import { LocalStorageEngine } from "../src/lib/workspace/storage-engine.ts";
import { resolvePaperAccess, safePaperUrl } from "../src/components/workspace/source-resolver.ts";
import { extractBrowserPdf } from "../src/lib/workspace/pdf-browser.ts";
import { bibliography, csv } from "../src/lib/workspace/exports.ts";

function paper(id, extra = {}) {
  return { id, title: "Paper " + id, authors: ["Researcher"], abstract: "A scholarly abstract.", year: 2024,
    doi: null, pdfLink: null, citationCount: null, publisher: null, sources: ["Crossref"], sourceUrls: [],
    keywords: [], openAccess: null, paperType: "article", venue: null, ...extra };
}

test("all 150 retrieved papers are reachable in 20-paper pages, without duplicates or omissions", () => {
  const papers = Array.from({ length: 150 }, (_, i) => paper(String(i)));
  const collected = [];
  for (let page = 0; page < 8; page++) collected.push(...searchPage(papers, page).papers.map(p => p.id));
  assert.deepEqual(collected, papers.map(p => p.id));
  assert.equal(searchPage(papers, 7).papers.length, 10);
  assert.equal(searchPage(papers, 99).page, 7);
});
test("pagination handles zero records and a final page after filtering", () => {
  assert.deepEqual(searchPage([], 4), { page: 0, pages: 1, papers: [] });
  assert.equal(searchPage([paper("only")], 7).papers[0].id, "only");
});
test("sorting can return to original relevance order", () => {
  const papers = [paper("best", {year: 2020}), paper("new", {year: 2026})];
  assert.equal(sortSearchPapers(papers, "year")[0].id, "new");
  assert.equal(sortSearchPapers(papers, "relevance")[0].id, "best");
  assert.equal(papers[0].id, "best");
});
test("reversed years and invalid citation filters have actionable validation", () => {
  assert.match(searchValidation("graphs", {yearFrom:2026, yearTo:2020}, ["Crossref"]), /start year/i);
  assert.match(searchValidation("graphs", {minCitations:-1}, ["Crossref"]), /whole number/i);
  assert.equal(searchValidation("graphs", {yearFrom:2020, yearTo:2026}, ["Crossref"]), null);
});

test("IndexedDB success counts as durable even when localStorage is full", async () => {
  let saved;
  const result = await persistWorkspace(emptyWorkspace(), {load:async()=>null, save:async state=>{saved=state;}}, {saveSync:()=>false});
  assert.ok(saved);
  assert.deepEqual(result, {durable:true, error:""});
});
test("localStorage remains a durable fallback when IndexedDB is unavailable", async () => {
  const result = await persistWorkspace(emptyWorkspace(), {load:async()=>null, save:async()=>{throw new Error("blocked");}}, {saveSync:()=>true});
  assert.deepEqual(result, {durable:true, error:""});
});
test("failure of both stores is never reported as synced or durable", async () => {
  const result = await persistWorkspace(emptyWorkspace(), {load:async()=>null, save:async()=>{throw new Error("quota");}}, {saveSync:()=>false});
  assert.equal(result.durable, false);
  assert.match(result.error, /backup before closing/i);
});
test("an unexpected cache exception does not negate a successful IndexedDB write", async () => {
  const result = await persistWorkspace(emptyWorkspace(), {load:async()=>null, save:async()=>{}}, {saveSync:()=>{throw new Error("disabled");}});
  assert.equal(result.durable, true);
});
test("a newer fallback survives reopening after an IndexedDB write failure", () => {
  const old = {state:emptyWorkspace(), savedAt:nextSaveTime()};
  const recent = {state:emptyWorkspace(), savedAt:nextSaveTime()};
  recent.state.papers.push(paper("fallback-draft"));
  assert.equal(newestSnapshot(old, recent).state.papers[0].id, "fallback-draft");
  assert.equal(newestSnapshot(recent, old), recent);
});
test("a durable write stamps both stores with the same revision", async () => {
  let indexedTime, cacheTime;
  await persistWorkspace(emptyWorkspace(), {save:async(_, time)=>{indexedTime=time;}}, {saveSync:(_, time)=>{cacheTime=time;return true;}});
  assert.equal(indexedTime, cacheTime);
  assert.ok(Date.parse(indexedTime) > 0);
});
test("cache read failure keeps the latest in-memory draft available for backup", () => {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.window = {};
    globalThis.localStorage = {getItem:()=>{throw new Error("blocked");}, setItem:()=>{throw new Error("quota");}};
    const cache = new LocalStorageEngine();
    const draft = emptyWorkspace(); draft.papers.push(paper("preserved"));
    assert.equal(cache.saveSync(draft), false);
    assert.equal(cache.loadSync().papers[0].id, "preserved");
  } finally { globalThis.window = previousWindow; globalThis.localStorage = previousStorage; }
});

test("DOI-only records resolve to a source, never a PDF", () => {
  const access = resolvePaperAccess(paper("doi", {doi:"https://doi.org/10.1038/nature14539"}));
  assert.equal(access.hasDirectPdf, false);
  assert.equal(access.primaryAction.url, "https://doi.org/10.1038/nature14539");
  assert.match(access.primaryAction.label, /source/i);
});
test("arXiv IDs resolve to an official HTTPS PDF", () => {
  const access = resolvePaperAccess(paper("arxiv", {identifiers:{arxiv:"2402.10612v3"}}));
  assert.equal(access.directPdfUrl, "https://arxiv.org/pdf/2402.10612v3");
});
test("unsafe or malformed upstream links are not shown", () => {
  for (const url of ["javascript:alert(1)", "not a url", "https://user:password@example.com/a"]) assert.equal(safePaperUrl(url), null);
  const access = resolvePaperAccess(paper("broken", {pdfLink:"javascript:alert(1)",doi:"not-a-doi"}));
  assert.equal(access.hasAccess, false);
});
test("filtered exports retain only selected records and escape spreadsheet formulas", () => {
  const selected = [paper("chosen", {title:"Chosen paper", doi:"10.1000/chosen"})];
  const bib = bibliography(selected, "bib");
  assert.match(bib, /Chosen paper/);
  assert.equal((bib.match(/@article/g) ?? []).length, 1);
  assert.match(csv([["=SUM(A1:A2)"]]), /'=SUM/);
});

test("browser PDF validation rejects empty, non-PDF, and oversized files before processing", async () => {
  await assert.rejects(extractBrowserPdf(new File([], "empty.pdf")), /empty/i);
  await assert.rejects(extractBrowserPdf(new File(["not a PDF"], "fake.pdf")), /not a PDF/i);
  await assert.rejects(extractBrowserPdf({size:16*1024*1024}), /15 MB/);
});

test("PDF extraction retains page text and completes its document lifecycle", async () => {
  const bytes = await readFile(new URL("./fixtures/evidence.pdf", import.meta.url));
  const extracted = await extractBrowserPdf(new File([bytes], "evidence.pdf"));
  assert.equal(extracted.pages.length, 1);
  assert.equal(extracted.pages[0].page, 1);
  assert.match(extracted.pages[0].text, /Verbatim evidence should retain this sentence/);
  assert.match(extracted.hash, /^[a-f0-9]{64}$/);
  assert.equal(extracted.truncated, false);
});
