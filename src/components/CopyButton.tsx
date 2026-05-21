'use client';

import { useState } from 'react';

interface CopyButtonProps {
  text: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
}

export default function CopyButton({ text, className, label = '복사', copiedLabel = '복사됨!' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={className || 'absolute top-2 right-2 px-2.5 py-1 bg-accent text-white text-[10px] font-bold rounded-md hover:bg-accent-hover transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40'}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
