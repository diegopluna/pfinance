import { createFormHook } from '@tanstack/react-form'
import { SelectField, SubmitButton, TextField } from '@/components/form-fields'
import { fieldContext, formContext } from '@/hooks/form-context'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { SelectField, TextField },
  formComponents: { SubmitButton },
})
