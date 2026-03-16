/**
 * videoFrames.ts
 * 浏览器端关键帧提取，零依赖。
 * 使用 HTMLVideoElement + Canvas API 从视频文件抽取均匀分布的关键帧，
 * 返回 base64 JPEG 字符串数组（不含 data:image/jpeg;base64, 前缀）。
 */

const DEFAULT_TARGET_WIDTH = 512;
const JPEG_QUALITY = 0.85;
const SEEK_TIMEOUT_MS = 8000;

function waitForSeek(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`视频跳转超时（目标时间 ${targetTime.toFixed(1)}s）`));
    }, SEEK_TIMEOUT_MS);

    const onSeeked = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = targetTime;
  });
}

function captureFrame(video: HTMLVideoElement, targetWidth: number): string {
  const aspectRatio = video.videoHeight / Math.max(1, video.videoWidth);
  const width = Math.min(targetWidth, video.videoWidth || targetWidth);
  const height = Math.round(width * aspectRatio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 Canvas 2D 上下文");

  ctx.drawImage(video, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  // 去掉 "data:image/jpeg;base64," 前缀
  return dataUrl.split(",")[1] ?? dataUrl;
}

/**
 * 从视频文件中均匀抽取 count 帧。
 * @param file       视频文件
 * @param count      抽取帧数（建议 FAST=5，DEEP=10）
 * @param targetWidth 输出图片宽度（默认 512px，保持宽高比）
 * @returns          base64 JPEG 字符串数组
 */
export async function extractKeyFrames(
  file: File,
  count: number,
  targetWidth = DEFAULT_TARGET_WIDTH
): Promise<string[]> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("视频元数据加载超时")), 15000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("视频文件加载失败，请确认格式正确"));
      };
      video.src = objectUrl;
    });

    const duration = video.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      throw new Error("无法读取视频时长");
    }

    const safeCount = Math.max(1, Math.min(count, 20));
    // 均匀分布采样点：避开开头和结尾各 5%
    const margin = duration * 0.05;
    const usableDuration = duration - margin * 2;
    const step = usableDuration / safeCount;

    const frames: string[] = [];
    for (let i = 0; i < safeCount; i++) {
      const targetTime = margin + step * i + step * 0.5;
      await waitForSeek(video, Math.min(targetTime, duration - 0.1));
      frames.push(captureFrame(video, targetWidth));
    }

    return frames;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
