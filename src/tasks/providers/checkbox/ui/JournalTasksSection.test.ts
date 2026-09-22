import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";

import JournalTasksSection from "./JournalTasksSection.vue";

async function mount(tasks: unknown = undefined) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: {
      journals: {
        Daily: fixedJournal("Daily", { type: "day" }, { tasks } as never),
        Weekly: fixedJournal("Weekly", { type: "week" }),
      },
    },
  });
  return {
    harness,
    repository: harness.resolve(JournalsRepository),
    screen: harness.render(JournalTasksSection, { props: { journalName: "Daily" } }),
  };
}

describe("JournalTasksSection", () => {
  it("defaults to inherit for a journal that has never been configured", async () => {
    const { screen } = await mount();
    expect(screen.getByTestId("compose").dataset.value).toBe("inherit");
  });

  it("stores a narrow rule with its condition on the journal config", async () => {
    const { screen, repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const config = repository.get("Daily");
    expect(config.isSome() && config.value.tasks.checkbox).toMatchObject({ compose: "narrow" });
  });

  it("stores the added condition alongside the narrow compose mode", async () => {
    const { screen, repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-narrow"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));
    const config = repository.get("Daily");
    const checkbox = config.isSome() ? config.value.tasks.checkbox : undefined;
    expect(checkbox?.conditions).toMatchObject([{ type: "tag", condition: "has", tags: [] }]);
  });

  it("leaves other journals untouched", async () => {
    const { screen, repository } = await mount();
    await userEvent.click(screen.getByTestId("compose-replace"));
    await userEvent.click(screen.getByTestId("rule-add-condition"));

    const daily = repository.get("Daily");
    expect(daily.isSome() && daily.value.tasks.checkbox).toMatchObject({ compose: "replace" });

    const weekly = repository.get("Weekly");
    expect(weekly.isSome() && weekly.value.tasks.checkbox).toBeUndefined();
  });

  it("hides the rule editor while compose stays inherit", async () => {
    const { screen } = await mount();
    expect(screen.queryByTestId("rule-add-condition")).toBeNull();
  });

  it("shows a rule editor already seeded from an existing journal rule", async () => {
    const { screen } = await mount({
      checkbox: { compose: "replace", mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["work"] }] },
    });
    expect(screen.getByTestId("compose").dataset.value).toBe("replace");
    expect(screen.getByDisplayValue("work")).toBeTruthy();
  });

  it("clears the stored rule back to inherit", async () => {
    const { screen, repository } = await mount({
      checkbox: { compose: "narrow", mode: "and", conditions: [] },
    });
    await userEvent.click(screen.getByTestId("compose-inherit"));
    const config = repository.get("Daily");
    expect(config.isSome() && config.value.tasks.checkbox).toBeUndefined();
  });

  it("renders the compose option labels from the message catalogue, not the raw identifier", async () => {
    const { screen } = await mount();
    expect(screen.queryByText("narrow")).toBeNull();
    expect(screen.queryByText("replace")).toBeNull();
  });
});
