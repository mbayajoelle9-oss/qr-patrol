'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrImage({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    QRCode.toDataURL(value, { errorCorrectionLevel: 'H', margin: 1, width: size * 2 })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="animate-pulse rounded bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="QR Code" className={className} />;
}
