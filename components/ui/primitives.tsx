import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PopCard({
  title,
  subtitle,
  className,
  children,
}: PropsWithChildren<{ title?: string; subtitle?: string; className?: string }>) {
  return (
    <div
      className={cx(
        "bg-[var(--card-surface)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-style)] rounded-[var(--radius)] text-[var(--ink)]",
        "p-6",
        className,
      )}
    >
      {(title || subtitle) && (
        <div className="mb-3 space-y-1">
          {title && <h3 className="text-xl font-semibold leading-tight tracking-tight">{title}</h3>}
          {subtitle && <p className="text-sm text-[rgba(11,11,15,0.7)]">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Chip({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 px-3 py-1 rounded-full",
        "border-[var(--border-width)] border-[var(--border)] bg-[var(--card-surface)] text-[var(--ink)]",
        "shadow-[var(--shadow-style)] transition-transform duration-150",
        "hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_var(--shadow)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "danger" | "success" | "neutral";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent-blue)] text-[var(--ink)]",
  danger: "bg-[var(--accent-red)] text-[var(--ink)]",
  success: "bg-[var(--accent-green)] text-[var(--ink)]",
  neutral: "bg-[var(--card-surface)] text-[var(--ink)]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

function BaseButton({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 px-4 py-2 font-semibold",
        "border-[var(--border-width)] border-[var(--border)] rounded-[var(--radius)]",
        "shadow-[var(--shadow-style)] transition-transform duration-150",
        "hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_var(--shadow)]",
        "active:translate-x-[1px] active:translate-y-[1px] active:shadow-[4px_4px_0_var(--shadow)]",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--border)] focus-visible:ring-offset-[var(--paper-bg)]",
        variantStyles[variant],
        className,
      )}
    />
  );
}

export function PrimaryButton(props: ButtonProps) {
  return <BaseButton variant="primary" {...props} />;
}

export function DangerButton(props: ButtonProps) {
  return <BaseButton variant="danger" {...props} />;
}

export function SuccessButton(props: ButtonProps) {
  return <BaseButton variant="success" {...props} />;
}

export function NeutralButton(props: ButtonProps) {
  return <BaseButton variant="neutral" {...props} />;
}
