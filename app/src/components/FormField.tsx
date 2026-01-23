import { ReactNode } from 'react'
import styles from './FormField.module.css'

export interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: FormFieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined
  const hintId = hint ? `${htmlFor}-hint` : undefined

  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
        {required && <span className={styles.required} aria-hidden="true">*</span>}
      </label>

      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}

      <div className={styles.inputWrapper}>{children}</div>

      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
