import { Button } from '@pfinance/ui/components/button'
import { Field, FieldError, FieldLabel } from '@pfinance/ui/components/field'
import { Input } from '@pfinance/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pfinance/ui/components/select'
import { useFieldContext, useFormContext } from '@/hooks/form-context'

// Bound components for useAppForm (see hooks/form.ts): field components read
// the field they're rendered under via context, so screens compose forms
// from `<form.AppField>` / `<form.AppForm>` without prop plumbing.

const asMessage = (error: unknown) =>
  typeof error === 'string' ? { message: error } : (error as { message?: string })

export function TextField({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof Input>) {
  const field = useFieldContext<string>()
  const errors = field.state.meta.errors
  const invalid = errors.length > 0
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid || undefined}
        {...inputProps}
      />
      <FieldError errors={errors.map(asMessage)} />
    </Field>
  )
}

export function SelectField({
  label,
  placeholder,
  options,
  renderValue,
}: {
  label: string
  placeholder?: string
  options: ReadonlyArray<{ value: string; label: string }>
  // Compact display for the closed trigger when the option labels are long
  // (e.g. "BRL — Brazilian Real" listed, "BRL" once chosen).
  renderValue?: (value: string) => React.ReactNode
}) {
  const field = useFieldContext<string>()
  const errors = field.state.meta.errors
  const invalid = errors.length > 0
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Select
        // The form models "nothing chosen" as '', Base UI as null.
        value={field.state.value === '' ? null : field.state.value}
        onValueChange={(value) => field.handleChange(value ?? '')}
      >
        <SelectTrigger id={field.name} aria-invalid={invalid || undefined} className="w-full">
          <SelectValue
            placeholder={placeholder}
            children={
              renderValue
                ? (value: string | null) => (value === null ? placeholder : renderValue(value))
                : undefined
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={errors.map(asMessage)} />
    </Field>
  )
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting}>
          {children}
        </Button>
      )}
    </form.Subscribe>
  )
}
