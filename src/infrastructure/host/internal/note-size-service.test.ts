import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { NoteSizeService } from "./note-size-service";
import { NotesService } from "./notes-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { VaultPath } from "../types";

function build(): { service: NoteSizeService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(NotesService).useClass(NotesService);
  c.register(NoteSizeService).useClass(NoteSizeService);
  return { service: c.resolve(NoteSizeService), host };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("NoteSizeService", () => {
  it("returns None on the first read and the size once it lands", async () => {
    const { service, host } = build();
    host.putFile("a.md", "one two three");

    expect(service.get("a.md" as VaultPath).isNone()).toBe(true);
    await settle();

    const result = service.get("a.md" as VaultPath);
    expect(result.isSome() && result.value.words).toBe(3);
  });

  it("emits size-changed once the fill lands", async () => {
    const { service, host } = build();
    host.putFile("a.md", "one two");
    const seen: VaultPath[] = [];
    service.events.on("size-changed", (path) => seen.push(path));

    service.get("a.md" as VaultPath);
    await settle();

    expect(seen).toEqual(["a.md"]);
  });

  it("returns None for a path with no file and never reaches the vault", async () => {
    const { service, host } = build();
    const spy = vi.spyOn(host.app.vault, "cachedRead");

    expect(service.get("nope.md" as VaultPath).isNone()).toBe(true);
    await settle();

    expect(spy).not.toHaveBeenCalled();
    expect(service.get("nope.md" as VaultPath).isNone()).toBe(true);
  });

  it("reads once for many gets of the same path", async () => {
    const { service, host } = build();
    host.putFile("a.md", "one two");
    const spy = vi.spyOn(host.app.vault, "cachedRead");

    service.get("a.md" as VaultPath);
    service.get("a.md" as VaultPath);
    service.get("a.md" as VaultPath);
    await settle();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refreshes on modified without dropping the previous value", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);
    await settle();

    await host.app.vault.modify(file, "one two three four");
    host.emitVault("modify", file);

    // The stale value stays readable until the new one lands, so a decoration does
    // not blink off on every save.
    const during = service.get("a.md" as VaultPath);
    expect(during.isSome() && during.value.words).toBe(2);

    await settle();
    const after = service.get("a.md" as VaultPath);
    expect(after.isSome() && after.value.words).toBe(4);
  });

  it("ignores modified for a path it has never read", async () => {
    const { host } = build();
    const file = host.putFile("a.md", "one two");
    const spy = vi.spyOn(host.app.vault, "cachedRead");

    host.emitVault("modify", file);
    await settle();

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not emit when a frontmatter-only edit leaves the counts unchanged, but does once the body changes", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "---\na: 1\n---\none two");
    service.get("a.md" as VaultPath);
    await settle();

    const seen: VaultPath[] = [];
    service.events.on("size-changed", (path) => seen.push(path));
    await host.app.vault.modify(file, "---\na: 1\nb: 2\n---\none two");
    host.emitVault("modify", file);
    await settle();

    // An empty `seen` here could otherwise be explained by "the refill just hadn't
    // landed yet" rather than by the equality guard. A follow-up edit that DOES
    // change the count, asserted to emit, rules that out.
    expect(seen).toEqual([]);

    await host.app.vault.modify(file, "---\na: 1\nb: 2\n---\none two three");
    host.emitVault("modify", file);
    await settle();

    expect(seen).toEqual(["a.md"]);
  });

  it("drops a superseded read that resolves out of order", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two three");
    // The cold first read resolves LAST, carrying the pre-edit content; the refresh's
    // memory-backed read lands first, carrying the post-edit content. The stale read
    // landing later must not overwrite the fresher one.
    const { promise: firstRead, resolve: releaseFirst } = Promise.withResolvers<string>();
    const spy = vi.spyOn(host.app.vault, "cachedRead");
    spy.mockReturnValueOnce(firstRead);

    service.get("a.md" as VaultPath);
    await host.app.vault.modify(file, "one two");
    host.emitVault("modify", file);
    await settle();

    releaseFirst("one two three");
    await settle();

    const result = service.get("a.md" as VaultPath);
    expect(result.isSome() && result.value.words).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale fill for a renamed-away path corrupt a fresh note at the same path", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two three four five");
    // Fill A starts for "a.md" and hangs mid-read.
    const { promise: staleRead, resolve: releaseStale } = Promise.withResolvers<string>();
    const spy = vi.spyOn(host.app.vault, "cachedRead");
    spy.mockReturnValueOnce(staleRead);
    service.get("a.md" as VaultPath);

    // "a.md" is renamed away while A is still in flight.
    await host.app.vault.rename(file, "renamed-away.md");

    // A new note lands at the now-free "a.md" path and a cell asks for it — fill B.
    host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);
    await settle();

    // The stale read for the old "a.md" resolves last, after B already landed. It must
    // not overwrite B's fresh value, even though a naive generation reset (delete
    // instead of bump on rename) would let it reuse B's own generation number.
    releaseStale("one two three four five");
    await settle();

    const result = service.get("a.md" as VaultPath);
    expect(result.isSome() && result.value.words).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("carries the cached size across a rename", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);
    await settle();

    await host.app.vault.rename(file, "b.md");

    const moved = service.get("b.md" as VaultPath);
    expect(moved.isSome() && moved.value.words).toBe(2);
    expect(service.get("a.md" as VaultPath).isNone()).toBe(true);
  });

  it("emits size-changed for the destination path when a rename moves a cached size", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);
    await settle();

    const seen: VaultPath[] = [];
    service.events.on("size-changed", (path) => seen.push(path));
    await host.app.vault.rename(file, "b.md");

    expect(seen).toEqual(["b.md"]);
  });

  it("emits nothing when a renamed path had no cached size", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two");

    const seen: VaultPath[] = [];
    service.events.on("size-changed", (path) => seen.push(path));
    await host.app.vault.rename(file, "b.md");

    expect(seen).toEqual([]);
  });

  it("drops the cached size on delete", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);
    await settle();

    await host.app.vault.delete(file);

    expect(service.get("a.md" as VaultPath).isNone()).toBe(true);
  });

  it("clears #pending on delete so a note that lands back at the same path gets its own fill", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two three");
    // The fill for the doomed "a.md" starts and hangs mid-read.
    const { promise: staleRead, resolve: releaseStale } = Promise.withResolvers<string>();
    const spy = vi.spyOn(host.app.vault, "cachedRead");
    spy.mockReturnValueOnce(staleRead);
    service.get("a.md" as VaultPath);

    await host.app.vault.delete(file);

    // A new note lands at the now-free "a.md" path and a cell asks for it. If delete
    // left the stale entry in #pending, this get() would see "already in flight" and
    // skip starting its own fill.
    host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);
    await settle();

    expect(spy).toHaveBeenCalledTimes(2);

    releaseStale("one two three");
    await settle();

    const result = service.get("a.md" as VaultPath);
    expect(result.isSome() && result.value.words).toBe(2);
  });

  it("does not let a superseded fill's cleanup clear #pending out from under a still in-flight fill", async () => {
    const { service, host } = build();
    const file = host.putFile("a.md", "one two three four five");
    // Fill A starts and hangs mid-read.
    const { promise: readA, resolve: releaseA } = Promise.withResolvers<string>();
    const spy = vi.spyOn(host.app.vault, "cachedRead");
    spy.mockReturnValueOnce(readA);
    service.get("a.md" as VaultPath);

    // "a.md" is renamed away, bumping its generation while A is still in flight.
    await host.app.vault.rename(file, "renamed-away.md");

    // A new note lands at the now-free "a.md" path; fill B starts and also hangs mid-read.
    const { promise: readB, resolve: releaseB } = Promise.withResolvers<string>();
    spy.mockReturnValueOnce(readB);
    host.putFile("a.md", "one two");
    service.get("a.md" as VaultPath);

    // A's stale read resolves. Its generation no longer matches, so it takes the
    // superseded branch — its cleanup must not touch #pending, which B still owns.
    releaseA("one two three four five");
    await settle();

    // If the cleanup guard were dropped, A would have deleted "a.md" from #pending on
    // its way out even though B still owns it, so this get() would start a redundant
    // fill C instead of collapsing into B.
    service.get("a.md" as VaultPath);
    await settle();
    expect(spy).toHaveBeenCalledTimes(2);

    releaseB("one two");
    await settle();

    const result = service.get("a.md" as VaultPath);
    expect(result.isSome() && result.value.words).toBe(2);
  });
});
