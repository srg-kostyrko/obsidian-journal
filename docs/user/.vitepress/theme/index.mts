import { inBrowser, type Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";

import { redirectTarget, sitePath } from "../../../../scripts/docs-redirects.mjs";
import redirects from "../redirects.json";

import "./theme-images.css";

function movedTo(base: string): string | undefined {
  const result = redirectTarget(redirects, sitePath(location.pathname, location.hash, base));
  if ("error" in result || result.hops === 0) return undefined;
  return base.replace(/\/$/, "") + result.path;
}

export default {
  extends: DefaultTheme,
  enhanceApp({ router, siteData }) {
    if (!inBrowser) return;
    const base = siteData.value.base;
    const initial = movedTo(base);
    if (initial) history.replaceState(history.state, "", initial);
    router.onAfterRouteChange = async () => {
      const moved = movedTo(base);
      if (!moved) return;
      history.replaceState(history.state, "", moved);
      await router.go(moved);
    };
  },
} satisfies Theme;
