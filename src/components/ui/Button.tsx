import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

const variants = {
  primary:
    "bg-[#A05035] text-[#F5EFE0] hover:bg-[#8A4229] focus-visible:ring-[#A05035]",
  secondary:
    "bg-[#F5EFE0] text-[#7C563D] border border-[#B88D6A] hover:bg-[#EDE4CF] focus-visible:ring-[#A05035]",
  danger:
    "bg-[#C0392B] text-white hover:bg-[#A93226] focus-visible:ring-[#C0392B]",
  ghost:
    "bg-transparent text-[#7C563D] hover:bg-[#E9DFC6] focus-visible:ring-[#B88D6A]",
};

const sizes = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "cursor-pointer",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
