import DOMPurify from "dompurify";

const ALLOWED_STYLE_PROPERTIES = new Set([
  "color",
  "display",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "height",
  "maxHeight",
  "maxWidth",
  "textAlign",
  "whiteSpace",
  "width",
]);

export function sanitizeMarkdown(html) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["form", "iframe", "input", "object", "script", "style"],
    FORBID_ATTR: ["style"],
  });
}

export function sanitizeStyle(style) {
  if (!style || typeof style !== "object") {
    return undefined;
  }
  const safeStyle = {};
  for (const [property, value] of Object.entries(style)) {
    if (!ALLOWED_STYLE_PROPERTIES.has(property) ||
        (typeof value !== "string" && typeof value !== "number")) {
      continue;
    }
    const serialized = String(value);
    if (serialized.length <= 100 && !/url\s*\(|expression\s*\(/i.test(serialized)) {
      safeStyle[property] = value;
    }
  }
  return safeStyle;
}

export function sanitizeUrl(value, { allowDataImage = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > 8_192) {
    return null;
  }
  if (allowDataImage && /^data:image\/(?:gif|jpeg|png|webp);base64,/i.test(value)) {
    return value;
  }
  try {
    const base = typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
      ? window.location.origin
      : (typeof window !== "undefined" ? window.location.href : "http://localhost");
    const resolvedPath = value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")
      ? value
      : "/" + value;
    const url = new URL(resolvedPath, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
