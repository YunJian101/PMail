import { cn, avatarTone, initials, type AvatarTone } from '@/lib/utils'

const TONES: Record<AvatarTone, string> = {
  blue: 'from-[#4f83ff] to-[#2c57d6]',
  teal: 'from-[#2dd4bf] to-[#0e9384]',
  violet: 'from-[#a78bfa] to-[#6d3bef]',
  amber: 'from-[#fbbf24] to-[#e07a0c]',
  rose: 'from-[#fb7185] to-[#d92d5c]',
  slate: 'from-[#94a3b8] to-[#5a6a80]',
}

export function Avatar({
  name,
  email,
  tone,
  size = 34,
  className,
}: {
  name?: string
  email?: string
  tone?: AvatarTone
  size?: number
  className?: string
}) {
  const seed = email || name || '?'
  const resolved = tone ?? avatarTone(seed)
  const label = initials(name || email || '?')
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={cn(
        'grid flex-none select-none place-items-center rounded-full bg-gradient-to-br font-[650] text-white',
        'shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]',
        TONES[resolved],
        className,
      )}
    >
      {label}
    </span>
  )
}
