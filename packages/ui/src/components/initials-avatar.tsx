import * as React from 'react'

import { cn } from '@pfinance/ui/lib/utils'

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

// Decorative initials disc for a person or household. Always rendered next
// to the visible name, so it is hidden from assistive technology.
function InitialsAvatar({
  name,
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> & { name: string }) {
  return (
    <span
      data-slot="initials-avatar"
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10.5px] font-semibold text-muted-foreground',
        className,
      )}
      {...props}
    >
      {initialsOf(name)}
    </span>
  )
}

export { InitialsAvatar }
