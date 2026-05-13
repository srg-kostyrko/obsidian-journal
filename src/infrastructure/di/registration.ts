import { Lifetime } from "./lifetime";

import type { Class } from "./token";

export interface RegistrationEntry<T> {
  readonly factory: () => T;
  readonly lifetime: Lifetime;
  readonly eager: boolean;
}

export type OnRegistrationChange<T> = (entry: RegistrationEntry<T>) => void;

export class RegistrationBuilder<T> {
  #factory: (() => T) | undefined;
  #lifetime: Lifetime = Lifetime.Container;
  #eager = false;
  readonly #onChange: OnRegistrationChange<T>;

  constructor(onChange: OnRegistrationChange<T>) {
    this.#onChange = onChange;
  }

  useClass(ctor: Class<T>): this {
    this.#factory = () => new ctor();
    this.#notify();
    return this;
  }

  useFactory(factory: () => T): this {
    this.#factory = factory;
    this.#notify();
    return this;
  }

  useValue(value: T): this {
    this.#factory = () => value;
    this.#notify();
    return this;
  }

  lifetime(value: Lifetime): this {
    this.#lifetime = value;
    this.#notify();
    return this;
  }

  eager(): this {
    this.#eager = true;
    this.#notify();
    return this;
  }

  #notify(): void {
    if (!this.#factory) return;
    this.#onChange({
      factory: this.#factory,
      lifetime: this.#lifetime,
      eager: this.#eager,
    });
  }
}
