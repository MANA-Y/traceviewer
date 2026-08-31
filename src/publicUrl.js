export function publicAssetBase() {
  try {
    const base = import.meta.env?.BASE_URL;
    if (typeof base === "string" && base.length > 0) return base;
  } catch {
    // Node tests import this module without Vite.
  }
  return "/";
}

export function routerBasename(base = publicAssetBase()) {
  if (!base || base === "./" || base === "." || !base.startsWith("/")) {
    return "/";
  }
  return base.length > 1 && base.endsWith("/") ? base.slice(0, -1) : base;
}

export function resolvePublicAssetUrl(path, base = publicAssetBase()) {
  if (path == null || path === "") return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const relative = String(path).replace(/^\/+/, "");
  if (base === "./" || base === ".") return `./${relative}`;
  if (base.endsWith("/")) return `${base}${relative}`;
  return `${base}/${relative}`;
}
