import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'danger';

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variantClass = variant === 'secondary' ? styles.secondary : variant === 'danger' ? styles.danger : '';
  return <button className={[styles.button, variantClass, className].filter(Boolean).join(' ')} {...props} />;
}
