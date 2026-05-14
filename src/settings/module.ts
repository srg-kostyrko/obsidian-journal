import * as v from "valibot";

import type { Module } from "@/infrastructure/di";

import { defineCollection, defineSlice } from "./schema";
import { SettingsService } from "./settings-service";
import { CollectionDefinitionToken, MigrationToken, SliceDefinitionToken } from "./tokens";

import type { Migration } from "./schema";

const coreSlice = defineSlice("__settings_core__", v.object({}), {});

const coreCollection = defineCollection("__settings_core_collection__", v.object({}), () => ({}));

const identityMigration: Migration = {
  fromVersion: -1,
  toVersion: -1,
  migrate: (raw) => raw,
};

export const settingsModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(coreSlice);
    c.register(CollectionDefinitionToken).useValue(coreCollection);
    c.register(MigrationToken).useValue(identityMigration);
    c.register(SettingsService).useClass(SettingsService).eager();
  },
};
