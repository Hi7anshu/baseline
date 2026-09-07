// Shim: the vendored BodyMap imports `../lib/i18n.js`. This app is English-only and has no
// language switcher, so re-export the dependency-free core and keep the vendored file
// byte-identical to upstream.
export { LANGS, INSTR_LANGS, DATE_LOCALES, getLang, dateLocale, t, instrFor } from './i18n-core.js'
