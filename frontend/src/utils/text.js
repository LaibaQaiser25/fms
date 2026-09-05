// Capitalizes only the first letter of a string, leaving the rest untouched
// (sentence case), unlike Tailwind's `capitalize` class which title-cases every word.
export function capitalizeFirstLetter(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Capitalizes the first letter of each word, leaving the rest of each word untouched.
export function capitalizeWords(value) {
  if (!value) return value;
  return value.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// Minor words (articles, conjunctions, short prepositions) kept lowercase by
// capitalizeAddress unless they start the string, matching common address/title casing.
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'nor', 'of', 'on', 'onto', 'or', 'over', 'per', 'so', 'the', 'to', 'up', 'via', 'with', 'yet'
]);

// Like capitalizeWords, but leaves minor conjunction/preposition/article words
// lowercase unless they are the first word of the string.
export function capitalizeAddress(value) {
  if (!value) return value;
  let isFirstWord = true;
  return value.replace(/(^|\s)(\S+)/g, (match, sep, word) => {
    const isMinor = !isFirstWord && MINOR_WORDS.has(word.toLowerCase());
    isFirstWord = false;
    return sep + (isMinor
      ? word.charAt(0).toLowerCase() + word.slice(1)
      : word.charAt(0).toUpperCase() + word.slice(1));
  });
}
