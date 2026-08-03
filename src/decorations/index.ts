export {
  borderSideSchema,
  calendarConditionSchema,
  calendarDecorationSchema,
  colorSchema,
  decorationConditionSchema,
  decorationSchema,
  decorationStyleSchema,
  filterConditionSchema,
  type BorderSide,
  type CalendarDecoration,
  type CalendarDecorationCondition,
  type ColorSettings,
  type FilterCondition,
  type JournalDecoration,
  type JournalDecorationBackground,
  type JournalDecorationBooleanPropertyCondition,
  type JournalDecorationBorder,
  type JournalDecorationColor,
  type JournalDecorationCondition,
  type JournalDecorationCorner,
  type JournalDecorationDateCondition,
  type JournalDecorationIcon,
  type JournalDecorationNumberPropertyCondition,
  type JournalDecorationOffsetCondition,
  type JournalDecorationPropertyCondition,
  type JournalDecorationShape,
  type JournalDecorationStringPropertyCondition,
  type JournalDecorationStyle,
  type JournalDecorationTagCondition,
  type JournalDecorationTitleCondition,
  type JournalDecorationWeekdayCondition,
} from "./config";
export { DecorationsStore } from "./decorations-store";
export { defaultCondition, defaultDecoration, defaultStyle } from "./defaults";
export {
  DecorationEngine,
  hasOffsetCondition,
  periodMatchesWrite,
  sourceOf,
  type CalendarDecorationBinding,
  type DecorationBinding,
  type DecorationSource,
  type JournalDecorationBinding,
} from "./engine";
export { gatherBindings, type GatherOptions } from "./gather-bindings";
export { decorationsModule } from "./module";
export { describeOwner, type CalendarDecorationOwner, type DecorationOwner } from "./owner";
export { decorationsSlice } from "./settings/slice";
export {
  CellDecorationMapKey,
  createCellDecorationScope,
  defaultCellDecorationScope,
  type CellDecorationScope,
  type CellStyleRef,
} from "./ui/cell-decoration-map-key";
export { default as CellDecoration } from "./ui/CellDecoration.vue";
export { colorToString } from "./ui/color";
export { default as DecorationPreview } from "./ui/DecorationPreview.vue";
export { useCellDecorations } from "./use-cell-decorations";
export {
  DecorationLifecycleFlowError,
  toDecorationFlowError,
  UnknownDecorationError,
  UnknownDecorationOwnerError,
  type DecorationLifecycleError,
} from "./errors";
export { attributeCell, type CellAttribution, type PropertyAttribution } from "./attribute-cell";
export { declaredProperties, type ExclusiveProperty } from "./resolve-cell";
