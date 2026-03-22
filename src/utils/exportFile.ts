import { EXPORT_DEFAULT_BASENAME, EXPORT_FILENAME_MAX_LENGTH } from '../constants/export'

export function sanitizeExportBaseName(name: string): string {
  const stripped = name
    .replace(/\.(png|jpg|jpeg|pdf)$/i, '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim()
  const collapsed = stripped.replace(/\s+/g, '-').replace(/-+/g, '-')
  const clipped = collapsed.slice(0, EXPORT_FILENAME_MAX_LENGTH)
  return clipped.length > 0 ? clipped : EXPORT_DEFAULT_BASENAME
}
