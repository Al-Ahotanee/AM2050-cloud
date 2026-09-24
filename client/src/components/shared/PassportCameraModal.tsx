/* AM2050 — Field Ledger Modernism: In-app camera viewfinder with verified 3:4 passport oval guide & auto-compression */
import { useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal, RefreshCw, Upload, X, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type PassportCameraModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  title?: string;
  subtitle?: string;
};

export function PassportCameraModal({
  isOpen,
  onClose,
  onCapture,
  title = "Capture Verified Passport Photograph",
  subtitle = "Align the subject's face within the oval. Ensure clear ambient light and neutral background.",
}: PassportCameraModalProps) {
  const [tab, setTab] = useState<"camera" | "upload">("camera");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Start / Stop camera stream
  useEffect(() => {
    if (!isOpen || tab !== "camera" || capturedPreview !== null) {
      stopCamera();
      return;
    }

    let isSubscribed = true;

    async function startCamera() {
      setStartingCamera(true);
      setCameraError(null);
      stopCamera();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API is not supported on this browser or device.");
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        if (!isSubscribed) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: unknown) {
        if (!isSubscribed) return;
        const msg = err instanceof Error ? err.message : "Unable to access device camera.";
        setCameraError(msg);
      } finally {
        if (isSubscribed) setStartingCamera(false);
      }
    }

    void startCamera();

    return () => {
      isSubscribed = false;
      stopCamera();
    };
  }, [isOpen, tab, facingMode, capturedPreview]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleClose = () => {
    stopCamera();
    setCapturedPreview(null);
    onClose();
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("Camera is not ready yet.");
      return;
    }

    // 3:4 target aspect ratio
    const targetAspect = 3 / 4;
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const currentAspect = vWidth / vHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = vWidth;
    let sourceHeight = vHeight;

    if (currentAspect > targetAspect) {
      // Wider than 3:4 -> crop sides
      sourceWidth = vHeight * targetAspect;
      sourceX = (vWidth - sourceWidth) / 2;
    } else {
      // Taller than 3:4 -> crop top/bottom
      sourceHeight = vWidth / targetAspect;
      sourceY = (vHeight - sourceHeight) / 2;
    }

    // Target passport dimensions: 600x800
    const outWidth = 600;
    const outHeight = 800;

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Flip horizontal if front camera
    if (facingMode === "user") {
      ctx.translate(outWidth, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outWidth, outHeight);

    // Compress as JPEG 0.85
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPreview(dataUrl);
    stopCamera();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Crop file to 3:4 aspect ratio
        const targetAspect = 3 / 4;
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        const aspect = width / height;

        let sx = 0;
        let sy = 0;
        let sWidth = width;
        let sHeight = height;

        if (aspect > targetAspect) {
          sWidth = height * targetAspect;
          sx = (width - sWidth) / 2;
        } else {
          sHeight = width / targetAspect;
          sy = (height - sHeight) / 2;
        }

        const outWidth = 600;
        const outHeight = 800;
        const canvas = document.createElement("canvas");
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outWidth, outHeight);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setCapturedPreview(dataUrl);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const confirmPhoto = () => {
    if (capturedPreview) {
      onCapture(capturedPreview);
      handleClose();
      toast.success("Passport photo attached and verified.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#082236]/65 p-4 backdrop-blur-sm">
      <div className="relative my-6 w-full max-w-lg overflow-hidden border border-[#cfd9d2] bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-[#d8e0da] bg-[#fbfaf6] p-4 sm:p-5">
          <div>
            <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-[#167a4c]">Photo Verification</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[#123148]">{title}</h2>
            <p className="mt-1 text-xs text-[#57707f]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="action-press grid size-8 place-items-center rounded border border-[#cfd9d2] bg-white text-[#57707f] hover:text-[#123148]"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tab switcher */}
        {!capturedPreview && (
          <div className="flex border-b border-[#e2e8e4] bg-[#f5f7f5] text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab("camera")}
              className={`flex flex-1 items-center justify-center gap-2 py-3 transition-colors ${
                tab === "camera"
                  ? "border-b-2 border-[#167a4c] bg-white text-[#167a4c]"
                  : "text-[#627683] hover:text-[#123148]"
              }`}
            >
              <Camera size={15} />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => setTab("upload")}
              className={`flex flex-1 items-center justify-center gap-2 py-3 transition-colors ${
                tab === "upload"
                  ? "border-b-2 border-[#167a4c] bg-white text-[#167a4c]"
                  : "text-[#627683] hover:text-[#123148]"
              }`}
            >
              <Upload size={15} />
              Upload Photo
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="p-4 sm:p-5">
          {capturedPreview ? (
            /* Review captured photo */
            <div className="flex flex-col items-center">
              <div className="relative aspect-[3/4] w-64 overflow-hidden border-2 border-[#167a4c] bg-[#123148] shadow-md rounded-md">
                <img src={capturedPreview} alt="Captured preview" className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded bg-[#167a4c]/90 px-2 py-1 text-[0.65rem] font-medium text-white">
                  Passport Photo
                </span>
              </div>
              <p className="mt-3 text-center text-xs text-[#57707f]">
                Photo confirmed. Ready for official student registration record.
              </p>
              <div className="mt-5 flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => setCapturedPreview(null)}
                  className="action-press flex flex-1 items-center justify-center gap-2 rounded border border-[#b9c9c0] bg-white py-2.5 text-sm font-semibold text-[#123148]"
                >
                  <RefreshCw size={16} />
                  Retake Photo
                </button>
                <button
                  type="button"
                  onClick={confirmPhoto}
                  className="action-press flex flex-1 items-center justify-center gap-2 rounded bg-[#167a4c] py-2.5 text-sm font-semibold text-white shadow-sm"
                >
                  <Check size={16} />
                  Use This Photo
                </button>
              </div>
            </div>
          ) : tab === "camera" ? (
            /* Camera Viewfinder */
            <div>
              {cameraError ? (
                <div className="grid min-h-[360px] place-items-center rounded border border-dashed border-[#ae3f32]/40 bg-[#fdf4f3] p-6 text-center">
                  <div>
                    <AlertCircle className="mx-auto text-[#ae3f32]" size={36} />
                    <p className="mt-3 font-semibold text-[#ae3f32]">Camera Access Required</p>
                    <p className="mt-1 text-xs text-[#6e2b24]">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => setTab("upload")}
                      className="action-press mt-4 inline-flex items-center gap-2 rounded bg-[#167a4c] px-4 py-2 text-xs font-semibold text-white"
                    >
                      <Upload size={14} /> Switch to Photo Upload
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="relative mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded bg-[#0b1c28] shadow-inner">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
                    />

                    {/* Passport Oval Guide Overlay */}
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 300 400"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <mask id="faceMask">
                          <rect width="300" height="400" fill="white" />
                          <ellipse cx="150" cy="170" rx="75" ry="98" fill="black" />
                        </mask>
                      </defs>
                      {/* Darkened outer mask */}
                      <rect width="300" height="400" fill="rgba(8, 34, 54, 0.45)" mask="url(#faceMask)" />
                      {/* Guide oval stroke */}
                      <ellipse
                        cx="150"
                        cy="170"
                        rx="75"
                        ry="98"
                        fill="none"
                        stroke="#82c99a"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />
                      {/* Shoulder lines */}
                      <path
                        d="M 65 370 Q 150 290 235 370"
                        fill="none"
                        stroke="rgba(130, 201, 154, 0.6)"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                      {/* Eye level line */}
                      <line
                        x1="120"
                        y1="150"
                        x2="180"
                        y2="150"
                        stroke="rgba(255, 255, 255, 0.5)"
                        strokeWidth="1.5"
                      />
                    </svg>

                    {/* Viewfinder badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-[0.62rem] font-medium text-white backdrop-blur-sm">
                      <span className="h-2 w-2 rounded-full bg-[#167a4c] animate-pulse" />
                      Camera Active
                    </div>

                    <button
                      type="button"
                      onClick={toggleCamera}
                      className="action-press absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                      aria-label="Flip camera"
                      title="Flip camera"
                    >
                      <FlipHorizontal size={16} />
                    </button>
                  </div>

                  <p className="mt-3 text-center text-xs text-[#57707f]">
                    Position face within the guide frame with shoulders visible.
                  </p>

                  {/* Shutter Button */}
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={takeSnapshot}
                      disabled={startingCamera}
                      className="action-press flex items-center gap-2 rounded-full bg-[#167a4c] px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <Camera size={19} />
                      Capture Photograph
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Upload Tab */
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <label className="grid min-h-48 w-full cursor-pointer place-items-center border-2 border-dashed border-[#b9c9c0] bg-[#fbfaf6] p-6 transition-colors hover:border-[#167a4c] hover:bg-[#f2f8f4]">
                <div>
                  <Upload className="mx-auto text-[#167a4c]" size={36} />
                  <p className="mt-3 text-sm font-semibold text-[#123148]">Choose photo from device</p>
                  <p className="mt-1 text-xs text-[#57707f]">
                    JPG, PNG, or WebP up to 5MB. Photo will be formatted automatically.
                  </p>
                </div>
                <input type="file" accept="image/*" className="sr-only" onChange={handleFileUpload} />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
