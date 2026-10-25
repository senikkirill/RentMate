export interface MeterReading {
  km: number | null;
  mh: number | null;
}

export interface ValidateMeterInput {
  current: MeterReading;
  mileage?: unknown;
  engineHours?: unknown;
  /** Legacy API also accepts `mh` as alias. */
  mh?: unknown;
  prefix?: string;
}

function lessThan(label: string, val: unknown, cur: number | null): string | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  if (Number.isNaN(n)) return null;
  if (cur !== null && n < cur) return `${label}: значение не может быть меньше текущего (${cur})`;
  return null;
}

/** Returns Russian error string or null if readings are allowed. */
export function validateMeterMonotonicity(input: ValidateMeterInput): string | null {
  const pfx = input.prefix ?? "";
  const mhRaw = input.engineHours !== undefined ? input.engineHours : input.mh;
  const errs = [
    lessThan(`${pfx}пробег`, input.mileage, input.current.km),
    lessThan(`${pfx}моточасы`, mhRaw, input.current.mh),
  ].filter(Boolean) as string[];
  return errs.length ? errs.join("; ") : null;
}
