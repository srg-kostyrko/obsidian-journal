import type { Component, InjectionKey } from "vue";
import { createToken } from "../di/token";
import type { VueApp as VueAppContract } from "./vue.types";
import type { Injector } from "../di/contracts/injector.types";

export const VueApp = createToken<VueAppContract, [rootComponent: Component, rootElement: HTMLElement]>("VueApp");

export const VueAppInjector = Symbol("VueAppInjector") as InjectionKey<Injector>;
