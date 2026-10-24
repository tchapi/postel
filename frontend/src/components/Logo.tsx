// The Postel mark: a P whose top is an envelope flap, white on a rounded square.
const SQUARE = 'M32.0 0C59 0 64 5 64 32.0S59 64 32.0 64S0 59 0 32.0S5 0 32.0 0Z'
const MARK =
  'M16.061 15.385 A1.59 1.59 0 0 1 18.782 14.443 L32.498 28.55 A2.12 2.12 0 0 0 35.197 28.834 L51.546 17.887 A1.59 1.59 0 0 1 54.012 19.374 L53.251 26.615 A13.78 13.78 0 0 1 38.106 38.879 L27.564 37.771 A3.18 3.18 0 0 0 24.069 40.601 L23.183 49.035 A3.18 3.18 0 0 1 19.688 51.865 L15.471 51.422 A3.18 3.18 0 0 1 12.641 47.927Z M24.527 13.509 A2.12 2.12 0 0 1 26.269 9.923 L45.163 11.909 A2.12 2.12 0 0 1 46.121 15.779 L35.846 22.659 A2.12 2.12 0 0 1 33.147 22.375Z'
// Heavier strokes for 16 and 32 px, where the regular mark gets thin
const MARK_SMALL =
  'M14.884 16.257 A1.68 1.68 0 0 1 17.759 15.262 L32.251 30.167 A2.24 2.24 0 0 0 35.103 30.467 L52.377 18.9 A1.68 1.68 0 0 1 54.983 20.472 L54.369 26.31 A14.56 14.56 0 0 1 38.367 39.269 L29.456 38.332 A3.36 3.36 0 0 0 25.763 41.322 L24.827 50.233 A3.36 3.36 0 0 1 21.134 53.224 L14.451 52.521 A3.36 3.36 0 0 1 11.46 48.828Z M26.194 12.691 A2.24 2.24 0 0 1 28.035 8.902 L43.648 10.543 A2.24 2.24 0 0 1 44.66 14.632 L36.17 20.317 A2.24 2.24 0 0 1 33.317 20.018Z'

/** The mark on its rounded square, in the user's accent. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <path fill="var(--mantine-primary-color-filled)" d={SQUARE} />
      <path fill="#fff" d={MARK} />
    </svg>
  )
}

/** The favicon in a given colour, as a data URL for <link rel="icon">. */
export function faviconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${color}" d="${SQUARE}"/><path fill="#fff" d="${MARK_SMALL}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
