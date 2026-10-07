'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from './ui/button';
import { scanCanvas } from '../lib/document-reader';

export function QrCamera({
  onRead,
  disabled,
}: {
  onRead: (codes: string[]) => void;
  disabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const stop = () => {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
  };
  useEffect(() => {
    const halt = () => {
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
    const hidden = () => {
      if (document.hidden) {
        halt();
        setActive(false);
      }
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', halt);
    return () => {
      halt();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', halt);
    };
  }, []);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(
        'Kamera hier nicht verfügbar. Bitte ein QR-Foto auswählen; die Kamera benötigt HTTPS oder localhost.',
      );
      return;
    }
    const current = ++generation.current;
    setActive(true);
    setMessage('Kamerafreigabe abwarten …');
    const timeout = setTimeout(() => {
      if (generation.current !== current) return;
      stop();
      setMessage(
        'Kein QR-Code erkannt. Bitte erneut versuchen oder ein scharfes Foto auswählen.',
      );
    }, 30000);
    try {
      const source = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
      if (generation.current !== current) {
        source.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = source;
      video.current!.srcObject = source;
      await video.current!.play();
      if (generation.current !== current) return;
      setMessage('Halten Sie einen QR-Code ruhig in die Kamera.');
      const until = Date.now() + 30000;
      const canvas = document.createElement('canvas');
      try {
        while (generation.current === current && Date.now() < until) {
          const el = video.current;
          if (el && el.readyState >= 2) {
            const scale = Math.min(
              1,
              1000 / Math.max(el.videoWidth, el.videoHeight),
            );
            canvas.width = Math.max(1, Math.round(el.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(el.videoHeight * scale));
            canvas
              .getContext('2d')!
              .drawImage(el, 0, 0, canvas.width, canvas.height);
            const codes = await scanCanvas(canvas);
            if (generation.current !== current) return;
            if (codes.length) {
              stop();
              setMessage('QR-Code gelesen.');
              onRead(codes);
              return;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        if (generation.current === current) {
          stop();
          setMessage(
            'Kein QR-Code erkannt. Bitte erneut versuchen oder ein scharfes Foto auswählen.',
          );
        }
      } finally {
        canvas.width = canvas.height = 0;
      }
    } catch {
      if (generation.current !== current) return;
      stop();
      setMessage(
        'Kamera konnte nicht geöffnet werden. Prüfen Sie die Kamerafreigabe oder wählen Sie ein QR-Foto.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  return (
    <div className="camera-reader">
      <div className="actions">
        <Button variant="outline" disabled={disabled || active} onClick={start}>
          <Camera size={16} /> Kamera starten
        </Button>
        {active && (
          <Button variant="outline" onClick={stop}>
            Kamera stoppen
          </Button>
        )}
      </div>
      <video
        ref={video}
        hidden={!active}
        playsInline
        muted
        aria-label="Kameravorschau für QR-Code"
      />
      <p className="muted" role="status">
        {message}
      </p>
    </div>
  );
}
