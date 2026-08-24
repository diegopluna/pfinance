import { createFileRoute } from '@tanstack/react-router'
import { renderSVG } from 'uqr'
import { DATE_FORMATS, isDateFormat, type DateFormat } from '@pfinance/db/date-formats'
import { Card, CardContent } from '@pfinance/ui/components/card'
import { Field, FieldLabel } from '@pfinance/ui/components/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pfinance/ui/components/select'
import { useHouseholdMutations, useMe } from '@/hooks/use-me'
import { formatDayDate } from '@/lib/dates'

export const Route = createFileRoute('/_authed/settings')({
  head: () => ({ meta: [{ title: 'Settings · Goblin' }] }),
  component: SettingsScreen,
})

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  system: 'System default',
  dmy: 'Day, month, year',
  mdy: 'Month, day, year',
  ymd: 'Year-month-day',
}

// Each option carries today's date in that format, so the choice is made by
// example rather than by decoding the label.
const dateFormatOptions = () => {
  const today = new Date()
  return DATE_FORMATS.map((format) => ({
    value: format,
    label: `${DATE_FORMAT_LABELS[format]} · ${formatDayDate(today, format)}`,
  }))
}

// The pairing QR (issue #74): the raw https URL of the Server's API — no
// custom scheme, no structured payload — so the app's scanner feeds the same
// probe as typing the address by hand. A build-time constant, so it is
// encoded once at module load. Black-on-white regardless of theme: a QR is
// an optical artifact, and scanners want dark modules on a light ground.
const serverUrl = import.meta.env.VITE_API_URL
const serverQr = serverUrl
  ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(serverUrl, { ecc: 'M', border: 2 }))}`
  : null

// Settings (issue #31; Claude Design 2e places Settings last in the nav).
// One Display card for now — the date format preference. Household-level
// like the ledger it formats: every Member sees the same dates, and every
// Member may change them.
function SettingsScreen() {
  const { data: me, isPending, isError } = useMe()
  const { save: saveDateFormat } = useHouseholdMutations()

  const options = dateFormatOptions()

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Preferences for {me?.household.name ?? 'the household'}. Everyone in the household shares
          these.
        </p>
      </div>

      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load settings.
        </p>
      ) : (
        <Card size="sm" className="max-w-xl">
          <CardContent className="flex flex-col gap-4">
            <Field className="gap-1">
              <FieldLabel htmlFor="settings-date-format">Date format</FieldLabel>
              <Select
                items={options}
                value={me.household.dateFormat}
                onValueChange={(value: string | null) => {
                  if (isDateFormat(value) && value !== me.household.dateFormat) {
                    saveDateFormat.mutate({ dateFormat: value })
                  }
                }}
              >
                <SelectTrigger id="settings-date-format" disabled={saveDateFormat.isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How day-level dates read — in the ledger, imports, and date pickers. Display only:
                stored dates never change.
              </p>
              {saveDateFormat.isError && (
                <p role="alert" className="text-sm text-destructive">
                  Couldn&apos;t save the date format. Try again.
                </p>
              )}
            </Field>
          </CardContent>
        </Card>
      )}

      {serverQr && (
        <Card size="sm" className="max-w-xl">
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">Mobile app</h2>
              <p className="text-sm text-muted-foreground">
                Scan with the Goblin app on your phone to connect it to this server.
              </p>
            </div>
            <img
              src={serverQr}
              alt="QR code of this server's address"
              width={192}
              height={192}
              className="size-48 rounded-lg border border-border"
            />
            <p className="text-xs text-muted-foreground">
              Can&apos;t scan? Enter{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {serverUrl}
              </code>{' '}
              in the app instead.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
