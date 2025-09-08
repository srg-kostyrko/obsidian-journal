import type {
  ContainerRegistration as ContainerRegistrationContract,
  RegistrationProvider,
} from "../contracts/container.types";
import type { Constructor, Token } from "../contracts/token.types";
import { ClassProvider } from "./class-provider";
import { FactoryProvider } from "./factory-provider";
import { ValueProvider } from "./value-provider";

export class ContainerRegistration<T, Args extends unknown[]> implements ContainerRegistrationContract<T, Args> {
  #token: Token<T, Args>;
  #provider: RegistrationProvider<T, Args> | null = null;

  constructor(token: Token<T, Args>) {
    this.#token = token;
  }

  toString() {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `Registration<${String(this.#token)}>`;
  }

  get provider(): RegistrationProvider<T, Args> | null {
    return this.#provider;
  }

  use(cls: Constructor<T, Args>): RegistrationProvider<T, Args> {
    this.#provider = new ClassProvider(this.#token, cls);

    return this.#provider;
  }
  useFactory(factory: (...args: Args) => T): RegistrationProvider<T, Args> {
    this.#provider = new FactoryProvider(this.#token, factory);

    return this.#provider;
  }
  useValue(value: T): RegistrationProvider<T, Args> {
    this.#provider = new ValueProvider(this.#token, value);

    return this.#provider;
  }
}
