// Device Fingerprinting
export async function getDeviceId() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'unknown-device';
  
  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial'";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f60";
  ctx.fillRect(125,1,62,20);
  ctx.fillStyle = "#069";
  ctx.fillText("OmniSearcher-AntiLeak", 2, 15);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.fillText("OmniSearcher-AntiLeak", 4, 17);
  
  const dataUrl = canvas.toDataURL();
  const b64 = dataUrl.split(',')[1];
  if (!b64) return 'unknown-device';
  let bin = '';
  try {
    bin = atob(b64);
  } catch (e) {
    console.warn('Fingerprint atob failed:', e);
    return 'dev-legacy-' + b64.substring(0, 8);
  }
  let crc = 0;
  for (let i = 0; i < bin.length; i++) {
    crc = (crc << 5) - crc + bin.charCodeAt(i);
    crc |= 0;
  }
  return `dev-${Math.abs(crc)}`;
}
