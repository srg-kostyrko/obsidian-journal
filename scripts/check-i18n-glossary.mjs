// Translations are hand-authored (see docs/i18n-glossary.md). This guard exists
// because the corpus was originally machine-translated one string at a time with
// no domain context, and that pass read "note" as a banknote, "journal" as an
// accounting ledger, "logging" as timber harvesting and "period buttons" as
// menstrual products. The wrong terms are cheap to reintroduce by hand and
// expensive to notice, so they fail the build instead.
//
// Three kinds of check live here:
//   GLOSSARY  — banned renderings of a term, per locale.
//   LITERALS  — syntax the user must type verbatim, which must survive translation.
//   MECHANICAL — artifacts no translation should ever contain.
import { readdirSync, readFileSync } from "node:fs";

// term: what the entry protects. banned: what a translator (or MT) reaches for
// instead. use: the canonical rendering. allowIn / only: restrict by message key.
const GLOSSARY = {
  de: [
    // `Tagebuch` alone never matched the umlauted plural `Tagebüchern`, which shipped
    // live in two strings and passed CI for months.
    { term: "journal", banned: /Zeitschrift|Tageb(u|ü)ch|Fachblatt/i, use: "Journal" },
    { term: "note", banned: /\bNoten?\b|Kontoauszug|Geldschein|Schuldschein|Banknote/i, use: "Notiz" },
    { term: "shelf", banned: /Bücherregal/i, use: "Regal" },
    { term: "bold", banned: /deutlich|kühn|mutig|wagemutig/i, use: "Fett" },
    { term: "label", banned: /Etikett/i, use: "Beschriftung" },
    { term: "property", banned: /Eigentum|Anwesen|Immobilie|Objektname/i, use: "Eigenschaft" },
    { term: "condition", banned: /Zustand/i, use: "Bedingung" },
    { term: "run", banned: /\bLaufen\b/i, use: "Ausführen" },
    // Obsidian's own German UI keeps "Vault" and calls the ribbon "Werkzeugleiste";
    // the correct-German alternatives name things the user cannot find.
    { term: "vault", banned: /Tresor/i, use: "Vault" },
    { term: "ribbon", banned: /Menüband/i, use: "Werkzeugleiste" },
    { term: "frontmatter", banned: /Vorwort|Vorspann/i, use: "Frontmatter" },
    { term: "view", banned: /\bAufruf(e|en|s)?\b/i, use: "Ansicht" },
    { term: "cancel", banned: /Stornier/i, use: "Abbrechen" },
    { term: "custom", banned: /\bBrauch\b/i, use: "Benutzerdefiniert" },
    { term: "button", banned: /\bTaste[n]?\b/i, use: "Schaltfläche" },
  ],
  es: [
    { term: "journal", banned: /revista|periódico|cuaderno/i, use: "diario" },
    { term: "note", banned: /pagaré|billete|apunte|asiento contable/i, use: "nota" },
    { term: "bold", banned: /atrevid|audaz|valiente/i, use: "negrita" },
    // The string that shipped was "Explotación florestal", which /forestal/ does not
    // match — this rule guarded nothing from the day it was written.
    { term: "logging", banned: /fl?orestal/i, use: "registro" },
    { term: "run", banned: /\bcorrer\b/i, use: "ejecutar" },
    { term: "weekday", banned: /días laborables/i, use: "días de la semana" },
    { term: "quarter", banned: /\bcuartos?\b/i, use: "trimestre" },
    { term: "view", banned: /\bvisitas?\b/i, use: "vista" },
    { term: "block", banned: /\bmanzanas?\b|\bbloqueos?\b/i, use: "bloque" },
    { term: "save", banned: /\bahorrar\b/i, use: "guardar" },
    // "cerca de" is legitimate prose; only the bare adjective is the wrong "Close".
    { term: "close", banned: /(?<!de )\bcerca\b/i, use: "cerrar" },
    { term: "custom", banned: /\bcostumbre\b/i, use: "personalizado" },
    { term: "divider", banned: /\bdivisor\b/i, use: "separador" },
    { term: "vault", banned: /\brepositorios?\b|\balmac(én|enes)\b/i, use: "bóveda" },
    { term: "ribbon", banned: /cinta de opciones/i, use: "cinta" },
    { term: "Templater", banned: /creador de plantillas/i, use: "Templater" },
    { term: "italic", banned: /\bit(á|a)lico\b/i, use: "cursiva" },
    { term: "log", banned: /\bdiarios?\b/i, use: "registro", only: /^logging_/ },
  ],
  fr: [
    { term: "journal", banned: /revue|magazine|journal de bord/i, use: "journal" },
    { term: "note", banned: /billet|coupure|écriture comptable/i, use: "note" },
    { term: "bold", banned: /audacieu|hardi|intrépide/i, use: "gras" },
    { term: "tag", banned: /Étiqueter/i, use: "Étiquette" },
    { term: "border", banned: /Frontière/i, use: "Bordure" },
    { term: "period", banned: /ponctuation/i, use: "période" },
    { term: "run", banned: /\bcourir\b/i, use: "exécuter" },
    { term: "quarter", banned: /\bquartiers?\b/i, use: "trimestre" },
    { term: "spacer", banned: /entretoise/i, use: "espacement" },
    { term: "custom", banned: /coutume/i, use: "personnalisé" },
    { term: "show", banned: /spectacle|exposition/i, use: "afficher" },
    { term: "frontmatter", banned: /première page|avant-propos/i, use: "frontmatter" },
    { term: "block", banned: /blocage/i, use: "bloc" },
    { term: "step", banned: /monter en gamme/i, use: "monter" },
    { term: "Templater", banned: /générateur de modèles/i, use: "Templater" },
    // Same collision ru/uk have: "journal" is the plugin's core noun, so the log
    // feature must not borrow it.
    { term: "log", banned: /journalis/i, use: "log", only: /^logging_/ },
  ],
  it: [
    { term: "journal", banned: /rivista|giornal[ei]\b/i, use: "diario" },
    { term: "note", banned: /banconota|cambiale|scrittura contabile/i, use: "nota" },
    { term: "bold", banned: /audac|coraggios|ardit/i, use: "grassetto" },
    { term: "border", banned: /Confine/i, use: "Bordo" },
    { term: "run", banned: /\bcorrere\b/i, use: "esegui" },
    { term: "weekday", banned: /giorni feriali/i, use: "giorni della settimana" },
    { term: "quarter", banned: /\bquarti\b/i, use: "trimestri" },
    { term: "shelf", banned: /mensol|ripian/i, use: "scaffale" },
    { term: "period", banned: /mestruazion|ciclo mestruale/i, use: "periodo" },
    { term: "vault", banned: /caveau|cassaforte/i, use: "vault" },
    { term: "size", banned: /\bmisurare\b/i, use: "dimensione" },
    { term: "custom", banned: /\bcostum[ei]\b/i, use: "personalizzato" },
    { term: "square", banned: /\bpiazza\b/i, use: "quadrato" },
    { term: "cancel", banned: /\bcancellare\b/i, use: "annulla" },
    { term: "view", banned: /punti di vista/i, use: "vista" },
    // "registrato"/"registrare" stay legal elsewhere; only the log feature is scoped.
    { term: "log", banned: /registr(o|i|azione)/i, use: "log", only: /^logging_/ },
  ],
  ja: [
    { term: "journal", banned: /雑誌|仕訳帳|定期刊行物|本誌|日記/, use: "ジャーナル" },
    { term: "note", banned: /音符|紙幣|手形|伝票|メモ|注記|音名|債券/, use: "ノート" },
    { term: "bold", banned: /大胆|勇敢/, use: "太字" },
    // ボーダー also reads as a striped pattern; 枠線 is what CSS/Obsidian docs use.
    { term: "border", banned: /国境/, use: "枠線" },
    { term: "property", banned: /財産|不動産|物件/, use: "プロパティ" },
    { term: "period", banned: /生理/, use: "期間" },
    { term: "run", banned: /走る/, use: "実行" },
    { term: "vault", banned: /金庫/, use: "保管庫" },
    { term: "view", banned: /閲覧数|再生回数/, use: "ビュー" },
    { term: "block", banned: /街区/, use: "ブロック" },
    { term: "value", banned: /価値/, use: "値" },
    { term: "frontmatter", banned: /前書き/, use: "フロントマター" },
    { term: "shelf", banned: /シェルフ/, use: "棚" },
  ],
  // Hangul has no ASCII word edges, so plain substrings are correct here: the
  // nominal suffixes leave the stem intact (저널을 / 저널이 both contain 저널).
  ko: [
    { term: "journal", banned: /잡지|정기간행물|신문|일기장|일지/, use: "저널" },
    { term: "note", banned: /음표|어음|지폐|전표|메모|보고서|채권|약정서/, use: "노트" },
    { term: "bold", banned: /용감|대담/, use: "굵게" },
    { term: "border", banned: /국경/, use: "테두리" },
    { term: "property", banned: /재산|부동산/, use: "속성" },
    { term: "label", banned: /상표/, use: "라벨" },
    { term: "tag", banned: /꼬리표/, use: "태그" },
    { term: "logging", banned: /벌채/, use: "로깅" },
    { term: "weekday", banned: /평일/, use: "요일" },
    { term: "run", banned: /달리다/, use: "실행" },
    { term: "vault", banned: /금고|볼트/, use: "보관함" },
    { term: "view", banned: /조회수/, use: "뷰" },
    { term: "folder", banned: /접는 사람/, use: "폴더" },
    { term: "title", banned: /소유권/, use: "제목" },
    { term: "template", banned: /주형/, use: "템플릿" },
    { term: "button", banned: /단추/, use: "버튼" },
    { term: "shelf", banned: /서가|책장/, use: "선반" },
    { term: "frontmatter", banned: /머리말|프론트매터/, use: "프런트매터" },
  ],
  pt: [
    { term: "journal", banned: /revista|jornal|periódic/i, use: "diário" },
    { term: "note", banned: /promissória|cédula|anotaç/i, use: "nota" },
    { term: "bold", banned: /audacios|audaz|ousad/i, use: "negrito" },
    { term: "border", banned: /Fronteira/i, use: "Borda" },
    { term: "condition", banned: /doença/i, use: "condição" },
    { term: "run", banned: /\bcorrer\b/i, use: "executar" },
    { term: "weekday", banned: /dias úteis/i, use: "dias da semana" },
    { term: "quarter", banned: /\bquartos?\b/i, use: "trimestre" },
    // shipped both senses: background as a *process* and as *backstory*. The command
    // keys legitimately mean "context", so they are exempt.
    { term: "background", banned: /segundo plano|(?<!\p{L})contexto(?!\p{L})/iu, use: "fundo", allowIn: /context/ },
    { term: "shelf", banned: /estante/i, use: "prateleira" },
    { term: "ribbon", banned: /(?<!\p{L})fita(?!\p{L})/iu, use: "faixa de opções" },
    { term: "dry run", banned: /teste prático/i, use: "simulação" },
    { term: "view", banned: /(?<!\p{L})vistas?(?!\p{L})/iu, use: "visualização" },
    { term: "frontmatter", banned: /páginas? iniciais/i, use: "frontmatter" },
    { term: "block", banned: /quarteir(ão|ões)/i, use: "bloco" },
    { term: "Templater", banned: /gerador de modelos|modelador/i, use: "Templater" },
    { term: "log", banned: /registros?(?!\p{L})/iu, use: "log", only: /^logging_/ },
  ],
  // JS `\b` is defined over ASCII word characters, so it never matches at a Cyrillic
  // word edge — `/\bнота\b/` tests nothing and reports every text as clean. The entries
  // that need a word edge below use Unicode letter lookaround, which does.
  ru: [
    { term: "journal", banned: /дневник|бухгалтерск/i, use: "журнал" },
    {
      term: "note",
      banned:
        /записк|примечани|облигаци|вексел|проводк|(?<!\p{L})запис(ь|и|ью|ям|ями|ей)(?!\p{L})|(?<!\p{L})нот(а|ы|е|у|ой|ою|ам|ами|ах)?(?!\p{L})|(?<!\p{L})сч[её]т/iu,
      use: "заметка",
    },
    { term: "bold", banned: /смел|отважн|дерзк/i, use: "жирный" },
    { term: "icon", banned: /(?<!\p{L})икон[аыуеой](?!\p{L})/iu, use: "значок" },
    { term: "label", banned: /этикетк/i, use: "подпись" },
    { term: "tag", banned: /ярлык/i, use: "тег" },
    { term: "property", banned: /недвижимост/i, use: "свойство" },
    { term: "quarter", banned: /(?<!\p{L})четверт[ьи](?!\p{L})/iu, use: "квартал" },
    // `будни` alone missed `будний день`, `буднями`, `будних`, all of which shipped.
    { term: "weekday", banned: /(?<!\p{L})будн\p{L}*/iu, use: "дни недели" },
    // The plugin's own noun is "журнал", so the logging feature must not borrow it.
    { term: "log", banned: /журнал/i, use: "лог", only: /^logging_/ },
    { term: "decoration", banned: /укра[шс]|(?<!\p{L})декор/iu, use: "оформление" },
    {
      term: "view",
      banned:
        /(?<!\p{L})вид(а|у|ом|ы|ов|ам|ами|ах)?(?!\p{L})|мнени|обзор|(?<!\p{L})просмотр(а|у|ом|ы|ов|ам)?(?!\p{L})/iu,
      use: "представление",
    },
    { term: "background", banned: /предыстори/i, use: "фон" },
    { term: "show", banned: /(?<!\p{L})шоу(?!\p{L})|выставк|выставочн/iu, use: "показывать" },
    { term: "custom", banned: /(?<!\p{L})обыча[йяюем]?(?!\p{L})/iu, use: "пользовательский" },
    { term: "value", banned: /(?<!\p{L})ценить(?!\p{L})|стоимость титула/iu, use: "значение" },
    { term: "move", banned: /(?<!\p{L})двигаться(?!\p{L})/iu, use: "переместить" },
    { term: "item", banned: /(?<!\p{L})предмет\p{L}*/iu, use: "элемент" },
  ],
  uk: [
    { term: "journal", banned: /щоденник|бухгалтерськ/i, use: "журнал" },
    {
      term: "note",
      banned: /записк|приміт|облігаці|вексел|(?<!\p{L})нот(а|и|і|у|ою|ам|ами|ах)?(?!\p{L})|(?<!\p{L})рахунок/iu,
      use: "нотатка",
    },
    { term: "bold", banned: /смілив|відважн|зухвал/i, use: "жирний" },
    { term: "border", banned: /кордон/i, use: "межа" },
    { term: "property", banned: /нерухоміст|власніст/i, use: "властивість" },
    { term: "background", banned: /передісторі/i, use: "фон" },
    // "подання" and "вигляд" both circulated for the view object; "виглядає" is fine.
    { term: "view", banned: /подання|(?<!\p{L})вигляд(і|у|ом|ів|и|ами|ах)?(?!\p{L})/iu, use: "представлення" },
    { term: "decoration", banned: /прикрас|(?<!\p{L})декор(у|ом|и|ів)?(?!\p{L})/iu, use: "оформлення" },
    { term: "icon", banned: /піктограм/i, use: "значок" },
    { term: "quarter", banned: /(?<!\p{L})чверт[ьі](?!\p{L})/iu, use: "квартал" },
    { term: "weekday", banned: /(?<!\p{L})будн(і|ів|ім|іми|ього)(?!\p{L})/iu, use: "дні тижня" },
    { term: "run", banned: /(?<!\p{L})бігти(?!\p{L})/iu, use: "запустити" },
    { term: "logging", banned: /лісозаготівл/i, use: "логування" },
    { term: "log", banned: /журнал/i, use: "лог", only: /^logging_/ },
    { term: "condition", banned: /хвороб/i, use: "умова" },
    { term: "startup", banned: /стартап/i, use: "запуск" },
  ],
  zh: [
    // 日志 is the right word for the logging feature, and only there.
    { term: "journal", banned: /期刊|杂志|日志|日记账/, use: "日记", allowIn: /^logging_/ },
    { term: "note", banned: /音符|票据|钞票|凭证|分录|便条|备注|便笺|纸条|附注|注释/, use: "笔记" },
    { term: "bold", banned: /大胆|勇敢/, use: "粗体" },
    { term: "property", banned: /财产|房产/, use: "属性" },
    { term: "period", banned: /句号/, use: "周期" },
    { term: "startup", banned: /创业公司/, use: "启动" },
    { term: "run", banned: /跑步/, use: "运行" },
    { term: "weekday", banned: /工作日/, use: "星期" },
    { term: "shelf", banned: /货架|架子/, use: "书架" },
    { term: "vault", banned: /保险库|金库|存储库/, use: "库" },
    { term: "view", banned: /浏览量/, use: "视图" },
    { term: "block", banned: /积木|方块|模块/, use: "块" },
    { term: "name", banned: /姓名/, use: "名称" },
    { term: "custom", banned: /风俗/, use: "自定义" },
    { term: "ribbon", banned: /丝带/, use: "功能区" },
    { term: "save", banned: /节省/, use: "保存" },
    { term: "create", banned: /创造/, use: "创建" },
    { term: "value", banned: /价值/, use: "值" },
    { term: "context", banned: /语境/, use: "上下文" },
  ],
};

