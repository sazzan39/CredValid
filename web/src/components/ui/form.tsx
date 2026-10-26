import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-fg shadow-[0_1px_2px_rgb(16_24_40/0.04)] placeholder:text-faint transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12 disabled:bg-subtle disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/12";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, "h-10", props.readOnly && "bg-subtle text-muted focus:ring-0", className)} {...props} />
));
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className={cn("relative", className)}>
    <select ref={ref} className={cn(field, "h-10 appearance-none pr-9")} {...props}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
  </div>
));
Select.displayName = "Select";

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  ({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn("text-[13.5px] font-medium text-fg", className)} {...props} />,
);
Label.displayName = "Label";

export function Field({
  label,
  optional,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1 font-normal text-faint">(optional)</span>}
      </Label>
      {React.isValidElement<{ "aria-describedby"?: string }>(children) ? React.cloneElement(children, { "aria-describedby": describedBy }) : children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
