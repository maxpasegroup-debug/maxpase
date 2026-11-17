export function intakeProgramCode(durationDays: number | null, slug: string, name: string): "PBA_30_DAYS" | "PBA_180_DAYS" | null {
  if (durationDays === 30 || /starter|30[- ]day/i.test(`${slug} ${name}`)) return "PBA_30_DAYS";
  if (durationDays === 180 || /\b(?:pba[-_ ]?)?pro\b|180[- ]day/i.test(`${slug} ${name}`)) return "PBA_180_DAYS";
  return null;
}

export function isIntakeOpen(input: { programStatus: string; batchStatus: string; startDate: Date | null; endDate: Date | null; capacity: number | null; used: number; locationStatus: string | null }, now = new Date()) {
  return input.programStatus === "ACTIVE" && input.batchStatus === "ACTIVE" &&
    !!input.startDate && !!input.endDate && input.startDate <= now && input.endDate >= now &&
    (input.capacity === null || input.used < input.capacity) &&
    input.locationStatus === "ACTIVE";
}
