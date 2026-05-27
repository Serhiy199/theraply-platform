"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { UrlObject } from "url";

type ButtonVariant = "primary" | "secondary" | "warning" | "danger" | "success" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: ReactNode;
  children: ReactNode;
};

type ButtonLinkProps = {
  href: string | UrlObject;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getVariantClasses(variant: ButtonVariant, disabled: boolean) {
  switch (variant) {
    case "secondary":
      return disabled
        ? "border border-slate-200 bg-slate-100 text-slate-400"
        : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50";
    case "danger":
      return disabled
        ? "border border-slate-200 bg-slate-100 text-slate-400"
        : "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";
    case "warning":
      return disabled
        ? "border border-slate-200 bg-slate-100 text-slate-400"
        : "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
    case "success":
      return disabled
        ? "border border-slate-200 bg-slate-100 text-slate-400"
        : "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "ghost":
      return disabled
        ? "bg-transparent text-slate-400"
        : "bg-transparent text-slate-700 hover:bg-slate-100";
    case "primary":
    default:
      return disabled
        ? "bg-slate-300 text-slate-800"
        : "bg-slate-900 text-white hover:bg-slate-800";
  }
}

function getVariantColor(variant: ButtonVariant, disabled: boolean) {
  if (disabled) {
    return variant === "primary" ? "#1f2937" : "#94a3b8";
  }

  switch (variant) {
    case "secondary":
      return "#0f172a";
    case "danger":
      return "#9f1239";
    case "warning":
      return "#78350f";
    case "success":
      return "#14532d";
    case "ghost":
      return "#334155";
    case "primary":
    default:
      return "#ffffff";
  }
}

function getSizeClasses(size: ButtonSize) {
  switch (size) {
    case "sm":
      return "px-4 py-2 text-sm";
    case "md":
    default:
      return "px-5 py-3 text-sm";
  }
}

function getButtonClasses({
  variant,
  size,
  fullWidth,
  disabled,
  className,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth: boolean;
  disabled: boolean;
  className?: string;
}) {
  return joinClasses(
    "inline-flex items-center justify-center rounded-full font-semibold transition",
    disabled ? "cursor-not-allowed" : "cursor-pointer",
    getSizeClasses(size),
    getVariantClasses(variant, disabled),
    fullWidth && "w-full",
    className,
  );
}

export function Button({
  type = "button",
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  loading = false,
  loadingText,
  className,
  style,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const resolvedColor = getVariantColor(variant, isDisabled);
  const mergedStyle: CSSProperties = {
    color: resolvedColor,
    WebkitTextFillColor: resolvedColor,
    ...style,
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={getButtonClasses({
        variant,
        size,
        fullWidth,
        disabled: isDisabled,
        className,
      })}
      style={mergedStyle}
      {...props}
    >
      {loading ? (loadingText ?? children) : children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
}: ButtonLinkProps) {
  const resolvedColor = getVariantColor(variant, false);

  return (
    <Link
      href={href}
      className={getButtonClasses({
        variant,
        size,
        fullWidth,
        disabled: false,
        className,
      })}
      style={{
        color: resolvedColor,
        WebkitTextFillColor: resolvedColor,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
