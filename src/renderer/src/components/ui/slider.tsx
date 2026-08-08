import { cn } from '@/lib/utils'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  className?: string
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className
}: SliderProps): React.JSX.Element {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('dp-range w-full', className)}
      style={{ ['--dp-fill' as string]: `${fill}%` }}
    />
  )
}
