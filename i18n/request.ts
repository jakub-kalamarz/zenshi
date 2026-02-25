import {getRequestConfig} from 'next-intl/server';
import {routing} from './routing';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = {[key: string]: JsonValue};

function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const output: JsonObject = {...base};
  for (const [key, value] of Object.entries(override)) {
    const prev = output[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev)
    ) {
      output[key] = deepMerge(prev as JsonObject, value as JsonObject);
      continue;
    }
    output[key] = value;
  }
  return output;
}

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = routing.locales.includes(requested as (typeof routing.locales)[number])
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;

  const enMessages = (await import('../messages/en.json')).default as JsonObject;
  const localeMessages =
    locale === 'en'
      ? enMessages
      : ((await import(`../messages/${locale}.json`)).default as JsonObject);

  return {
    locale,
    messages: deepMerge(enMessages, localeMessages)
  };
});
