import { Lifetime } from "./lifetime";

import type { Class } from "./token";

export interface RegistrationEntry<T> {
  readonly factory: () => T;
  readonly lifetime: Lifetime;
  readonly eager: boolean;
}

export type OnRegistrationChange<T> = (entry: RegistrationEntry<T>) => void;

export class RegistrationBuilder<T> {
  readonly #onChange: OnRegistrationChange<T>;

  constructor(onChange: OnRegistrationChange<T>) {
    this.#onChange = onChange;
  }

  useClass(ctor: Class<T>): RegistrationOptions<T> {
    return new RegistrationOptions<T>(() => new ctor(), this.#onChange);
  }

  useFactory(factory: () => T): RegistrationOptions<T> {
    return new RegistrationOptions<T>(factory, this.#onChange);
  }

  useValue(value: T): RegistrationOptions<T> {
    return new RegistrationOptions<T>(() => value, this.#onChange);
  }
}

export class RegistrationOptions<T> {
  readonly #factory: () => T;
  readonly #onChange: OnRegistrationChange<T>;
  #lifetime: Lifetime = Lifetime.Container;
  #eager = false;

  constructor(factory: () => T, onChange: OnRegistrationChange<T>) {
    this.#factory = factory;
    this.#onChange = onChange;
    this.#notify();
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
    this.#onChange({
      factory: this.#factory,
      lifetime: this.#lifetime,
      eager: this.#eager,
    });
  }
}
