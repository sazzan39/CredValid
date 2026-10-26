import * as React from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "./ui/button";

export function QRCodeView({ value, size = 168, className }: { value: string; size?: number; className?: string }) {
  const [svg, setSvg] = React.useState<string>("");
  React.useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#101828", light: "#ffffff" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR code linking to the verification page"
      // qrcode generates the SVG locally from our own string; nothing user-supplied is injected as markup.
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg", `<svg width="${size}" height="${size}" style="border-radius:12px;display:block"`) }}
    />
  );
}

export async function qrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, { margin: 1, width: 320, color: { dark: "#07080a", light: "#ffffff" } });
}

/** Camera QR scanner using jsQR. Works without a backend or extra permissions beyond the camera. */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [state, setState] = React.useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [error, setError] = React.useState("");
  const streamRef = React.useRef<MediaStream | null>(null);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("idle");
  }, []);

  React.useEffect(() => stop, [stop]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("This browser can't open the camera. Paste the link or ID instead.");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setState("scanning");
      const tick = () => {
        if (!streamRef.current) return;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          if (code?.data) {
            stop();
            onResult(code.data);
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setState("error");
      setError("Camera access was blocked. Allow it in your browser, or paste the link instead.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-subtle">
        <video ref={videoRef} className={state === "scanning" ? "size-full object-cover" : "hidden"} muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {state !== "scanning" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13.5px] text-muted">
            {state === "error" ? error : state === "starting" ? "Opening camera…" : "Point the camera at a CredValid QR code."}
          </div>
        )}
        {state === "scanning" && (
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-primary/70">
            <div className="h-1/2 border-b border-primary/60 bg-gradient-to-b from-transparent to-primary/10" style={{ animation: "scan 1.6s ease-in-out infinite alternate" }} />
          </div>
        )}
      </div>
      {state === "scanning" ? (
        <Button variant="secondary" size="sm" onClick={stop}>
          <CameraOff /> Stop camera
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={start}>
          <Camera /> {state === "error" ? "Try again" : "Start camera"}
        </Button>
      )}
    </div>
  );
}
