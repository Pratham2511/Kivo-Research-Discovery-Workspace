import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { validAiSettings, AI_PROVIDERS } from "../src/lib/ai-config.ts";
import { readAiSettings, saveAiSettings, clearAiSettings, aiHeaders } from "../src/lib/ai-browser.ts";
import { requestLlmConfig, llmComplete, LlmError } from "../src/lib/llm.ts";
import { POST as ask } from "../src/app/api/ask/route.ts";
import { POST as gloss } from "../src/app/api/gloss/route.ts";
import { textModelIds } from "../src/lib/ai-models.ts";
import { POST as modelsRoute } from "../src/app/api/ai/models/route.ts";
import { POST as probe } from "../src/app/api/ai/test/route.ts";

const settings = (suffix = "a") => ({ provider: "google", apiKey: "test-only-placeholder-" + suffix, model: "gemini-2.5-flash" });
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
  assert.equal(config.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
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
    assert.ok(url.startsWith(AI_PROVIDERS.google.baseUrl + "/models/"));
    assert.ok(url.endsWith(":generateContent"));
    assert.ok(JSON.parse(init.body).contents[0].parts[0].text);
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.match(init.headers["x-goog-api-key"], /^test-only-placeholder-/);
    assert.equal(init.headers.Authorization, undefined);
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({answer:"Retrieval improves accuracy.",quotes:[{page:2,text:quote}]})}]}}]});
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
  globalThis.fetch = async () => { calls++; return Response.json({candidates:[{content:{parts:[{text:"The neural network improves accuracy by 20 percent. Controlled tests measured retrieval performance."}]}}]}); };
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
    globalThis.fetch = async () => { calls++; return Response.json({candidates:[{content:{parts:[{text:"OK"}]}}]}); };
    const result = await probe(request("/api/ai/test",null,settings(),"probe-success"));
    assert.deepEqual(await result.json(),{ok:true,model:settings().model}); assert.equal(calls,1);
    globalThis.fetch = async () => { throw new Error("sensitive-network-message"); };
    await assert.rejects(llmComplete([{role:"user",content:"test"}],{config:requestLlmConfig(new Headers(aiHeaders(settings())))}),e=>e instanceof LlmError&&!e.message.includes("sensitive"));
  } finally { globalThis.fetch = original; }
});


test("model discovery normalizes Gemini IDs, excludes non-text models and works before a model is chosen", async () => {
  const catalog = {models:[
    {name:"models/gemini-2.5-flash",supportedGenerationMethods:["generateContent"]},
    {name:"models/gemini-2.5-flash-image",supportedGenerationMethods:["generateContent"]},
    {name:"models/gemini-embedding-001",supportedGenerationMethods:["embedContent"]},
    {name:"models/gemini-3.1-flash-lite",supportedGenerationMethods:["generateContent"]},
  ]};
  assert.deepEqual(textModelIds(catalog,true),["gemini-2.5-flash","gemini-3.1-flash-lite"]);
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    assert.equal(url,AI_PROVIDERS.google.baseUrl+"/models?pageSize=1000");
    assert.equal(init.headers["x-goog-api-key"],settings().apiKey);
    return Response.json(catalog);
  };
  try {
    const response=await modelsRoute(request("/api/ai/models",null,{...settings(),model:""},"catalog"));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
    assert.deepEqual((await response.json()).models,["gemini-2.5-flash","gemini-3.1-flash-lite"]);
  } finally {globalThis.fetch=original;}
});

test("a listed model cannot pass verification when its generation is rejected", async () => {
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async(url)=>{
    calls++; assert.ok(url.endsWith(":generateContent"));
    return Response.json([{error:{code:400,status:"FAILED_PRECONDITION",message:"Billing tier unavailable test-only-placeholder-private"}}],{status:400});
  };
  try {
    const response=await probe(request("/api/ai/test",null,settings(),"generation-rejected"));
    assert.equal(response.status,400);
    const body=await response.json();
    assert.match(body.error,/billing tier/); assert.doesNotMatch(body.error,/placeholder/);assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});

test("native Gemini converts roles, keeps the system prompt, strips thought parts and preserves retries", async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    const payload=JSON.parse(init.body);
    assert.equal(payload.systemInstruction.parts[0].text,"Only source text.");
    assert.deepEqual(payload.contents.map(m=>m.role),["user","model","user"]);
    assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget,0);
    return Response.json({candidates:[{content:{parts:[{thought:true,text:"hidden reasoning"},{text:"Final answer"}]}}]});
  };
  try {
    const result=await llmComplete([{role:"system",content:"Only source text."},{role:"user",content:"Question"},{role:"assistant",content:"Bad JSON"},{role:"user",content:"Retry JSON"}],{config:requestLlmConfig(new Headers(aiHeaders(settings())))});
    assert.equal(result,"Final answer");
  } finally {globalThis.fetch=original;}
});
