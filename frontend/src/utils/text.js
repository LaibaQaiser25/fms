// Capitalizes only the first letter of a string, leaving the rest untouched
// (sentence case), unlike Tailwind's `capitalize` class which title-cases every word.
export function capitalizeFirstLetter(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
