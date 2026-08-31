import test from "node:test";
import assert from "node:assert/strict";
import { highlightCode, languageForPath } from "../src/rendering/languages.js";

test("detects Dart and shell source extensions", () => {
  assert.equal(languageForPath("lib/main.dart"), "dart");
  assert.equal(languageForPath("tool/measure.sh"), "bash");
  assert.equal(languageForPath("scripts/run.zsh"), "bash");
  assert.equal(languageForPath("README.unknown"), "plaintext");
});

test("highlights supported languages and safely falls back", async () => {
  assert.match(await highlightCode("void main() {}", "dart"), /hljs-/);
  assert.match(await highlightCode("echo $HOME", "bash"), /hljs-/);
  assert.doesNotMatch(await highlightCode("<script>alert(1)</script>", "unknown"), /<script>/);
});
