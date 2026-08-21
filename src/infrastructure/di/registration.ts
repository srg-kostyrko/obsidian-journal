import { Lifetime } from "./lifetime";

import type { Class } from "./token";

export interface RegistrationEntry<T> {
  readonly factory: () => T;
  readonly lifetime: Lifetime;
  readonly eager: boolean;
}

export type OnRegistrationChange<T> = (entry: RegistrationEntry<T>) => void;

export interface RegistrationDefaults {
  readonly lifetime: Lifetime;
  readonly eager: boolean;
}

const REGISTER_DEFAULTS: RegistrationDefaults = { lifetime: Lifetime.Container, eager: false };

export class RegistrationBuilder<T> {
  readonly #onChange: OnRegistrationChange<T>;
  readonly #defaults: RegistrationDefaults;

  constructor(onChange: OnRegistrationChange<T>, defaults: RegistrationDefaults = REGISTER_DEFAULTS) {
    this.#onChange = onChange;
    this.#defaults = defaults;
  }

  useClass(ctor: Class<T>): RegistrationOptions<T> {
    return new RegistrationOptions<T>(() => new ctor(), this.#onChange, this.#defaults);
  }

  useFactory(factory: () => T): RegistrationOptions<T> {
    return new RegistrationOptions<T>(factory, this.#onChange, this.#defaults);
  }

  useValue(value: T): RegistrationOptions<T> {
    return new RegistrationOptions<T>(() => value, this.#onChange, this.#defaults);
  }
}

export class RegistrationOptions<T> {
  readonly #factory: () => T;
  readonly #onChange: OnRegistrationChange<T>;
  #lifetime: Lifetime;
  #eager: boolean;

  constructor(factory: () => T, onChange: OnRegistrationChange<T>, defaults: RegistrationDefaults = REGISTER_DEFAULTS) {
    this.#factory = factory;
    this.#onChange = onChange;
    this.#lifetime = defaults.lifetime;
    this.#eager = defaults.eager;
    this.#notify();
  }

  #notify(): void {
    this.#onChange({
      factory: this.#factory,
      lifetime: this.#lifetime,
      eager: this.#eager,
    });
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
}
