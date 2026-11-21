import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Keyboard,
  QrCode,
  ScanLine,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Equipment } from "@/types";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EquipmentThumb } from "@/components/common/equipment-thumb";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ScanPage() {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [history, setHistory] = useState<{ code: string; name: string; at: string }[]>([]);
  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);

  const lookupMutation = useMutation({
    mutationFn: (code: string) => api.get<Equipment>("/equipment/lookup", { code }),
    onSuccess: (result) => {
      setEquipment(result);
      setHistory((current) => [{ code: result.asset_tag, name: result.name, at: new Date().toISOString() }, ...current].slice(0, 6));
      toast.success(`Matched ${result.name}.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No equipment matched this code."),
  });

  useEffect(() => {
    if (!scanning) return;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    setCameraError(null);
    processingRef.current = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (processingRef.current) return;
          processingRef.current = true;
          setScanning(false);
          setManualCode(decodedText);
          lookupMutation.mutate(decodedText);
        },
        () => {
          // Per-frame decode misses are expected; no user-facing error.
        },
      )
      .catch((error) => {
        setCameraError(error instanceof Error ? error.message : "Unable to access the camera.");
        setScanning(false);
      });

    return () => {
      const active = scannerRef.current;
      scannerRef.current = null;
      if (active) {
        active.stop().then(() => active.clear()).catch(() => undefined);
      }
    };
    // The scanner lifecycle is intentionally tied only to the scanning flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) {
      toast.error("Enter an asset tag or scan a QR code.");
      return;
    }
    lookupMutation.mutate(code);
  }

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="QR identification"
        title="Scan equipment label"
        description="Scan a QR label with your device camera or enter an asset tag to open the matching equipment record."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /> Camera scanner</CardTitle>
            <CardDescription>Point the camera at a QR label. Camera access is required.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-md border border-border bg-card">
              <div id="qr-reader" className="min-h-[280px] w-full [&_video]:w-full [&_video]:rounded-md" />
              {!scanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-warm-100/95 text-center text-foreground-muted p-6">
                  <ScanLine className="h-8 w-8 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Scanner Ready</p>
                  <p className="max-w-xs text-xs text-muted-foreground">Start the camera to scan equipment QR code labels, or use manual asset tag entry on the right.</p>
                </div>
              ) : null}
            </div>
            {cameraError ? (
              <Alert variant="danger" className="mt-3" title="Camera unavailable">{cameraError}</Alert>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {scanning ? (
                <Button variant="secondary" onClick={() => setScanning(false)}><CameraOff className="h-4 w-4" /> Stop camera</Button>
              ) : (
                <Button onClick={() => setScanning(true)}><Camera className="h-4 w-4" /> Start camera</Button>
              )}
              <Button variant="ghost" asChild><Link to="/equipment"><QrCode className="h-4 w-4" /> Browse labels</Link></Button>
            </div>
            <p className="mt-3 text-[11px] leading-4 text-foreground-muted">
              Camera scanning works best in good lighting. If your browser blocks camera access, use manual lookup instead.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Keyboard className="h-4 w-4 text-primary" /> Manual lookup</CardTitle>
            <CardDescription>Enter the asset tag printed on the equipment label.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitManual} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-code">Asset tag or QR content</Label>
                <Input id="asset-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="e.g. EQP-2026-0001 or EQP-2026-0001-A01" className="font-mono" />
              </div>
              <Button type="submit" disabled={lookupMutation.isPending} className="w-full">
                {lookupMutation.isPending ? <Search className="h-4 w-4 animate-pulse" /> : <Search className="h-4 w-4" />}
                Look up equipment
              </Button>
            </form>

            {history.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-muted">Recent scans</p>
                <div className="space-y-1.5">
                  {history.map((item) => (
                    <button
                      key={`${item.code}-${item.at}`}
                      onClick={() => { setManualCode(item.code); lookupMutation.mutate(item.code); }}
                      className={`flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:bg-card`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{item.name}</span>
                      <span className="font-mono text-[10px] text-foreground-muted">{item.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {equipment ? (
        <Card className="mt-5">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Equipment matched</CardTitle>
                <CardDescription>QR lookup result from the live inventory database.</CardDescription>
              </div>
              <StatusBadge status={equipment.status} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <EquipmentThumb category={equipment.category?.name} className="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-foreground">{equipment.name}</p>
                <p className="mt-0.5 text-[12px] text-foreground-muted">{equipment.asset_tag} · {equipment.category?.name ?? "Uncategorized"} · {equipment.laboratory?.name ?? "No laboratory"}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
                  <div><p className="text-[10px] uppercase tracking-wide text-foreground-muted">Available</p><p className="font-semibold text-foreground">{equipment.available_quantity} of {equipment.quantity}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-foreground-muted">Condition</p><p className="font-semibold capitalize text-foreground">{equipment.condition}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-foreground-muted">Next calibration</p><p className="font-semibold text-foreground">{formatDate(equipment.next_calibration_date)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-foreground-muted">Serial</p><p className="font-mono text-[11px] font-medium text-foreground">{equipment.serial_number ?? "—"}</p></div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Button asChild size="sm"><Link to={`/equipment/${equipment.id}`}>Open record</Link></Button>
                <Button asChild size="sm" variant="secondary"><Link to={`/borrow?equipment=${equipment.id}`}>Borrow</Link></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}