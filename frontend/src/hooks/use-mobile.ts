import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribeToMobile(change: () => void): () => void {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}

function getMobileSnapshot(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribeToMobile, getMobileSnapshot, () => false)
}
