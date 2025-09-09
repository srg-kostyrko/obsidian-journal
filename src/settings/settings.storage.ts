import type { PluginSettings, SettingsStorage as SettingsStorageContract } from "./settings.types";
import { Settings } from "./settings.tokens";
import { defaultPluginSettings } from "@/defaults";
import { ref } from "vue";
import { deepCopy } from "@/utils/misc";
import { Injectable } from "@/infra/di/decorators/Injectable";

@Injectable(Settings)
export class SettingsStorage implements SettingsStorageContract {
  #data = ref(deepCopy(defaultPluginSettings));

  get data() {
    return this.#data.value;
  }

  load(data: PluginSettings) {
    this.#data.value = data;
  }
}
