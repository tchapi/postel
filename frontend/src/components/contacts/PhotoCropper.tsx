import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button, Group, Modal, Slider, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import {
  centredCrop,
  cropToJpeg,
  imageSize,
  MAX_ZOOM,
  MIN_ZOOM,
  moveCrop,
  zoomCrop,
  type Crop,
} from '../../lib/image'
import { useI18n } from '../../lib/i18n'
import classes from './PhotoCropper.module.css'

export type PhotoCropperProps = {
  /** The chosen image; the dialog is open while there is one. */
  file: File | null
  onApply: (jpeg: Blob) => void
  onCancel: () => void
  /** The browser cannot decode the file. */
  onUnreadable: () => void
}

/** Room around the round mask inside the square stage, in px. */
const MARGIN = 20
const KEY_STEP = 0.02

/**
 * Frame a picture under a round mask: drag to move, wheel or pinch to zoom, keys too.
 * The image can never leave part of the mask empty; Apply renders a 512 × 512 JPEG.
 */
export function PhotoCropper({ file, onApply, onCancel, onUnreadable }: PhotoCropperProps) {
  const { t } = useI18n()
  const narrow = useMediaQuery('(max-width: 47.99em)')
  const stage = narrow ? 260 : 320
  const mask = stage - 2 * MARGIN

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, zoom: 1 })
  const [busy, setBusy] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)

  // Decode the file; a format the browser cannot read is said at once
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    let live = true
    img.src = url
    img
      .decode()
      .then(() => {
        if (!live) return
        setImage(img)
        setSrc(url)
        setCrop(centredCrop({ width: img.naturalWidth, height: img.naturalHeight }))
      })
      .catch(() => {
        if (live) onUnreadable()
      })
    return () => {
      live = false
      URL.revokeObjectURL(url)
      setImage(null)
      setSrc(null)
    }
  }, [file, onUnreadable])

  const natural = image ? { width: image.naturalWidth, height: image.naturalHeight } : null

  // Wheel zoom needs a listener that can stop the page from scrolling
  useEffect(() => {
    const el = stageRef.current
    if (!el || !image) return
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const focus = {
        x: (e.clientX - rect.left - MARGIN) / mask,
        y: (e.clientY - rect.top - MARGIN) / mask,
      }
      setCrop((c) => zoomCrop(c, size, c.zoom * Math.exp(-e.deltaY * 0.0025), focus))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [image, mask])

  const toMask = (clientX: number, clientY: number) => {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - MARGIN) / mask, y: (clientY - rect.top - MARGIN) / mask }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom }
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId)
    if (!last || !natural) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const focus = toMask((a.x + b.x) / 2, (a.y + b.y) / 2)
      const zoom = pinch.current.zoom * (distance / pinch.current.distance)
      setCrop((c) => zoomCrop(c, natural, zoom, focus))
      return
    }
    if (pointers.current.size === 1) {
      const dx = (e.clientX - last.x) / mask
      const dy = (e.clientY - last.y) / mask
      setCrop((c) => moveCrop(c, natural, dx, dy))
    }
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!natural) return
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP
    // Arrows move what is seen the way they point, so the image goes the other way
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      setCrop((c) => moveCrop(c, natural, move[0], move[1]))
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      setCrop((c) => zoomCrop(c, natural, c.zoom * 1.1))
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      setCrop((c) => zoomCrop(c, natural, c.zoom / 1.1))
    }
  }

  const apply = async () => {
    if (!image) return
    setBusy(true)
    try {
      onApply(await cropToJpeg(image, crop, 512))
    } catch {
      onUnreadable()
    } finally {
      setBusy(false)
    }
  }

  const shown = natural ? imageSize(natural, crop.zoom) : null

  return (
    <Modal
      opened={file !== null}
      onClose={onCancel}
      title={t.contact.cropTitle}
      centered
      size="auto"
      // Above the editor on a phone, where the editor fills the screen
      zIndex={300}
    >
      <Stack gap={16} align="center">
        <div
          ref={stageRef}
          className={classes.stage}
          style={{ width: stage, height: stage }}
          role="group"
          tabIndex={0}
          aria-label={t.contact.cropArea}
          aria-describedby="crop-help"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {src && shown && (
            <img
              src={src}
              alt=""
              draggable={false}
              className={classes.image}
              style={{
                width: shown.width * mask,
                height: shown.height * mask,
                transform: `translate(${MARGIN + crop.x * mask}px, ${MARGIN + crop.y * mask}px)`,
              }}
            />
          )}
          <div
            className={classes.mask}
            style={{ inset: MARGIN, width: mask, height: mask }}
            aria-hidden
          />
        </div>
        <Text id="crop-help" size="xs" c="dimmed" ta="center" maw={stage}>
          {t.contact.cropHelp}
        </Text>
        <Group gap={10} wrap="nowrap" w={stage}>
          <ZoomOutIcon size={16} strokeWidth={1.75} className={classes.zoomIcon} aria-hidden />
          <Slider
            style={{ flex: 1 }}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            label={null}
            disabled={!natural}
            thumbLabel={t.contact.zoom}
            onChange={(zoom) => natural && setCrop((c) => zoomCrop(c, natural, zoom))}
          />
          <ZoomInIcon size={16} strokeWidth={1.75} className={classes.zoomIcon} aria-hidden />
        </Group>
        <Group gap={8} justify="flex-end" w="100%">
          <Button variant="default" onClick={onCancel}>
            {t.contact.cancel}
          </Button>
          <Button onClick={() => void apply()} loading={busy} disabled={!natural}>
            {t.contact.apply}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