// Syntax the user types verbatim. Translating it produces copy that reads fine and
// instructs the reader to type something the parser rejects — the failure mode the
// term table cannot see. `startsWith` guards the single-character shift tokens
// (a locale once rendered "d — days" as "д — дней"); `contains` guards enum values.
const LITERALS = [
  // `+N`, `-N` and `:o` are syntax the user types into a name template. `o` in
  // particular reads as an abbreviation and invites translation.
  { key: "variable_modifications_number_body", contains: ["+N", "-N", ":o"] },
  { pattern: /^variable_modifications_unit_(?<token>[a-z])$/, startsWith: (m) => m.groups.token },
  { key: "journal_edit_code_block_home_option_show", contains: ["day", "week", "month", "quarter", "year", "custom"] },
  { key: "journal_edit_code_block_home_option_scale", contains: ["scale:"] },
  { key: "journal_edit_code_block_timeline_option_mode", contains: ["week", "month", "quarter", "calendar"] },
  { key: "journal_edit_code_block_timeline_weeks", contains: ["default", "left", "right", "none"] },
  { key: "journal_edit_code_block_timeline_option_before", contains: ["week", "month"] },
  { key: "journal_edit_code_block_timeline_option_after", contains: ["week", "month"] },
  { key: "journal_edit_code_block_timeline_option_navigation", contains: ["true", "false"] },
  { key: "calendar_timeline_navigation_description", contains: ["calendar-timeline", "navigation"] },
  { key: "code_blocks_home_empty", contains: ["show", "shelf"] },
  // The "Supported units" list under `<startOf=unit>` — each row IS the token the
  // user types. Nine of ten locales had translated them ("<startOf=Jahr>").
  { key: "variable_modifications_boundary_unit", containsSelectorValue: true },
  // moment.js format tokens. de shipped "JJJJ-MM-TT", uk "РРРР-ММ-ДД", and four
  // more locales their own; copying one into a format field yields a literal "JJJJ".
  { key: "journal_edit_variable_current_date_description", contains: ["YYYY-MM-DD"] },
  { key: "journal_edit_variable_current_time_description", contains: ["HH:mm"] },
  { key: "journal_edit_variable_time_description", contains: ["HH:mm"] },
  { key: "view_block_markdown_template_variables_intro", contains: ["YYYY-MM-DD", "HH:mm"] },
  // Templater ships no localization, so its UI is English in every Obsidian language.
  // A translated setting name points at a control the user cannot find.
  { key: "templater_support_option_trigger_off", contains: ["Trigger Templater on new file creation"] },
  {
    key: "templater_support_option_trigger_on",
    contains: ["Trigger Templater on new file creation", "Enable Folder Templates"],
  },
];

