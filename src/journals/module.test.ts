import { describe, expect, it } from "vitest";

import { CalendarModule } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { isOrderedSubsequence, registrationOrder } from "@/infrastructure/di/testing";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { settingsCoreModule, SettingsService } from "@/settings";
import { templatesModule } from "@/templates";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { journalsCoreModule, journalsModule } from "./module";

function build(module: typeof journalsCoreModule) {
  const host = createFakeHost();
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.addModule(createHostModule(host.plugin));
  c.addModule(settingsCoreModule);
  c.addModule(CalendarModule);
  c.addModule(templatesModule);
  c.addModule(module);
  return { c, host };
}

describe("journalsCoreModule", () => {
  it("resolves CycleService", () => {
    const { c } = build(journalsCoreModule);

    expect(c.resolve(CycleService)).toBeInstanceOf(CycleService);
  });

  it("resolves JournalsIndex", () => {
    const { c } = build(journalsCoreModule);

    expect(c.resolve(JournalsIndex)).toBeInstanceOf(JournalsIndex);
  });

  it("registers no commands on the host during autoLoad", async () => {
    const { c, host } = build(journalsCoreModule);
    await c.resolve(SettingsService).initialize();

    await c.autoLoad();

    expect([...host.commands.keys()]).toHaveLength(0);
  });
});

describe("journalsModule", () => {
  it("registers commands on the host during autoLoad", async () => {
    const { c, host } = build(journalsModule);
    await c.resolve(SettingsService).initialize();

    await c.autoLoad();

    expect([...host.commands.keys()].length).toBeGreaterThan(0);
  });
});

describe("journalsCoreModule against journalsModule", () => {
  it("registers its tokens in the same relative order as the full module", () => {
    const core = registrationOrder(journalsCoreModule);
    const full = registrationOrder(journalsModule);

    expect(isOrderedSubsequence(core, full)).toBe(true);
  });

  it("registers no token the full module omits", () => {
    const core = registrationOrder(journalsCoreModule);
    const full = new Set(registrationOrder(journalsModule));

    expect(core.filter((name) => !full.has(name))).toEqual([]);
  });
});
