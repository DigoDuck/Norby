import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, error, children, className }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-content-2"
        >
          {label}
        </label>
      )}
      {children}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
