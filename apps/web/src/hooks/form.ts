import { createFormHook } from '@tanstack/react-form'
import { ComboboxField, SubmitButton, TextField } from '@/components/form-fields'
import { fieldContext, formContext } from '@/hooks/form-context'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { ComboboxField, TextField },
  formComponents: { SubmitButton },
})

// Pass as `onSubmitInvalid` so a failed submit lands keyboard and screen-
// reader users on the first field that needs fixing. The frame wait lets the
// errors (and their aria-invalid marks) render first.
export const focusFirstInvalid = () => {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  })
}
