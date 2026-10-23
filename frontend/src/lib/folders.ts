import type { Folder, FolderRole } from '../api/types'

export function flattenFolders(folders: Folder[]): Folder[] {
  return folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)])
}

export function folderByRole(folders: Folder[] | undefined, role: FolderRole): Folder | undefined {
  return folders && flattenFolders(folders).find((folder) => folder.role === role)
}

export function folderById(folders: Folder[] | undefined, id: string): Folder | undefined {
  return folders && flattenFolders(folders).find((folder) => folder.id === id)
}
