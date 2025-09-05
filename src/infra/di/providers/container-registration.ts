import type {
  ContainerRegistration as ContainerRegistrationContract,
  RegistrationProvider,
} from "../contracts/container.types";
import type { Constructor, Token } from "../contracts/token.types";
import { ClassProvider } from "./class-provider";
import { FactoryProvider } from "./factory-provider";
import { ValueProvider } from "./value-provider";

export class ContainerRegistration<T> implements ContainerRegistrationContract<T> {
  #token: Token<T>;
  #provider: RegistrationProvider<T> | null = null;

  constructor(token: Token<T>) {
    this.#token = token;
  }

  toString() {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `Registration<${String(this.#token)}>`;
  }

  get provider(): RegistrationProvider<T> | null {
    return this.#provider;
  }

  use(cls: Constructor<T>): RegistrationProvider<T> {
    this.#provider = new ClassProvider(this.#token, cls);

    return this.#provider;
  }
  useFactory<Args extends unknown[]>(factory: (...args: Args) => T): RegistrationProvider<T> {
    this.#provider = new FactoryProvider(this.#token, factory);

    return this.#provider;
  }
  useValue(value: T): RegistrationProvider<T> {
    this.#provider = new ValueProvider(this.#token, value);

    return this.#provider;
  }
}
