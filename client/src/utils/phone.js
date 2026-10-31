// Mobile number helpers, apart from validation.js so pages without a phone field (e.g. Log in)
// never load libphonenumber-js. Values are E.164 (e.g. "+393401234567"), as PhoneInput returns them.
// Metadata: the same set as PhoneInput in RegisterPage, the mock and the server (U5) – see the import paths.
import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';
import mobileExamples from 'libphonenumber-js/mobile/examples';
import en from 'react-phone-number-input/locale/en';

export function isPhone(value) {
  return typeof value === 'string' && value !== '' && isValidPhoneNumber(value);
}

// Country menu labels: English name + calling code, e.g. "Italy +39". The other keys of `en`
// (aria labels of the library) are kept. The library sorts the options by these labels.
export const countryLabels = {
  ...en,
  ...Object.fromEntries(
    getCountries()
      .filter((country) => en[country])
      .map((country) => [country, `${en[country]} +${getCountryCallingCode(country)}`]),
  ),
};

// Example mobile number for the placeholder, in national format: the field holds the national
// number (the calling code is shown next to the flag), e.g. Italy "312 345 6789".
export function examplePhone(country) {
  const example = country && getExampleNumber(country, mobileExamples);
  return example ? example.formatNational() : undefined;
}

// A pasted international number (e.g. "+41 79 123 45 67") as E.164, or null when the text is not one.
export function pastedInternationalPhone(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('+')) return null;
  const parsed = parsePhoneNumberFromString(trimmed);
  return parsed?.country ? parsed.number : null;
}
