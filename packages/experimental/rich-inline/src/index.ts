/** Host loader entry; the browser entry imports only browser-safe shared modules. */
export { default, RichInline } from './host/index.ts'
export type { Config } from './host/index.ts'
export type * from './shared/types.ts'
