import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { viewsCollection, type View, type ViewId } from "./config";
import { InvalidViewNameError, InvalidViewUpdateError, UnknownViewError, type ViewsLifecycleError } from "./errors";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";

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

  create(view: View): Result<ViewId, ViewsLifecycleError> {
    if (view.name.trim().length === 0) return new Err(new InvalidViewNameError(view.name));
    const result = this.addEntity(view.id, view);
    // addEntity rejects on id collision; callers always supply a fresh UUID, so
    // reaching this branch indicates a name we can no longer accept.
    if (result.kind === "err") return new Err(new InvalidViewNameError(view.name));
    return new Ok(view.id);
  }
}
