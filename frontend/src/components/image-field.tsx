"use client";

import { useState } from "react";
import { ApiError, uploadImage } from "@/lib/api";

export function Thumb({ src, alt = "" }: { src?: string | null; alt?: string }) {
  if (!src) {
    return <span className="inline-block h-9 w-9 rounded-md border border-line bg-ink/[0.03]" aria-hidden="true" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="h-9 w-9 rounded-md border border-line object-cover" />
  );
}

export function ImageField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadImage(file);
      onChange(result.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-20 w-20 rounded-md border border-line object-cover" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-md border border-dashed border-line text-xs text-ink/40">No image</div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {!disabled && (
            <>
              <input
                className="field"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={busy}
                onChange={(event) => onFile(event.target.files?.[0] || null)}
              />
              {value && (
                <button className="text-sm text-clay" type="button" onClick={() => onChange("")}>
                  Remove image
                </button>
              )}
            </>
          )}
          {busy && <p className="text-xs text-ink/50">Uploading…</p>}
          {error && <p className="text-xs text-clay">{error}</p>}
        </div>
      </div>
    </div>
  );
}
