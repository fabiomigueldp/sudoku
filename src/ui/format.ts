export function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder
        .toString()
        .padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${remainder
        .toString()
        .padStart(2, '0')}`
}
