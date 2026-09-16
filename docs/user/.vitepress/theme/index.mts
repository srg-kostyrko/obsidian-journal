import { computed, defineComponent, h } from "vue";
import { inBrowser, useData, type Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";

import { redirectTarget, sitePath } from "../../../../scripts/docs-redirects.mjs";
import redirects from "../redirects.json";

import "./theme-images.css";
import "./next-banner.css";

function movedTo(base: string): string | undefined {
  const result = redirectTarget(redirects, sitePath(location.pathname, location.hash, base));
  if ("error" in result || result.hops === 0) return undefined;
  return base.replace(/\/$/, "") + result.path;
}

// Which channel this is comes from the base the site was built with, not from a build-time flag:
// the banner renders in the browser, where the build's environment is long gone.
const NextBanner = defineComponent({
  setup() {
    const { site } = useData();
    const releasedBase = computed(() => site.value.base.replace(/next\/$/, ""));
    return () =>
      site.value.base.endsWith("/next/")
        ? h("div", { class: "manual-next-banner" }, [
            "This manual describes the next release, which is not out yet. ",
            h("a", { href: releasedBase.value }, "Read the manual for the version you have installed"),
            ".",
          ])
        : null;
  },
});

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { "layout-top": () => h(NextBanner) }),
  enhanceApp({ router, siteData }) {
    if (!inBrowser) return;
    const base = siteData.value.base;
    const initial = movedTo(base);
    if (initial) history.replaceState(history.state, "", initial);
    const redirectIfMoved = async () => {
      const moved = movedTo(base);
      if (!moved) return;
      history.replaceState(history.state, "", moved);
      await router.go(moved);
    };
    router.onAfterRouteChange = redirectIfMoved;
    window.addEventListener("hashchange", redirectIfMoved);
  },
} satisfies Theme;
