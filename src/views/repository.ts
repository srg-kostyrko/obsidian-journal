import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { viewsCollection, type View, type ViewId } from "./config";
import { InvalidViewNameError, InvalidViewUpdateError, UnknownViewError, type ViewsLifecycleError } from "./errors";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";

import type { Emitter } from "nanoevents";

export class ViewsRepository extends BaseRepository<
  ViewId,
  View,
  UnknownViewError,
  InvalidViewUpdateError,
  RepositoryQuery<ViewId, View>,
  ViewsEvents
> {
  protected idKey: keyof View = "id";
  protected nameKey: keyof View = "name";
  protected QueryConstructor = RepositoryQuery<ViewId, View>;
  protected storage = inject(SettingsService).recordOf(viewsCollection);
  protected events = inject(ViewsEventsToken);
  protected unknownEntityError = (id: ViewId) => new UnknownViewError(id);
  protected invalidUpdateError = (id: ViewId) => new InvalidViewUpdateError(id);

  static fromParts(storage: Record<string, View>, events: Emitter<ViewsEvents>): ViewsRepository {
    const repo = Object.create(ViewsRepository.prototype) as ViewsRepository;
    interface Mutable {
      idKey: keyof View;
      nameKey: keyof View;
      QueryConstructor: typeof RepositoryQuery;
      storage: Record<ViewId, View>;
      events: Emitter<ViewsEvents>;
      unknownEntityError: (id: ViewId) => UnknownViewError;
      invalidUpdateError: (id: ViewId) => InvalidViewUpdateError;
    }
    const w = repo as unknown as Mutable;
    w.idKey = "id";
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.storage = storage;
    w.events = events;
    w.unknownEntityError = (id) => new UnknownViewError(id);
    w.invalidUpdateError = (id) => new InvalidViewUpdateError(id);
    return repo;
  }

  create(view: View): Result<ViewId, ViewsLifecycleError> {
    if (view.name.trim().length === 0) return new Err(new InvalidViewNameError(view.name));
    const result = this.addEntity(view.id, view);
    if (result.kind === "err") return new Err(new InvalidViewNameError(view.name));
    return new Ok(view.id);
  }
}
