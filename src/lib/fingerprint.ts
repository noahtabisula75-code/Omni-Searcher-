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
  
  const b64 = canvas.toDataURL().replace("data:image/png;base64,","");
  let bin = atob(b64);
  let crc = 0;
  for (let i = 0; i < bin.length; i++) {
    crc = (crc << 5) - crc + bin.charCodeAt(i);
    crc |= 0;
  }
  return `dev-${Math.abs(crc)}`;
}
