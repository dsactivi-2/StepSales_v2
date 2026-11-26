#!/usr/bin/env node
/** Führt ein n8n-Code-Node (jsCode) mit gemocktem $, $input und DateTime aus. */
import { createRequire } from "node:module";
import { stdin as input } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowsDir = path.resolve(here, "../../n8n/workflows");
const require = createRequire(path.join(workflowsDir, "package.json"));
const { DateTime: LuxonDateTime } = require("luxon");

const raw = await new Promise((resolve, reject) => {
  const chunks = [];
  input.setEncoding("utf8");
  input.on("data", (c) => chunks.push(c));
  input.on("end", () => resolve(chunks.join("")));
  input.on("error", reject);
});

const payload = JSON.parse(raw);
const frozen = LuxonDateTime.fromISO(payload.now, { setZone: true });
if (!frozen.isValid) {
  throw new Error("invalid now: " + payload.now);
}

const DateTime = new Proxy(LuxonDateTime, {
  get(target, prop, receiver) {
    if (prop === "now") {
      return () => frozen;
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

function wrapItems(items) {
  return (items || []).map((json) => ({ json }));
}

const nodeMap = payload.nodes || {};
const $input = {
  first() {
    if (payload.input) return { json: payload.input };
    const first = Object.values(nodeMap)[0];
    return { json: first?.items?.[0] ?? {} };
  },
  all() {
    if (payload.input) return [{ json: payload.input }];
    return wrapItems(Object.values(nodeMap)[0]?.items || []);
  },
};

function $(name) {
  const n = nodeMap[name] || { items: [], executed: false };
  const items = wrapItems(n.items);
  return {
    first() {
      if (!items.length) throw new Error("Node " + name + " hat keine Items");
      return items[0];
    },
    all() {
      return items;
    },
    get isExecuted() {
      return n.executed !== false;
    },
    itemMatching(i) {
      if (!items[i]) throw new Error("itemMatching " + i + " fehlt in " + name);
      return items[i];
    },
  };
}

let value;
let threw = null;
try {
  const fn = new Function("$", "$input", "DateTime", payload.code);
  value = fn($, $input, DateTime);
} catch (err) {
  threw = String(err && err.message ? err.message : err);
}

process.stdout.write(JSON.stringify({ value, threw }) + "\n");
