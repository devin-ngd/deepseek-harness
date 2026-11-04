/** A carrier-owned view of one reservation; Desktop keeps its native guest element. */
import { createElement, useEffect, useRef } from 'react'
import { nativeRich, type RichReservation } from './native.ts'

/** Props for the trusted guest view. */
interface RichGuestProps { reservation: RichReservation; height: number; className: string | undefined; label: string }

/**
 * @param props - trusted reservation, layout and localized label.
 * @returns the carrier's guest view without exposing Host methods to generated content.
 */
export function RichGuest({ reservation, height, className, label }: RichGuestProps) {
  const container = useRef<HTMLDivElement>(null), attach = nativeRich()?.attach
  useEffect(() => {
    if (attach === undefined || container.current === null) return
    return attach(reservation.lease, container.current)
  }, [attach, reservation.lease])
  return attach === undefined ? createElement('webview', { name: reservation.lease, partition: reservation.partition,
    src: reservation.src, className, style: { height }, 'aria-label': label })
    : <div ref={container} className={className} style={{ height }} aria-label={label}/>
}
