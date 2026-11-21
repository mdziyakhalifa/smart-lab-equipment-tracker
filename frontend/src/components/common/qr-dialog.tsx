import { useEffect, useState } from "react";
import { Download, Loader2, QrCode } from "lucide-react";
import { fetchQrObjectUrl } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface QrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  path: string | null;
  filename: string;
}

export function QrDialog({ open, onOpenChange, title, subtitle, path, filename }: QrDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !path) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    fetchQrObjectUrl(path)
      .then((nextUrl) => {
        if (revoked) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setUrl(nextUrl);
      })
      .catch((cause) => {
        if (!revoked) setError(cause instanceof Error ? cause.message : "Unable to generate QR code.");
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, path]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /> {title}</DialogTitle>
          <DialogDescription>{subtitle ?? "Scan this label to identify the equipment record."}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[240px] items-center justify-center rounded-md border border-border bg-warm-100/50 p-4">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" /> : null}
          {error ? <p className="text-sm text-foreground-danger">{error}</p> : null}
          {url ? <img src={url} alt="Equipment QR code" className="h-56 w-56 rounded border border-border bg-card p-2" /> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          <Button asChild disabled={!url}>
            <a href={url ?? "#"} download={filename}><Download className="h-4 w-4" /> Download PNG</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
