import { m } from "@/i18n";
import { defineSuggest } from "@/infrastructure/host";

export const journalPickerSuggest = defineSuggest<string[], string>({
  placeholder: () => m.journal_picker_placeholder(),
  fetch: (query, journals) => journals.filter((name) => name.toLowerCase().includes(query.toLowerCase())),
  render: (name) => name,
});
