'use client';
import * as Primitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { useTheme } from './theme';
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogClose = Primitive.Close;
export function DialogContent({
  theme,
  dir,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content> & { theme?: 'light' | 'dark' }) {
  const contextTheme = useTheme();
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="rv-overlay" data-theme={theme ?? contextTheme} />
      <Primitive.Content
        {...props}
        className="rv-dialog rv-root"
        data-theme={theme ?? contextTheme}
        dir={dir}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
