import type { Component, InjectionKey } from "vue";
import { createToken } from "../di/token";
import type { VueApp as VueAppContract } from "./vue.types";
import type { Injector } from "../di/contracts/injector.types";

export const RootComponent = createToken<Component>("RootComponent");
export const RootElement = createToken<HTMLElement>("RootElement");

export const VueApp = createToken<VueAppContract>("VueApp");

export const VueAppInjector = Symbol("VueAppInjector") as InjectionKey<Injector>;
