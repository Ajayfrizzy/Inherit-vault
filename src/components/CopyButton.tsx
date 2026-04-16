import { useState } from "react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export default function CopyButton({
  value,
  label = "Copy",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("Failed to copy value:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#83e8d4] transition-colors hover:border-[#00d4aa]/35 hover:bg-[#00d4aa]/10 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
