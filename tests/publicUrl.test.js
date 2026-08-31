import test from "node:test";
import assert from "node:assert/strict";
import {
  publicAssetBase,
  resolvePublicAssetUrl,
  routerBasename,
} from "../src/publicUrl.js";

test("defaults to the site root without Vite", () => {
  assert.equal(publicAssetBase(), "/");
  assert.equal(routerBasename(), "/");
  assert.equal(routerBasename("/"), "/");
  assert.equal(routerBasename("./"), "/");
  assert.equal(routerBasename("/traceviewer/"), "/traceviewer");
});

test("prefixes site-relative snapshot paths with the Vite base", () => {
  assert.equal(resolvePublicAssetUrl("/talk.json"), "/talk.json");
  assert.equal(resolvePublicAssetUrl("/var/traces/talk.json", "/"), "/var/traces/talk.json");
  assert.equal(
    resolvePublicAssetUrl("/var/traces/talk.json", "/traceviewer/"),
    "/traceviewer/var/traces/talk.json",
  );
  assert.equal(resolvePublicAssetUrl("/var/traces/talk.json", "./"), "./var/traces/talk.json");
  assert.equal(
    resolvePublicAssetUrl("https://example.com/talk.json", "/traceviewer/"),
    "https://example.com/talk.json",
  );
  assert.equal(resolvePublicAssetUrl("blob:http://localhost/1", "./"), "blob:http://localhost/1");
});
