/** Primitive wire validation shared verbatim with the generated ArkTS diagnostic reader. */
export const WIRE_INITIAL_CURSOR = -1
/** Protocol string limit, including command and stream generation identifiers. */
export const WIRE_TEXT_MAX = 4096
/** @param value - numeric wire field. @returns whether it is a lossless nonnegative integer. */
export function isWireNatural(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 }
/** @param value - numeric relay position. @returns whether it is the initial sentinel or a lossless natural cursor. */
export function isWireCursor(value: number): boolean { return value === WIRE_INITIAL_CURSOR || isWireNatural(value) }
/** @param value - string wire field. @returns whether it is nonblank and within the protocol limit. */
export function isWireText(value: string): boolean { return value.trim().length > 0 && value.length <= WIRE_TEXT_MAX }
/** @param value - opaque identifier. @returns whether it meets the branded ID character and length constraints. */
export function isWireId(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) }
