import { ApiRequestError } from './api-client';

/** Dependency-free DTO decoders reject malformed data without echoing it. */
export type Decoder<T> = (value: unknown) => T;
function invalid(): never {
  throw new ApiRequestError(502, 'INVALID_RESPONSE');
}
export const text: Decoder<string> = (value) => (typeof value === 'string' ? value : invalid());
export const flag: Decoder<boolean> = (value) => (typeof value === 'boolean' ? value : invalid());
export const integer: Decoder<number> = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : invalid();
export const nullable =
  <T>(decode: Decoder<T>): Decoder<T | null> =>
  (value) =>
    value === null ? null : decode(value);
export const optional =
  <T>(decode: Decoder<T>): Decoder<T | undefined> =>
  (value) =>
    value === undefined ? undefined : decode(value);
export const arrayOf =
  <T>(decode: Decoder<T>): Decoder<T[]> =>
  (value) =>
    Array.isArray(value) ? value.map(decode) : invalid();
export const oneOf =
  <const T extends readonly (string | boolean)[]>(values: T): Decoder<T[number]> =>
  (value) =>
    values.includes(value as T[number]) ? (value as T[number]) : invalid();
export function objectOf<S extends Record<string, Decoder<unknown>>>(
  shape: S,
): Decoder<{ [K in keyof S]: ReturnType<S[K]> }> {
  return (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(shape).map(([key, decode]) => [key, decode(record[key])]),
    ) as { [K in keyof S]: ReturnType<S[K]> };
  };
}
