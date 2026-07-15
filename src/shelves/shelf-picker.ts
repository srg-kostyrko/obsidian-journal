import { m } from "@/i18n";
import { defineSuggest } from "@/infrastructure/host";

export const shelfPickerSuggest = defineSuggest<string[], string>({
  placeholder: () => m.shelf_picker_placeholder(),
  fetch: (query, shelves) => shelves.filter((name) => name.toLowerCase().includes(query.toLowerCase())),
  render: (name) => name,
});
