import { Button } from '@pfinance/ui/components/button'
import { Field, FieldError, FieldLabel } from '@pfinance/ui/components/field'
import { Input } from '@pfinance/ui/components/input'
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
