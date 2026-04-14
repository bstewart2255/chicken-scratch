import { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

interface Props {
  url: string;
  size?: number;
}

export function QRCode({ url, size = 256 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });
  }, [url, size]);

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas ref={canvasRef} />
      <p style={{ fontSize: 12, color: '#999', marginTop: 4, wordBreak: 'break-all' }}>
        {url}
      </p>
    </div>
  );
}
