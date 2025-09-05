import type { ClassMetadata } from "./contracts/metadata.types";
import type { Constructor } from "./contracts/token.types";

const metadataMap = new WeakMap<Constructor<unknown>, ClassMetadata<unknown>>();

export function getClassMetadata<T>(cls: Constructor<T>): ClassMetadata<T> {
  let metadata = metadataMap.get(cls);
  if (!metadata) {
    metadata = {};
    metadataMap.set(cls, metadata);
  }
  return metadata;
}
