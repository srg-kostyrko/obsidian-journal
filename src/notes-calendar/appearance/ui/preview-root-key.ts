import type { InjectionKey, Ref } from "vue";

/** The root of the preview the appearance page shows, where a stock of `inherit` is read. */
export const AppearancePreviewRootKey: InjectionKey<Readonly<Ref<HTMLElement | null | undefined>>> =
  Symbol("appearance:preview-root");
