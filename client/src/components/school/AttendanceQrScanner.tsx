/* AM2050 — Field Ledger Modernism: Rapid Continuous "Burst Scan" Attendance QR Scanner.
   Features:
   - Continuous camera stream for rapid morning roll-call (40–60 students in < 90s).
   - Acoustic & haptic feedback: green chime + vibration for verified attendance, amber buzz for duplicates.
   - Visual viewfinder flash overlay (green/amber/red).
   - Real-time HUD showing scanned count and recent verification roll.
   - Single-scan and Burst-mode toggles. */

import { ChangeEvent, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import {
  Camera,
  CheckCircle2,
  Clock,
  ImageUp,
  LoaderCircle,
  ScanLine,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { scanFeedback } from "@/utils/scanFeedback";

export interface ScanResult {
  success: boolean;
  isDuplicate?: boolean;
  childName?: string;
  message?: string;
}

interface Props {
  onToken: (token: string) => Promise<ScanResult | void>;
  disabled?: boolean;
  schoolName?: string;
  className?: string;
}

interface SessionEntry {
  id: string;
  token: string;
  childName: string;
  time: string;
  status: "verified" | "duplicate" | "error";
  message: string;
}

export default function AttendanceQrScanner({
  onToken,
  disabled = false,
  schoolName,
  className,
}: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);

  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [burstMode, setBurstMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [flashColor, setFlashColor] = useState<"idle" | "green" | "amber" | "red">("idle");
  const [sessionScans, setSessionScans] = useState<SessionEntry[]>([]);

  // Token cooldown tracker (prevents duplicate firing within 3 seconds)
  const recentTokensRef = useRef<Map<string, number>>(new Map());
  const scannedInSessionRef = useRef<Set<string>>(new Set());

  const close = () => {
    scanner.current?.stop();
    scanner.current?.destroy();
    scanner.current = null;
    setRunning(false);
    setOpen(false);
    setFlashColor("idle");
    recentTokensRef.current.clear();
    scannedInSessionRef.current.clear();
  };

  useEffect(() => {
    return () => {
      scanner.current?.destroy();
    };
  }, []);

  const triggerFlash = (color: "green" | "amber" | "red") => {
    setFlashColor(color);
    window.setTimeout(() => {
      setFlashColor("idle");
    }, 450);
  };

  const processToken = async (rawValue: string) => {
    const token = rawValue.trim();
    if (!token) return;

    const now = Date.now();
    const lastScanTime = recentTokensRef.current.get(token) || 0;

    // Cooldown check (ignore identical QR token if scanned less than 2.5 seconds ago)
    if (now - lastScanTime < 2500) {
      return;
    }
    recentTokensRef.current.set(token, now);

    // Check if child was already scanned in this active burst session
    if (scannedInSessionRef.current.has(token)) {
      scanFeedback.playDuplicate();
      triggerFlash("amber");
      toast.warning("Student card was already verified in this session.", {
        duration: 2000,
      });
      return;
    }

    if (processing) return;
    setProcessing(true);

    try {
      const result = await onToken(token);
      const isOk = result?.success !== false;
      const isDup = Boolean(result?.isDuplicate);
      const childName = result?.childName || "Enrolled Student";
      const timeStr = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      if (isDup) {
        scanFeedback.playDuplicate();
        triggerFlash("amber");
        scannedInSessionRef.current.add(token);
        setSessionScans((prev) => [
          {
            id: String(now),
            token,
            childName,
            time: timeStr,
            status: "duplicate",
            message: result?.message || "Already marked for today",
          },
          ...prev,
        ]);
      } else if (isOk) {
        scanFeedback.playSuccess();
        triggerFlash("green");
        scannedInSessionRef.current.add(token);
        setSessionScans((prev) => [
          {
            id: String(now),
            token,
            childName,
            time: timeStr,
            status: "verified",
            message: result?.message || "Attendance recorded",
          },
          ...prev,
        ]);

        if (!burstMode) {
          close();
          return;
        }
      } else {
        scanFeedback.playError();
        triggerFlash("red");
        toast.error(result?.message || "Failed to record attendance.");
      }
    } catch (err: unknown) {
      scanFeedback.playError();
      triggerFlash("red");
      const errMessage = err instanceof Error ? err.message : "Invalid AM2050 attendance card.";
      toast.error(errMessage);
    } finally {
      setProcessing(false);
    }
  };

  const startScanner = async () => {
    setOpen(true);
    setSessionScans([]);
    scannedInSessionRef.current.clear();
    recentTokensRef.current.clear();

    window.setTimeout(async () => {
      if (!video.current) return;
      try {
        const current = new QrScanner(
          video.current,
          (result) => void processToken(result.data),
          {
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 6,
          }
        );
        scanner.current = current;
        await current.start();
        setRunning(true);
      } catch {
        toast.error("Camera access was not available. You can upload a QR image instead.");
      }
    }, 60);
  };

  const uploadQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    try {
      const value = await QrScanner.scanImage(file);
      await processToken(value);
    } catch {
      scanFeedback.playError();
      toast.error("No readable AM2050 QR code was found in this image.");
    } finally {
      setProcessing(false);
      event.target.value = "";
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    scanFeedback.setSoundEnabled(next);
  };

  const verifiedCount = sessionScans.filter((s) => s.status === "verified").length;

  return (
    <section className="border-l-4 border-[#167a4c] bg-[#f2f8f4] p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <p className="coordinate-label text-[#0e5a38]">Rapid Daily Roll-Call</p>
            <span className="inline-flex items-center gap-1 rounded bg-[#d2ebd9] px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase text-[#0e5a38]">
              <Zap size={10} className="fill-current" /> Burst Ready
            </span>
          </div>
          <p className="mt-1 text-sm text-[#456150]">
            Continuous live camera scan for 40–60 learners in under 90 seconds. Instant acoustic chime and visual verification.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label
            className={`action-press inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#b4cfbe] bg-white px-3 text-xs font-semibold text-[#183a2d] shadow-sm hover:bg-[#eaf4ed] ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <ImageUp size={15} />
            <span>Upload QR</span>
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={uploadQr}
              disabled={disabled || processing}
            />
          </label>
          <button
            type="button"
            onClick={() => void startScanner()}
            disabled={disabled || processing}
            className="action-press inline-flex h-9 items-center gap-2 rounded-md bg-[#167a4c] px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-[#12643e]"
          >
            <Camera size={15} />
            <span>Open Burst Scanner</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] grid overflow-y-auto bg-[#082236]/80 p-3 sm:place-items-center">
          <div className="my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-[#fbfaf6] shadow-2xl">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[#d8e0da] bg-white px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-[#e7f4eb] text-[#167a4c]">
                  <Zap size={18} />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-[#123148]">
                    Continuous Attendance Scanner
                  </h2>
                  <p className="text-xs text-[#617985]">
                    {schoolName || "Classroom Roll-Call"}{" "}
                    {className ? `· ${className}` : ""}
                  </p>
                </div>
              </div>

              {/* Mode & Sound Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSound}
                  title={soundEnabled ? "Mute audio beeps" : "Enable audio beeps"}
                  className="rounded-md border border-[#d8e0da] bg-[#f5f7f4] p-2 text-[#57707f] hover:bg-[#e8ece7]"
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setBurstMode(!burstMode)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-mono text-[0.65rem] font-bold uppercase transition-colors ${
                    burstMode
                      ? "bg-[#167a4c] text-white"
                      : "border border-[#b9c9c0] bg-white text-[#57707f]"
                  }`}
                >
                  <Zap size={12} className={burstMode ? "fill-current" : ""} />
                  {burstMode ? "Burst Mode: Active" : "Single Scan"}
                </button>
                <button
                  onClick={close}
                  aria-label="Close scanner"
                  className="rounded-md p-1.5 text-[#57707f] hover:bg-[#f0f4f1]"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* Video Viewfinder with Visual Flash Overlay */}
            <div className="relative bg-black">
              <video
                ref={video}
                className="mx-auto max-h-[50vh] min-h-[260px] w-full object-cover"
                muted
                playsInline
              />

              {/* Visual Flash Feedback Pulse */}
              {flashColor === "green" && (
                <div className="pointer-events-none absolute inset-0 animate-pulse border-8 border-[#167a4c] bg-[#167a4c]/25 backdrop-blur-[1px]" />
              )}
              {flashColor === "amber" && (
                <div className="pointer-events-none absolute inset-0 animate-pulse border-8 border-[#c88b25] bg-[#c88b25]/25 backdrop-blur-[1px]" />
              )}
              {flashColor === "red" && (
                <div className="pointer-events-none absolute inset-0 animate-pulse border-8 border-[#b84b3f] bg-[#b84b3f]/25 backdrop-blur-[1px]" />
              )}

              {/* Viewfinder Overlay Crosshairs */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative size-48 rounded-xl border-2 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] sm:size-56">
                  <div className="absolute -left-1 -top-1 size-5 border-l-4 border-t-4 border-[#34d399]" />
                  <div className="absolute -right-1 -top-1 size-5 border-r-4 border-t-4 border-[#34d399]" />
                  <div className="absolute -bottom-1 -left-1 size-5 border-b-4 border-l-4 border-[#34d399]" />
                  <div className="absolute -bottom-1 -right-1 size-5 border-b-4 border-r-4 border-[#34d399]" />
                </div>
              </div>

              {/* Floating Verified Counter Badge */}
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-[#123148]/85 px-3 py-1 text-xs font-semibold text-white shadow-md backdrop-blur-sm">
                  <CheckCircle2 size={14} className="text-[#34d399]" />
                  <span>
                    Verified: <strong>{verifiedCount}</strong>
                  </span>
                </div>
                {processing && (
                  <div className="flex items-center gap-1 rounded-full bg-[#123148]/85 px-2.5 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm">
                    <LoaderCircle size={13} className="animate-spin text-[#6ee7b7]" />
                    <span>Confirming…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Session Verification HUD */}
            <div className="flex flex-col border-t border-[#d8e0da] bg-[#fbfaf6] p-4">
              <div className="flex items-center justify-between text-xs text-[#57707f]">
                <div className="flex items-center gap-1.5 font-medium">
                  {running ? (
                    <>
                      <span className="size-2 rounded-full bg-[#167a4c] animate-pulse" />
                      <span>Camera scanning continuously · Hold cards in front of lens</span>
                    </>
                  ) : (
                    <span>Initializing camera sensor…</span>
                  )}
                </div>
                <span className="font-mono text-[0.65rem] uppercase">
                  {sessionScans.length} card{sessionScans.length === 1 ? "" : "s"} read
                </span>
              </div>

              {/* Recent Verification Roll (Last 3 Scans) */}
              {sessionScans.length > 0 && (
                <div className="mt-3 max-h-28 space-y-1.5 overflow-y-auto rounded border border-[#d8e0da] bg-white p-2">
                  {sessionScans.slice(0, 4).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {entry.status === "verified" ? (
                          <CheckCircle2 size={14} className="shrink-0 text-[#167a4c]" />
                        ) : (
                          <Clock size={14} className="shrink-0 text-[#c88b25]" />
                        )}
                        <span className="font-semibold text-[#123148] truncate">
                          {entry.childName}
                        </span>
                        <span className="text-[0.68rem] text-[#718592] truncate">
                          {entry.message}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[0.62rem] text-[#718592]">
                        {entry.time}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Actions */}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[0.72rem] text-[#718592]">
                  Audio chime & haptic feedback will sound on every valid card.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="action-press inline-flex h-9 items-center gap-2 rounded-md bg-[#167a4c] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#12643e]"
                >
                  <CheckCircle2 size={15} />
                  <span>
                    Finish Session ({verifiedCount} Verified)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
