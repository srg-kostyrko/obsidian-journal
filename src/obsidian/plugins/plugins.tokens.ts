import { createToken } from "@/infra/di/token";
import type { Templater as TemplaterContract } from "./templater/templater.types";

export const Templater = createToken<TemplaterContract>("templater-obsidian");