const MECHANICAL = [
  {
    name: "HTML entity",
    test: /&(?:lt|gt|amp|quot|nbsp|#\d+);/,
    hint: "write the character itself — the UI renders these literally",
  },
  {
    name: "padded placeholder",
    test: /(?:\{\w+\}[ \t]+(?=[.,;:?!)"»、。）])|["«(（“][ \t]+(?=\{\w+\}))/u,
    hint: "remove the space between the placeholder and the punctuation next to it",
  },
];

/** Every translatable value in a messages file, as [label, text, key]. */
function messages(locale) {
  const json = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const out = [];
  for (const [key, value] of Object.entries(json)) {
    if (key === "$schema") continue;
    if (typeof value === "string") out.push([key, value, key]);
    else if (Array.isArray(value))
      for (const variant of value)
        for (const [selector, text] of Object.entries(variant.match ?? {}))
          out.push([`${key} / ${selector}`, text, key]);
  }
  return out;
}

/**
 * Paraglide splits composite match keys on `,` without trimming, so a stray space
 * ("side=start, day=1") leaks into the generated input names and breaks the types.
 */
function malformedMatchKeys(locale) {
  const json = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const out = [];
  for (const [key, value] of Object.entries(json)) {
    if (!Array.isArray(value)) continue;
    for (const variant of value)
      for (const selector of Object.keys(variant.match ?? {})) if (/\s/.test(selector)) out.push([key, selector]);
  }
  return out;
}

const locales = readdirSync("messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const violations = [];
for (const locale of locales) {
  for (const [key, selector] of malformedMatchKeys(locale))
    violations.push({
      locale,
      label: key,
      text: selector,
      reason: 'match key contains whitespace — write it as "a=1,b=2", the compiler does not trim',
    });
  for (const [label, text, key] of messages(locale)) {
    for (const entry of GLOSSARY[locale] ?? []) {
      if (entry.allowIn?.test(key)) continue;
      if (entry.only && !entry.only.test(key)) continue;
      const hit = entry.banned.exec(text);
      if (hit) violations.push({ locale, label, text, reason: `"${hit[0]}" for ${entry.term} — use "${entry.use}"` });
    }
    for (const rule of MECHANICAL)
      if (rule.test.test(text)) violations.push({ locale, label, text, reason: `${rule.name}: ${rule.hint}` });
    for (const rule of LITERALS) {
      const match = rule.pattern ? rule.pattern.exec(key) : rule.key === key ? { groups: {} } : null;
      if (!match) continue;
      // The token is the variant's own selector value, so one rule covers every row.
      if (rule.containsSelectorValue) {
        const value = label.split("=").at(-1);
        if (value && !text.includes(value))
          violations.push({
            locale,
            label,
            text,
            reason: `must keep the literal unit "${value}" — users type it inside <startOf=…>`,
          });
      }
      if (rule.startsWith && !text.startsWith(rule.startsWith(match)))
        violations.push({
          locale,
          label,
          text,
          reason: `must start with the literal token "${rule.startsWith(match)}" — users type it verbatim`,
        });
      for (const token of rule.contains ?? [])
        if (!text.includes(token))
          violations.push({ locale, label, text, reason: `must keep the literal value "${token}" untranslated` });
    }
  }
}

for (const { locale, label, text, reason } of violations) console.error(`${locale} ${label}\n  ${reason}\n  ${text}`);

if (violations.length > 0) {
  const byLocale = {};
  for (const { locale } of violations) byLocale[locale] = (byLocale[locale] ?? 0) + 1;
  console.error(
    `\n${violations.length} glossary violation(s): ${Object.entries(byLocale)
      .map(([l, n]) => `${l}=${n}`)
      .join(" ")}\nSee docs/i18n-glossary.md.`,
  );
  process.exit(1);
}
console.log(`i18n glossary: no violations (${locales.length} locales)`);
