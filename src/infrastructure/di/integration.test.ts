import { describe, expect, it } from "vitest";

import { Container, createToken, inject, Lifetime, type Module } from "./index";

describe("DI integration", () => {
  it("runs through register, addModule, autoLoad, resolve, scope, and dispose", async () => {
    const events: string[] = [];

    class Persistence {
      readonly data = new Map<string, string>();
      [Symbol.dispose]() {
        events.push("persistence-disposed");
      }
    }
    class Settings {
      readonly persistence = inject(PersistenceToken);
      load() {
        events.push("settings-loaded");
      }
      [Symbol.dispose]() {
        events.push("settings-disposed");
      }
    }
    class RequestHandler {
      readonly settings = inject(SettingsToken);
      handle() {
        return this.settings.persistence.data.size;
      }
      [Symbol.dispose]() {
        events.push("request-handler-disposed");
      }
    }

    const PersistenceToken = createToken<Persistence>("Persistence");
    const SettingsToken = createToken<Settings>("Settings");
    const RequestHandlerToken = createToken<RequestHandler>("RequestHandler");

    const InfraModule: Module = {
      register(container) {
        container.register(PersistenceToken).useClass(Persistence).eager();
        container
          .register(SettingsToken)
          .useFactory(() => {
            const settings = new Settings();
            settings.load();
            return settings;
          })
          .eager();
      },
    };
    const RequestModule: Module = {
      register(container) {
        container.register(RequestHandlerToken).useClass(RequestHandler).lifetime(Lifetime.Scoped);
      },
    };

    const container = new Container();
    container.addModules([InfraModule, RequestModule]);
    await container.autoLoad();
    expect(events).toEqual(["settings-loaded"]);

    const scope = container.createScope();
    const handler = scope.resolve(RequestHandlerToken);
    expect(handler.handle()).toBe(0);

    await scope.dispose();
    expect(events).toEqual(["settings-loaded", "request-handler-disposed"]);

    await container.dispose();
    expect(events).toEqual([
      "settings-loaded",
      "request-handler-disposed",
      "settings-disposed",
      "persistence-disposed",
    ]);
  });
});
