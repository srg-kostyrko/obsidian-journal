// `@inlang/cli machine translate` has no glossary option, so every run is free to
// render the plugin's domain nouns as whatever the MT engine prefers — it has
// variously read "note" as a banknote, a promissory note and a musical note, and
// "journal" as a magazine or an accounting ledger. This checks the translated
// corpus against the terms docs/i18n-glossary.md fixes, and fails loudly so the
// drift is caught in the same pass that introduces it.
import { readFileSync } from "node:fs";

// term: what the entry protects. banned: what the MT engine reaches for instead.
// use: the canonical rendering. allowIn: keys where a banned term is legitimate.
const GLOSSARY = {
  de: [
    { term: "journal", banned: /Zeitschrift|Tagebuch|Fachblatt/i, use: "Journal" },
    { term: "note", banned: /\bNoten?\b|Kontoauszug|Geldschein|Schuldschein|Banknote/i, use: "Notiz" },
    { term: "shelf", banned: /Bücherregal/i, use: "Regal" },
  ],
  es: [
    { term: "journal", banned: /revista|periódico|cuaderno/i, use: "diario" },
    { term: "note", banned: /pagaré|billete|apunte|asiento contable/i, use: "nota" },
  ],
  fr: [
    { term: "journal", banned: /revue|magazine/i, use: "journal" },
    { term: "note", banned: /billet|coupure|écriture comptable/i, use: "note" },
  ],
  it: [
    { term: "journal", banned: /rivista|giornal[ei]\b/i, use: "diario" },
    { term: "note", banned: /banconota|cambiale|scrittura contabile/i, use: "nota" },
  ],
  ja: [
    { term: "journal", banned: /雑誌|仕訳帳|定期刊行物/, use: "ジャーナル" },
    { term: "note", banned: /音符|紙幣|手形|伝票|メモ|注記/, use: "ノート" },
  ],
  ko: [
    { term: "journal", banned: /잡지|정기간행물/, use: "저널" },
    { term: "note", banned: /음표|어음|지폐|전표|메모/, use: "노트" },
  ],
  pt: [
    { term: "journal", banned: /revista|jornal/i, use: "diário" },
    { term: "note", banned: /promissória|cédula|anotaç/i, use: "nota" },
  ],
  ru: [
    { term: "journal", banned: /дневник|бухгалтерск/i, use: "журнал" },
    { term: "note", banned: /записк|облигаци|вексел|\bнот[аыуеой]\b|\bсчёт|\bсчет/i, use: "заметка" },
  ],
  uk: [
    { term: "journal", banned: /щоденник|бухгалтерськ/i, use: "журнал" },
    { term: "note", banned: /записк|облігаці|вексел|\bнот[аиуоею]\b|\bрахунок/i, use: "нотатка" },
  ],
  zh: [
    // 日志 is the right word for the logging feature, and only there.
    { term: "journal", banned: /期刊|杂志|日志|日记账/, use: "日记", allowIn: /^logging_/ },
    { term: "note", banned: /音符|票据|钞票|凭证|分录|便条|备注/, use: "笔记" },
  ],
};

/** Every translatable value in a messages file, as [key, text]. */
function messages(locale) {
  const json = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const out = [];
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === "string") out.push([key, value]);
    else if (Array.isArray(value))
      for (const variant of value)
        for (const [selector, text] of Object.entries(variant.match ?? {})) out.push([`${key} / ${selector}`, text]);
  }
  return out;
}

const violations = [];
for (const [locale, entries] of Object.entries(GLOSSARY))
  for (const [key, text] of messages(locale))
    for (const entry of entries) {
      if (entry.allowIn?.test(key)) continue;
      const hit = entry.banned.exec(text);
      if (hit) violations.push({ locale, key, term: entry.term, found: hit[0], use: entry.use, text });
    }

for (const { locale, key, term, found, use, text } of violations)
  console.error(`${locale} ${key}\n  "${found}" for ${term} — use "${use}"\n  ${text}`);

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
console.log("i18n glossary: no violations");
