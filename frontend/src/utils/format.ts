export function fmtSize(bytes: number): string {
  const units = ['B','KB','MB','GB','TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++ }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString()
}