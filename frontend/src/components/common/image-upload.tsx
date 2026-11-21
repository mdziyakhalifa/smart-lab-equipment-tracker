import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}

export function ImageUpload({ value, onChange, label = "Upload image" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const preview = mediaUrl(value);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const result = await api.upload<{ url: string }>("/uploads", file);
      onChange(result.url);
      toast.success("Image uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative overflow-hidden rounded-md border border-border">
          <img src={preview} alt="Upload preview" className="h-36 w-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute right-2 top-2"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-warm-100/40 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-warm-100/70">
          {uploading ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-foreground-muted" /> : <Upload className="mb-2 h-5 w-5 text-foreground-muted" />}
          <span className="text-[13px] font-medium text-foreground">{uploading ? "Uploading…" : label}</span>
          <span className="mt-0.5 text-[11px] text-foreground-muted">JPEG, PNG, WebP or GIF · max 5 MB</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
