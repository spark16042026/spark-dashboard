import { Score } from '@/types'

const CONFIG: Record<Score, { label: string; classes: string }> = {
  Scorching: { label: '🔥 Scorching', classes: 'bg-red-100 text-red-700 border border-red-300' },
  Hot:       { label: '🌶 Hot',       classes: 'bg-orange-100 text-orange-700 border border-orange-300' },
  Warm:      { label: '☀️ Warm',      classes: 'bg-yellow-100 text-yellow-700 border border-yellow-300' },
  Cold:      { label: '❄️ Cold',      classes: 'bg-blue-100 text-blue-600 border border-blue-300' },
}

export default function ScoreBadge({ score }: { score: Score }) {
  const { label, classes } = CONFIG[score] ?? CONFIG.Warm
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}
