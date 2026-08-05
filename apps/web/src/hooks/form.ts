import { createFormHook } from '@tanstack/react-form'
import { SubmitButton, TextField } from '@/components/form-fields'
import { fieldContext, formContext } from '@/hooks/form-context'

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
})
