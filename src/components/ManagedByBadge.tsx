import { ManagedBy } from '@/types'

export default function ManagedByBadge({ managedBy }: { managedBy: ManagedBy }) {
  if (managedBy === 'ai') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 border border-violet-300">
        ✦ AI
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-300">
      👤 You
    </span>
  )
}
