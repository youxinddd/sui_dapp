import { ref } from 'vue';

// ──────────────────────────────────────────────────────────────
//  硬编码配置，不存 localStorage，不需要 UI 配置面板
//  JWT    → https://app.pinata.cloud/developers/api-keys
//  GATEWAY → 专属 gateway 或公共 gateway
// ──────────────────────────────────────────────────────────────
const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI5MWQ3ZTU4ZS01NjYzLTRlYTEtOGZjNi02NzFlN2QwNDE5ZjMiLCJlbWFpbCI6InlvdXhpbmRkZEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiZmUwNzVjM2YwMmVhMjU1Yjg1NTQiLCJzY29wZWRLZXlTZWNyZXQiOiIzNjg0ZGU2MWNmMTI0NjYxMTcwYzMxYmI5OGQ4MGRhYmE5YmUxZjY5ZmNiNWE1OWJlMzhjZWM4ZTk3ZjM3OGFhIiwiZXhwIjoxNzg4NDEzOTQzfQ.LlBxpv4DYZFKPFHnL_UTe_cvtpLXKPCc4FrKRVXaEOQ';
const PINATA_GATEWAY = 'https://black-secret-spoonbill-589.mypinata.cloud';
const PINATA_UPLOAD_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// ── 压缩配置 ──────────────────────────────────────────────────
const COMPRESS_MAX_PX = 1280;       // 长边最大像素，超过才缩放
const COMPRESS_QUALITY = 0.82;      // 编码质量 0~1
const COMPRESS_TYPE = 'image/webp'; // 输出格式，不支持 webp 的浏览器自动降级 jpeg
// ─────────────────────────────────────────────────────────────

/**
 * 用 Canvas 压缩图片：等比缩放到 COMPRESS_MAX_PX 以内，再编码为 WebP。
 * GIF 跳过（压缩会丢失动画）；压缩后反而更大时保留原文件。
 */
async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > COMPRESS_MAX_PX || height > COMPRESS_MAX_PX) {
        if (width >= height) {
          height = Math.round((height / width) * COMPRESS_MAX_PX);
          width = COMPRESS_MAX_PX;
        } else {
          width = Math.round((width / height) * COMPRESS_MAX_PX);
          height = COMPRESS_MAX_PX;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          // 压缩后反而更大时保留原文件
          if (blob.size >= file.size) { resolve(file); return; }
          const ext = COMPRESS_TYPE === 'image/webp' ? 'webp' : 'jpg';
          const name = file.name.replace(/\.[^.]+$/, `.${ext}`);
          resolve(new File([blob], name, { type: blob.type }));
        },
        COMPRESS_TYPE,
        COMPRESS_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片读取失败'));
    };

    img.src = objectUrl;
  });
}

export function usePinata() {
  const uploading = ref(false);

  /**
   * 将各种格式的图片 URL 规范化为可直接展示的 HTTPS URL：
   *   ipfs://{CID}  → {PINATA_GATEWAY}/ipfs/{CID}
   *   http://...    → https://...
   *   其他          → 原样返回
   */
  function resolveUrl(raw: string): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('ipfs://')) {
      const cid = trimmed.slice(7);
      return `${PINATA_GATEWAY.replace(/\/$/, '')}/ipfs/${cid}`;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/^http:\/\//i, 'https://');
    }
    return trimmed;
  }

  /**
   * 上传文件到 Pinata（压缩后上传），返回 ipfs://{CID} 格式的地址。
   */
  async function uploadFile(file: File): Promise<string> {
    uploading.value = true;
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed);
      formData.append('pinataMetadata', JSON.stringify({ name: compressed.name }));
      formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const response = await fetch(PINATA_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PINATA_JWT}` },
        body: formData,
      });

      if (!response.ok) {
        let errText = '';
        try { errText = await response.text(); } catch { errText = response.statusText; }
        throw new Error(`Pinata 上传失败 (${response.status}): ${errText}`);
      }

      const result = await response.json();
      const cid: string = result.IpfsHash;
      if (!cid) throw new Error('Pinata 返回数据异常，缺少 IpfsHash');
      return `ipfs://${cid}`;
    } finally {
      uploading.value = false;
    }
  }

  return {
    uploading,
    resolveUrl,
    uploadFile,
  };
}
