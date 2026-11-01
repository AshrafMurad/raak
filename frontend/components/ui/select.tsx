'use client';
import * as SelectPrimitive from '@radix-ui/react-select';
import { useTheme } from './theme';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/cn';

type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  theme?: 'light' | 'dark';
  dir: 'rtl' | 'ltr';
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
  describedBy?: string;
};

// Owned shadcn-style Select: Radix supplies focus, typeahead and listbox semantics.
export function Select({
  id,
  name,
  label,
  placeholder,
  options,
  value,
  onValueChange,
  theme,
  dir,
  disabled,
  className,
  invalid,
  describedBy,
}: SelectProps) {
  const contextTheme = useTheme();
  return (
    <SelectPrimitive.Root
      name={name}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      dir={dir}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn('rv-select-trigger', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="rv-select-content rv-root"
          data-theme={theme ?? contextTheme}
          dir={dir}
          position="popper"
          sideOffset={8}
          collisionPadding={16}
          align="start"
        >
          <SelectPrimitive.ScrollUpButton className="rv-select-scroll">
            <ChevronUp size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="rv-select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                textValue={option.label}
                className="rv-select-item"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="rv-select-indicator">
                  <Check size={16} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="rv-select-scroll">
            <ChevronDown size={16} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
