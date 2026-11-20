// The same rules as the server (backend/src/validation/submission.ts), so an entry the phone
// accepts is never refused later.

// "mh 09 ab-1234" becomes "MH09AB1234".
export function cleanTruckNumber(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/g, '');
}

export function nameProblem(name: string): string | null {
  const length = Array.from(name.trim()).length; // characters, as the server counts (an emoji is 1, not 2)
  return length >= 2 && length <= 100 ? null : 'Enter the name (2-100 characters)';
}

export function truckProblem(truck: string): string | null {
  return /^[A-Z0-9]{4,12}$/.test(cleanTruckNumber(truck)) ? null : 'Enter the truck number (4-12 letters or digits)';
}
