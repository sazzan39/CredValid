import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex gap-1 border-b border-line", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px border-b-2 border-transparent px-3 pb-2.5 pt-1 text-[14px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-[12px] text-white shadow-lg">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;
export function DropdownContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)] fade-in", className)}
        {...props}
      />
    </Menu.Portal>
  );
}
export function DropdownItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-subtle data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}
export function DropdownLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2.5 pb-1 pt-2 text-[12px] text-faint", className)} {...props} />;
}
export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}
export const DropdownRadioGroup = Menu.RadioGroup;
export function DropdownRadioItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={cn("flex cursor-pointer select-none items-center gap-2.5 rounded-md py-2 pl-7 pr-2.5 text-[13.5px] outline-none data-[highlighted]:bg-subtle relative", className)}
      {...props}
    >
      <Menu.ItemIndicator className="absolute left-2.5 size-1.5 rounded-full bg-primary" />
      {children}
    </Menu.RadioItem>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 whitespace-nowrap px-4 text-left text-[12.5px] font-medium text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3.5 align-middle text-[14px]", className)} {...props} />;
}
