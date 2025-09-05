import { describe, expect, it, vi } from "vitest";
import { createToken } from "./token";
import { Container } from "./container";
import { Injectable } from "./decorators/Injectable";
import { Scope } from "./contracts/scope.types";
import { Scoped } from "./decorators/Scoped";
import { NotInjectableClassError } from "./errors/NotInjectableClassError";
import { inject, injectBy } from "./inject";
import { Inject } from "./decorators/Inject";
import { TokenNotRegisteredError } from "./errors/TokenNotRegisteredError";
import { NoProviderRegisteredError } from "./errors/NoProviderRegisteredError";
import { NoInjectionContextError } from "./errors/NoInjectionContextError";

describe("DI system", () => {
  describe("Registration providers", () => {
    it("should allow to register simple value", () => {
      const ENV = createToken<string>("ENV");

      const container = new Container();
      container.register(ENV).useValue("development");

      expect(container.isRegistered(ENV)).toBe(true);

      const value = container.resolve(ENV);
      expect(value).toBe("development");
    });

    it("should allow to register factory", () => {
      const ENV = createToken<string>("ENV");

      const container = new Container();
      container.register(ENV).useFactory(() => "development");

      expect(container.isRegistered(ENV)).toBe(true);

      const value = container.resolve(ENV);
      expect(value).toBe("development");
    });

    it("should allow to register class", () => {
      interface IEnv {
        name: string;
      }
      const ENV = createToken<IEnv>("ENV");

      class Env implements IEnv {
        name = "development";
      }

      const container = new Container();
      container.register(ENV).use(Env);

      expect(container.isRegistered(ENV)).toBe(true);

      const value = container.resolve(ENV);
      expect(value).toBeInstanceOf(Env);
      expect(value.name).toBe("development");
    });
  });

  describe("Providing injectable class", () => {
    interface Test {
      name: string;
    }
    const TestToken = createToken<Test>("Test");

    it("should provide injectable class", () => {
      @Injectable(TestToken)
      class TestClass implements Test {
        name = "test";
      }

      const container = new Container();
      container.provide(TestClass);

      expect(container.isRegistered(TestToken)).toBe(true);

      const test = container.resolve(TestToken);
      expect(test).toBeInstanceOf(TestClass);
      expect(test.name).toBe("test");
    });

    it("should set defined scope", () => {
      @Injectable(TestToken)
      @Scoped(Scope.Container)
      class TestClass implements Test {
        name = "test";
      }

      const container = new Container();
      const registration = container.provide(TestClass);

      expect(registration.scope).toBe(Scope.Container);
    });

    it("should throw error if class is not injectable", () => {
      class TestClass {
        name = "test";
      }

      const container = new Container();
      expect(() => container.provide(TestClass)).toThrowError(NotInjectableClassError);
    });
  });

  describe("Resolution scopes", () => {
    interface Test {
      name: string;
    }
    const TestToken = createToken<Test>("Test");

    @Injectable(TestToken)
    class TestClass implements Test {
      name = "test";
    }

    describe("Transient scope", () => {
      it("should create new instance on every resolution", () => {
        const container = new Container();
        container.provide(TestClass).scoped(Scope.Transient);

        const instance1 = container.resolve(TestToken);
        const instance2 = container.resolve(TestToken);

        expect(instance1).toBeInstanceOf(TestClass);
        expect(instance2).toBeInstanceOf(TestClass);

        expect(instance1).not.toBe(instance2);
      });
    });

    describe("Resolution scope", () => {
      it("should create new instance on every resolution", () => {
        const container = new Container();
        container.provide(TestClass).scoped(Scope.Resolution);

        const instance1 = container.resolve(TestToken);
        const instance2 = container.resolve(TestToken);

        expect(instance1).toBeInstanceOf(TestClass);
        expect(instance2).toBeInstanceOf(TestClass);

        expect(instance1).not.toBe(instance2);
      });

      it("should reuse same instance within resolution graph", () => {
        const Consumer1Token = createToken<Consumer1>("Consumer1");
        const Consumer2Token = createToken<Consumer2>("Consumer2");

        @Injectable(Consumer1Token)
        class Consumer1 {
          test = inject(TestToken);
          consumer2 = inject(Consumer2Token);
        }

        @Injectable(Consumer2Token)
        class Consumer2 {
          test = inject(TestToken);
        }

        const container = new Container();
        container.provide(TestClass).scoped(Scope.Resolution);
        container.provide(Consumer1).scoped(Scope.Resolution);
        container.provide(Consumer2).scoped(Scope.Resolution);

        const consumer1 = container.resolve(Consumer1Token);

        expect(consumer1.test).toBeInstanceOf(TestClass);
        expect(consumer1.consumer2.test).toBeInstanceOf(TestClass);

        expect(consumer1.test).toBe(consumer1.consumer2.test);
      });

      it("should create a separate resolution for child container", () => {
        const Consumer1Token = createToken<Consumer1>("Consumer1");
        const Consumer2Token = createToken<Consumer2>("Consumer2");

        @Injectable(Consumer1Token)
        class Consumer1 {
          test = inject(TestToken);
          consumer2 = inject(Consumer2Token);
        }

        @Injectable(Consumer2Token)
        class Consumer2 {
          test = inject(TestToken);
        }

        const container = new Container();
        container.provide(TestClass).scoped(Scope.Resolution);
        container.provide(Consumer1).scoped(Scope.Resolution);

        const child = container.createChild();
        child.provide(Consumer2).scoped(Scope.Resolution);

        const consumer1 = child.resolve(Consumer1Token);

        expect(consumer1.test).toBeInstanceOf(TestClass);
        expect(consumer1.consumer2.test).toBeInstanceOf(TestClass);

        expect(consumer1.test).toBe(consumer1.consumer2.test);
      });
    });

    describe("Container scope", () => {
      it("should reuse instance on every resolution", () => {
        const container = new Container();
        container.provide(TestClass).scoped(Scope.Container);

        const instance1 = container.resolve(TestToken);
        const instance2 = container.resolve(TestToken);

        expect(instance1).toBeInstanceOf(TestClass);
        expect(instance2).toBeInstanceOf(TestClass);

        expect(instance1).toBe(instance2);
      });

      it("should reuse instance for different child containers", () => {
        const container = new Container();
        container.provide(TestClass).scoped(Scope.Container);

        const child1 = container.createChild();
        const child2 = container.createChild();

        const instance1 = child1.resolve(TestToken);
        const instance2 = child2.resolve(TestToken);

        expect(instance1).toBeInstanceOf(TestClass);
        expect(instance2).toBeInstanceOf(TestClass);

        expect(instance1).toBe(instance2);
      });
    });
  });

  describe("Hierarchy", () => {
    const ParentToken = createToken<unknown>("Parent");

    it("should allow to see registration from parent in child container", () => {
      const container = new Container();
      container.register(ParentToken).useValue("parent");

      const child = container.createChild();

      expect(child.isRegistered(ParentToken)).toBe(true);
    });

    it("should not allow to see registration from child in parent container", () => {
      const container = new Container();

      const child = container.createChild();
      child.register(ParentToken).useValue("parent");

      expect(container.isRegistered(ParentToken)).toBe(false);
    });
  });

  describe("Circular dependencies", () => {
    it("should throw error when circular dependency is detected", () => {
      const Token1 = createToken<Class1>("Class1");
      const Token2 = createToken<Class2>("Class2");
      const Token3 = createToken<Class3>("Class3");

      @Injectable(Token1)
      class Class1 {
        token2 = inject(Token2);
      }

      @Injectable(Token2)
      class Class2 {
        token3 = inject(Token3);
      }

      @Injectable(Token3)
      class Class3 {
        token1 = inject(Token1);
      }

      const container = new Container();
      container.provide(Class1);
      container.provide(Class2);
      container.provide(Class3);

      expect(() => {
        container.resolve(Token1);
      }).toThrowError("Circular dependency detected: Token<Class1> -> Token<Class2> -> Token<Class3> -> Token<Class1>");
    });

    it("should resolve parent child relationship if injectBy is used", () => {
      const ParentToken = createToken<Parent>("Parent");
      const ChildToken = createToken<Child>("Child");

      @Injectable(ParentToken)
      class Parent {
        child = injectBy(this, ChildToken);
      }

      @Injectable(ChildToken)
      class Child {
        parent = inject(ParentToken);
      }

      const container = new Container();
      container.provide(Parent);
      container.provide(Child);

      const parent = container.resolve(ParentToken);
      expect(parent.child.parent).toBe(parent);
    });

    it("should resolve parent child relationship if @Inject is used", () => {
      const ParentToken = createToken<Parent>("Parent");
      const ChildToken = createToken<Child>("Child");

      @Injectable(ParentToken)
      class Parent {
        @Inject(ChildToken)
        child!: Child;
      }

      @Injectable(ChildToken)
      class Child {
        @Inject(ParentToken)
        parent!: Parent;
      }
    });
  });

  describe("Factory injection", () => {
    it("should allow injecting in factory functions", () => {
      const ENV = createToken<string>("ENV");
      const Config = createToken<{ env: string }>("Config");

      const container = new Container();
      container.register(ENV).useValue("development");
      container.register(Config).useFactory(() => ({ env: inject(ENV) }));

      const config = container.resolve(Config);
      expect(config.env).toBe("development");
    });
  });

  describe("Errors", () => {
    const TestToken = createToken("test");

    it("should thro error if when resolving not registered token", () => {
      const container = new Container();
      expect(() => {
        container.resolve(TestToken);
      }).toThrowError(TokenNotRegisteredError);
    });

    it("should throw an error if registration was not completed with provider", () => {
      const container = new Container();
      container.register(TestToken);
      expect(() => {
        container.resolve(TestToken);
      }).toThrowError(NoProviderRegisteredError);
    });

    it("should throw an error if inject is called outside of injection context", () => {
      expect(() => {
        inject(TestToken);
      }).toThrowError(NoInjectionContextError);
    });

    it("should throw an error if injection context was interrupted", () => {
      vi.useFakeTimers();

      const test = createToken<Test>("test");
      const other = createToken("other");

      @Injectable(test)
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class Test {
        constructor() {
          setTimeout(() => {
            inject(other);
          });
        }
      }

      const container = new Container();
      container.provide(Test);
      container.register(other).useValue("other");

      expect(() => {
        container.resolve(test);
        vi.runAllTimers();
      }).toThrowError(NoInjectionContextError);

      vi.useRealTimers();
    });
  });
});
