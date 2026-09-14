// Imported by the manual's client-side theme as well as by check:docs-links, so it must stay free
// of Node built-ins.

export const MAX_REDIRECT_HOPS = 5;

export function sitePath(pathname, hash, base) {
  const inside = pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
  const route = inside.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  return route + hash;
}

function nextHop(redirects, target) {
  if (Object.hasOwn(redirects, target)) return redirects[target];
  const hashAt = target.indexOf("#");
  if (hashAt === -1) return undefined;
  const page = target.slice(0, hashAt);
  if (!Object.hasOwn(redirects, page)) return undefined;
  const destination = redirects[page];
  return destination.includes("#") ? destination : destination + target.slice(hashAt);
}

export function redirectTarget(redirects, target, maxHops = MAX_REDIRECT_HOPS) {
  const seen = new Set([target]);
  let current = target;
  for (let hops = 0; ; hops++) {
    const next = nextHop(redirects, current);
    if (next === undefined) return { path: current, hops };
    if (hops === maxHops) return { error: "too-many-hops", path: current };
    if (seen.has(next)) return { error: "loop", path: next };
    seen.add(next);
    current = next;
  }
}
