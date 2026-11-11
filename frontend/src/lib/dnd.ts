/** Messages dragged from the list to a folder, carried by the browser's own drag and drop. */
const MIME = 'application/x-postel-messages'

export function setMessageDrag(dt: DataTransfer, uids: number[]) {
  dt.setData(MIME, JSON.stringify(uids))
  dt.effectAllowed = 'move'
}

/** True while the dragged thing is a list of messages. The data itself is only readable on drop. */
export function hasMessageDrag(dt: DataTransfer | null): boolean {
  return dt?.types.includes(MIME) ?? false
}

export function readMessageDrag(dt: DataTransfer): number[] {
  try {
    const uids: unknown = JSON.parse(dt.getData(MIME) || '[]')
    return Array.isArray(uids) ? uids.filter((u): u is number => Number.isInteger(u)) : []
  } catch {
    return []
  }
}
