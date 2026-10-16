import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { validAiSettings, AI_PROVIDERS } from "../src/lib/ai-config.ts";
import { readAiSettings, saveAiSettings, clearAiSettings, aiHeaders } from "../src/lib/ai-browser.ts";
import { requestLlmConfig, llmComplete, LlmError } from "../src/lib/llm.ts";
import { POST as ask } from "../src/app/api/ask/route.ts";
import { POST as gloss } from "../src/app/api/gloss/route.ts";
import { POST as probe } from "../src/app/api/ai/test/route.ts";

const settings = (suffix = "a") => ({ provider: "google", apiKey: "test-only-placeholder-" + suffix, model: AI_PROVIDERS.google.model });
function request(path, body, config, ip = "test") {
  return new NextRequest("http://localhost" + path, { method: "POST", headers: { ...aiHeaders(config ?? null), "x-forwarded-for": ip }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test("browser credentials stay in session storage, clear cleanly, and reject malformed settings", () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  saveAiSettings(settings());
  assert.equal(readAiSettings()?.provider, "google");
  assert.equal(aiHeaders()["X-Kivo-AI-Key"], settings().apiKey);
  clearAiSettings();
  assert.equal(readAiSettings(), null);
  assert.equal(aiHeaders()["X-Kivo-AI-Key"], undefined);
  for (const change of [{provider:"__proto__"}, {provider:"http://localhost"}, {apiKey:"bad\nkey"}, {model:"invalid\nmodel"}]) {
    assert.equal(validAiSettings({...settings(), ...change}), false);
  }
  delete globalThis.sessionStorage;
});

test("request config uses fixed HTTPS provider endpoints without changing deployment credentials", () => {
  const before = process.env.LLM_API_KEY;
  const config = requestLlmConfig(new Headers(aiHeaders(settings())));
  assert.equal(config.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(process.env.LLM_API_KEY, before);
  assert.throws(() => requestLlmConfig(new Headers({"x-kivo-ai-provider":"custom", "x-kivo-ai-key":"test-only", "x-kivo-ai-model":"model"})), LlmError);
});

test("grounded PDF Q&A isolates credentials and caches by key and model", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const quote = "The experiment found that retrieval improves accuracy by 20 percent.";
  const body = { paperId:"public-fixture", question:"What improves accuracy?", passages:[{page:2,text:quote}] };
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, AI_PROVIDERS.google.baseUrl + "/chat/completions");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.match(init.headers.Authorization, /^Bearer test-only-placeholder-/);
    return Response.json({choices:[{message:{content:JSON.stringify({answer:"Retrieval improves accuracy.",quotes:[{page:2,text:quote}]})}}]});
  };
  try {
    const first = await ask(request("/api/ask",body,settings("first")));
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    assert.equal((await first.json()).quotes[0].page, 2);
    assert.equal((await (await ask(request("/api/ask",body,settings("first")))).json()).cached, true);
    assert.equal(calls, 1);
    await ask(request("/api/ask",body,settings("second")));
    await ask(request("/api/ask",body,{...settings("first"),model:"another-model"}));
    assert.equal(calls, 3);
    const disabled = await (await ask(request("/api/ask",body,null))).json();
    assert.equal(disabled.reason, "not-configured");
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});

test("abstract rewrite uses the browser provider and preserves terms and numbers", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const abstract = "The neural network improves accuracy by 20 percent across repeated experiments. This study measures reliable retrieval performance using controlled evaluation.";
  globalThis.fetch = async () => { calls++; return Response.json({choices:[{message:{content:"The neural network improves accuracy by 20 percent. Controlled tests measured retrieval performance."}}]}); };
  try {
    const body = {paperId:"public-fixture",abstract,terms:["neural network"]};
    const result = await (await gloss(request("/api/gloss",body,settings("rewrite")))).json();
    assert.match(result.rewrite,/20/); assert.deepEqual(result.keptTerms,["neural network"]);
    await gloss(request("/api/gloss",body,settings("different-user")));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("provider failures redact upstream bodies and connection probe makes one call", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401,403,404,429,500]) {
      globalThis.fetch = async () => Response.json({error:{message:"DO NOT ECHO test-only-placeholder-private"}},{status});
      const result = await probe(request("/api/ai/test",null,settings(),"failure-"+status));
      const body = JSON.stringify(await result.json());
      assert.notEqual(result.status, 200); assert.doesNotMatch(body,/placeholder|DO NOT ECHO/);
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({choices:[{message:{content:"OK"}}]}); };
    const result = await probe(request("/api/ai/test",null,settings(),"probe-success"));
    assert.deepEqual(await result.json(),{ok:true}); assert.equal(calls,1);
    globalThis.fetch = async () => { throw new Error("sensitive-network-message"); };
    await assert.rejects(llmComplete([{role:"user",content:"test"}],{config:requestLlmConfig(new Headers(aiHeaders(settings())))}),e=>e instanceof LlmError&&!e.message.includes("sensitive"));
  } finally { globalThis.fetch = original; }
});
