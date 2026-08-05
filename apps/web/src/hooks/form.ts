import { createFormHook } from '@tanstack/react-form'
import { ComboboxField, SubmitButton, TextField } from '@/components/form-fields'
import { fieldContext, formContext } from '@/hooks/form-context'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { ComboboxField, TextField },
  formComponents: { SubmitButton },
})
