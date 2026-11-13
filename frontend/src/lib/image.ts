/*
 * The picture cropper's maths, kept apart from the component so it can be tested.
 *
 * Everything is measured in "mask units": the round mask's side is 1. At zoom 1 the
 * image's short side fills the mask exactly; `x` and `y` place the image's top-left
 * corner relative to the mask's, so they are 0 or negative.
 */

export type Crop = { x: number; y: number; zoom: number }
export type Size = { width: number; height: number }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The image's size in mask units at this zoom. */
export function imageSize(image: Size, zoom: number): Size {
  const short = Math.min(image.width, image.height)
  return { width: (image.width / short) * zoom, height: (image.height / short) * zoom }
}

/** Zoom within its limits, and the image moved back so that it covers the whole mask. */
export function clampCrop(crop: Crop, image: Size): Crop {
  const zoom = clampTo(crop.zoom, MIN_ZOOM, MAX_ZOOM)
  const size = imageSize(image, zoom)
  return {
    zoom,
    x: clampTo(crop.x, 1 - size.width, 0),
    y: clampTo(crop.y, 1 - size.height, 0),
  }
}

/** Zoom 1, the image's middle in the mask's middle. */
export function centredCrop(image: Size): Crop {
  const size = imageSize(image, 1)
  return { zoom: 1, x: (1 - size.width) / 2, y: (1 - size.height) / 2 }
}

export function moveCrop(crop: Crop, image: Size, dx: number, dy: number): Crop {
  return clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, image)
}

/**
 * A new zoom that keeps the point under `focus` (in mask units, the mask's centre by
 * default) where it is, as a pinch or a wheel turn expects.
 */
export function zoomCrop(
  crop: Crop,
  image: Size,
  zoom: number,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Crop {
  const next = clampTo(zoom, MIN_ZOOM, MAX_ZOOM)
  const ratio = next / crop.zoom
  return clampCrop(
    {
      zoom: next,
      x: focus.x - (focus.x - crop.x) * ratio,
      y: focus.y - (focus.y - crop.y) * ratio,
    },
    image,
  )
}

/** The square of the image, in its own pixels, that the mask shows. */
export function sourceRect(crop: Crop, image: Size): { x: number; y: number; size: number } {
  const { x, y, zoom } = clampCrop(crop, image)
  // One mask unit is this many image pixels
  const scale = Math.min(image.width, image.height) / zoom
  return { x: (0 - x) * scale, y: (0 - y) * scale, size: scale }
}

/** The masked square as a JPEG of `size` × `size` pixels. */
export async function cropToJpeg(
  image: HTMLImageElement | ImageBitmap,
  crop: Crop,
  size = 512,
): Promise<Blob> {
  const natural =
    'naturalWidth' in image
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : { width: image.width, height: image.height }
  const source = sourceRect(crop, natural)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no canvas')
  // A transparent PNG would turn black in a JPEG: white behind it instead
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, source.x, source.y, source.size, source.size, 0, 0, size, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('no jpeg'))),
      'image/jpeg',
      0.9,
    ),
  )
}
