/**
 * Countries members can pick for their profile, as ISO 3166-1 alpha-2 codes.
 * Only the code is stored; the name comes from the reader's own Intl data and
 * the flag from the code's letters, so there's no country list to maintain.
 */

// Every officially assigned alpha-2 code, in code order.
const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

export const COUNTRY_CODES: readonly string[] = CODES.split(" ");

const CODE_SET = new Set(COUNTRY_CODES);

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && CODE_SET.has(value);
}

/** The flag emoji for a code: its letters as regional indicator symbols. */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
}

let regionNames: { of: (code: string) => string | undefined } | null = null;

/** The country's English name, or its code where Intl doesn't know it. */
export function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export type Country = { code: string; name: string; flag: string };

let countryList: readonly Country[] | null = null;

/** Every country with its name and flag, in alphabetical order by name. */
export function countries(): readonly Country[] {
  countryList ??= COUNTRY_CODES.map((code) => ({ code, name: countryName(code), flag: countryFlag(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  return countryList;
}
