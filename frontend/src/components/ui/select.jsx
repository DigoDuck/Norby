import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";

const fieldBase =
  "w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-norby-ivory text-sm placeholder:text-norby-ivory/40 focus:outline-none focus:ring-2 focus:ring-norby-teal/40 transition";

/**
 * Themed dropdown built on @base-ui/react Select.
 *
 * @param {string} id
 * @param {string} value - "" means nothing selected
 * @param {string} [placeholder]
 * @param {{ value: string; label: string }[]} options
 * @param {(value: string) => void} onChange - receives the VALUE string, not a DOM event
 * @param {boolean} [disabled]
 */
export function Select({ id, value, placeholder, options, onChange, disabled }) {
  // Base UI onValueChange receives (value, eventDetails)
  function handleValueChange(newValue) {
    if (onChange) onChange(newValue ?? "");
  }

  // Determine the label of the currently selected option
  const selectedLabel = options?.find((o) => o.value === value)?.label;
  const isPlaceholder = !value || value === "";

  return (
    <SelectPrimitive.Root
      id={id}
      value={value || null}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      {/* Trigger */}
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        className={cn(
          fieldBase,
          "flex items-center justify-between cursor-pointer",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          {isPlaceholder ? (
            <span className="text-norby-ivory/40">{placeholder}</span>
          ) : (
            <span>{selectedLabel}</span>
          )}
        </SelectPrimitive.Value>
        <ChevronDown size={14} className="text-norby-ivory/50 shrink-0" />
      </SelectPrimitive.Trigger>

      {/* Portal → Positioner → Popup → List → Items */}
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="isolate z-50 outline-none"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup
            data-slot="select-popup"
            className="bg-norby-surface border border-white/10 rounded-lg shadow-xl p-1 min-w-[var(--anchor-width)] origin-[var(--transform-origin)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100"
          >
            <SelectPrimitive.List>
              {options?.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  data-slot="select-item"
                  className="relative flex items-center justify-between px-3 py-2 rounded-md text-sm text-norby-ivory cursor-default select-none outline-none data-highlighted:bg-white/5"
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="flex items-center">
                    <Check size={12} className="text-norby-teal" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
