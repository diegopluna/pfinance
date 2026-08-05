import * as React from 'react'

import { cn } from '@pfinance/ui/lib/utils'

// Uppercase status chip (Owner, Liability, Archived…). Pass natural-case
// children — the transform is CSS, so copy never has to be retyped for a
// restyle. 10px holds up only because the text is uppercase, semibold, and
// letter-spaced; don't reuse this scale for prose.
function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'shrink-0 rounded-full border border-border px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
