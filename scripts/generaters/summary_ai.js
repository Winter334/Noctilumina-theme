var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_node_crypto = require("node:crypto");
var import_promises = __toESM(require("node:fs/promises"));
const THINK_TAG_RE = /<think>[\s\S]*?<\/think>/gi;
function appendContent(parts, content) {
  if (!content)
    return;
  if (typeof content === "string") {
    parts.push(content);
    return;
  }
  if (Array.isArray(content)) {
    for (const item of content)
      appendContent(parts, item);
    return;
  }
  if (typeof content === "object") {
    if (typeof content.text === "string")
      parts.push(content.text);
    else if (typeof content.content === "string")
      parts.push(content.content);
    else if (Array.isArray(content.content))
      appendContent(parts, content.content);
  }
}
function extractChoiceContent(choice) {
  const parts = [];
  appendContent(parts, choice?.delta?.content);
  appendContent(parts, choice?.message?.content);
  return parts.join("");
}
function sanitizeOutput(text) {
  if (!text)
    return "";
  return text.replace(THINK_TAG_RE, "").replace(/<think>|<\/think>/gi, "").replace(/\r/g, "").split("\n").map((line) => line.replace(/^\s*[-*•]+\s*/, "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function parseSseStream(raw) {
  const parts = [];
  let eventBuffer = [];
  const flushEvent = () => {
    if (!eventBuffer.length)
      return;
    const data = eventBuffer.join("\n").trim();
    eventBuffer = [];
    if (!data || data === "[DONE]")
      return;
    try {
      const payload = JSON.parse(data);
      const choice = Array.isArray(payload.choices) ? payload.choices[0] || {} : {};
      const content = extractChoiceContent(choice);
      if (content)
        parts.push(content);
    } catch (error) {
    }
  };
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (!line.trim()) {
      flushEvent();
      continue;
    }
    if (!line.startsWith("data:"))
      continue;
    eventBuffer.push(line.slice(5).trim());
  }
  flushEvent();
  return sanitizeOutput(parts.join(""));
}
function parseJsonBody(raw) {
  const payload = JSON.parse(raw);
  if (payload?.error) {
    const message = payload.error.message || payload.error.code || JSON.stringify(payload.error);
    throw new Error(message);
  }
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] || {} : {};
  const content = extractChoiceContent(choice);
  if (content)
    return sanitizeOutput(content);
  return sanitizeOutput(raw);
}
function extractText(raw, contentType = "") {
  const text = String(raw || "").trim();
  if (!text)
    return "";
  if (contentType.includes("text/event-stream") || text.startsWith("data:")) {
    return parseSseStream(text);
  }
  try {
    return parseJsonBody(text);
  } catch (error) {
    return sanitizeOutput(text);
  }
}
function extractErrorMessage(raw, contentType = "") {
  const text = String(raw || "").trim();
  if (!text)
    return "";
  try {
    if (contentType.includes("text/event-stream") || text.startsWith("data:")) {
      return parseSseStream(text);
    }
    const payload = JSON.parse(text);
    if (payload?.error) {
      return payload.error.message || payload.error.code || JSON.stringify(payload.error);
    }
    return sanitizeOutput(text);
  } catch (error) {
    return sanitizeOutput(text).slice(0, 300);
  }
}
async function callSummaryApi({
  apiUrl,
  apiKey,
  model,
  messages,
  temperature,
  requestTimeoutMs = 18e4,
  maxTokens
}) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream, application/json",
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": "shokax-summary-native/1.0"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: false,
      ...maxTokens ? { max_tokens: maxTokens } : {}
    }),
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const detail = extractErrorMessage(raw, contentType);
    throw new Error(`Error: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
  }
  const text = extractText(raw, contentType);
  if (!text) {
    throw new Error("Summary API returned empty content.");
  }
  return text;
}
async function compressSummaryIfNeeded({
  apiUrl,
  apiKey,
  model,
  temperature,
  summary,
  maxChars,
  requestTimeoutMs
}) {
  if (!maxChars || summary.length <= maxChars) {
    return summary;
  }
  return callSummaryApi({
    apiUrl,
    apiKey,
    model,
    temperature,
    requestTimeoutMs,
    maxTokens: 120,
    messages: [{
      role: "system",
      content: `你是一名中文博客摘要压缩助手。请把用户给出的摘要压缩成一段中文纯文本，长度不超过 ${maxChars} 个中文字符，不要标题、不要项目符号、不要换行、不要解释。保留主题、关键结论与实际价值，不要杜撰。`
    }, {
      role: "user",
      content: summary
    }]
  });
}
async function getSummaryByAPI(content) {
  const apiKey = hexo.theme.config.summary.apiKey;
  const apiUrl = hexo.theme.config.summary.apiUrl;
  const model = hexo.theme.config.summary.model;
  const temperature = hexo.theme.config.summary.temperature ?? 1.3;
  const initalPrompt = hexo.theme.config.summary.initalPrompt;
  const requestTimeoutMs = hexo.theme.config.summary.requestTimeoutMs ?? 18e4;
  const maxChars = hexo.theme.config.summary.maxChars ?? 140;
  const summary = await callSummaryApi({
    apiUrl,
    apiKey,
    model,
    temperature,
    requestTimeoutMs,
    messages: [{
      role: "system",
      content: `${initalPrompt}`
    }, {
      role: "user",
      content: `${content}`
    }]
  });
  return compressSummaryIfNeeded({
    apiUrl,
    apiKey,
    model,
    temperature,
    summary,
    maxChars,
    requestTimeoutMs
  });
}
class SummaryDatabase {
  fileChanged;
  data;
  constructor() {
    this.fileChanged = false;
    this.data = {
      version: 2,
      features: {
        incremental: false
      },
      summaries: {}
    };
  }
  async readDB() {
    try {
      await import_promises.default.access("summary.json");
      this.data = JSON.parse(await import_promises.default.readFile("summary.json", "utf-8"));
    } catch (error) {
    }
    if (this.data.version !== 2) {
      throw new Error(`Incompatible version of summary database: ${this.data.version}`);
    }
  }
  async writeDB() {
    if (this.fileChanged) {
      await import_promises.default.writeFile("summary.json", JSON.stringify(this.data));
    }
  }
  async getPostSummary(path, content) {
    const pathHash = (0, import_node_crypto.createHash)("sha256").update(path).digest("hex");
    const contentHash = (0, import_node_crypto.createHash)("sha256").update(content).digest("hex");
    if (this.data.summaries[pathHash]?.sha256 === contentHash) {
      return this.data.summaries[pathHash].summary;
    } else {
      const summaryContent = await getSummaryByAPI(content);
      this.data.summaries[pathHash] = {
        summary: summaryContent,
        sha256: contentHash
      };
      this.fileChanged = true;
      return summaryContent;
    }
  }
}
hexo.extend.generator.register("summary_ai", async function(locals) {
  const posts = locals.posts;
  if (!hexo.theme.config.summary.enable) {
    return;
  }
  const db = new SummaryDatabase();
  await db.readDB();
  const postArray = posts.toArray();
  const pLimit = require("@common.js/p-limit").default;
  const concurrencyLimit = pLimit(hexo.theme.config.summary?.concurrency || 5);
  const processingPromises = postArray.map((post) => concurrencyLimit(async () => {
    const content = post.content;
    const path = post.path;
    const published = post.published;
    if (content && path && published && content.length > 0) {
      try {
        const summary = await db.getPostSummary(path, content);
        post.summary = summary;
      } catch (error) {
        hexo.log.error(`[ShokaX Summary AI] \u5904\u7406\u6587\u7AE0 ${path} \u65F6\u51FA\u9519:`, error.message);
        post.summary = `${error.message}`;
      }
    }
  }));
  await Promise.all(processingPromises);
  await db.writeDB();
  hexo.log.info(`[ShokaX Summary AI] \u6240\u6709\u6587\u7AE0\u6458\u8981\u5904\u7406\u5B8C\u6210\uFF0C\u5DF2\u4FDD\u5B58\u5230\u6570\u636E\u5E93`);
});
