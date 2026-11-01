import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

const buttonVariants = cva('rv-button', {
  variants: {
    variant: {
      primary: 'rv-button-primary',
      secondary: 'rv-button-secondary',
      ghost: 'rv-button-ghost',
      danger: 'rv-button-danger',
    },
    size: { default: '', icon: 'rv-button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

// Owned shadcn-style primitive: Slot composition and explicit CVA variants.
export function Button({
  className,
  variant,
  size,
  asChild,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
