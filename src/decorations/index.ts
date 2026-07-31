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
export { defaultCondition, defaultDecoration, defaultStyle } from "./defaults";
export {
  DecorationEngine,
  hasOffsetCondition,
  periodMatchesWrite,
  type CalendarDecorationBinding,
  type DecorationBinding,
  type JournalDecorationBinding,
} from "./engine";
export { decorationsModule } from "./module";
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
  type DecorationLifecycleError,
} from "./errors";
