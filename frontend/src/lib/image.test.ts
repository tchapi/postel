import { describe, expect, it } from 'vitest'

import {
  centredCrop,
  clampCrop,
  imageSize,
  MAX_ZOOM,
  MIN_ZOOM,
  moveCrop,
  sourceRect,
  zoomCrop,
} from './image'

const landscape = { width: 1200, height: 800 }
const portrait = { width: 600, height: 900 }

/** The image covers the mask: no edge of the mask is left empty. */
const covers = (crop: { x: number; y: number; zoom: number }, image: typeof landscape) => {
  const size = imageSize(image, crop.zoom)
  return crop.x <= 0 && crop.y <= 0 && crop.x + size.width >= 1 && crop.y + size.height >= 1
}

describe('crop', () => {
  it('starts centred, the short side filling the mask', () => {
    expect(centredCrop(landscape)).toEqual({ zoom: 1, x: -0.25, y: 0 })
    expect(centredCrop(portrait)).toEqual({ zoom: 1, x: 0, y: -0.25 })
  })

  it('keeps the zoom between its limits', () => {
    expect(clampCrop({ zoom: 0.2, x: 0, y: 0 }, landscape).zoom).toBe(MIN_ZOOM)
    expect(clampCrop({ zoom: 9, x: 0, y: 0 }, landscape).zoom).toBe(MAX_ZOOM)
    expect(zoomCrop(centredCrop(landscape), landscape, 100).zoom).toBe(MAX_ZOOM)
    expect(zoomCrop(centredCrop(landscape), landscape, -3).zoom).toBe(MIN_ZOOM)
  })

  it('never lets the image leave an edge of the mask uncovered', () => {
    for (const [dx, dy] of [
      [5, 0],
      [-5, 0],
      [0, 5],
      [0, -5],
      [3, -3],
    ] as const) {
      const moved = moveCrop(centredCrop(landscape), landscape, dx, dy)
      expect(covers(moved, landscape)).toBe(true)
    }
    expect(moveCrop(centredCrop(landscape), landscape, 5, 5)).toEqual({ zoom: 1, x: 0, y: 0 })
    expect(moveCrop(centredCrop(landscape), landscape, -5, -5)).toEqual({ zoom: 1, x: -0.5, y: 0 })
  })

  it('pulls the image back in when zooming out near an edge', () => {
    const zoomed = moveCrop(zoomCrop(centredCrop(portrait), portrait, 4), portrait, -10, -10)
    const out = zoomCrop(zoomed, portrait, 1)
    expect(covers(out, portrait)).toBe(true)
  })

  it('keeps the point under the pointer in place while zooming', () => {
    const start = centredCrop(landscape)
    const focus = { x: 0.2, y: 0.7 }
    const zoomed = zoomCrop(start, landscape, 2, focus)
    // The image point under the focus, in image fractions, before and after
    const at = (c: typeof start) => {
      const size = imageSize(landscape, c.zoom)
      return { u: (focus.x - c.x) / size.width, v: (focus.y - c.y) / size.height }
    }
    expect(at(zoomed).u).toBeCloseTo(at(start).u)
    expect(at(zoomed).v).toBeCloseTo(at(start).v)
  })

  it('reads the square the mask shows, inside the image', () => {
    expect(sourceRect(centredCrop(landscape), landscape)).toEqual({ x: 200, y: 0, size: 800 })
    const deep = moveCrop(zoomCrop(centredCrop(landscape), landscape, 4), landscape, -9, -9)
    const rect = sourceRect(deep, landscape)
    expect(rect.size).toBe(200)
    expect(rect.x + rect.size).toBeCloseTo(landscape.width)
    expect(rect.y + rect.size).toBeCloseTo(landscape.height)
  })
})
