import COS from "cos-wx-sdk-v5";
import Taro from "@tarojs/taro";
import { API_BASE } from "@/config";
import { request } from "@/services/request";

type ImageMime = "image/jpeg" | "image/png" | "image/webp";

interface UploadSignature {
  credentials: {
    tmp_secret_id: string;
    tmp_secret_key: string;
    session_token: string;
  };
  bucket: string;
  region: string;
  file_key: string;
  file_url: string;
  expired_time?: number | string;
  start_time?: number | string;
}
interface UploadCallback {
  id: string;
  cdn_url: string;
}

export async function uploadImage(
  filePath: string,
  fallbackType: ImageMime = "image/jpeg",
  category: "rides" | "avatars" | "route-comments" | "user-routes" = "rides",
): Promise<string> {
  const [fileInfo, fileType] = await Promise.all([
    readLocalFileInfo(filePath),
    resolveImageMimeType(filePath, fallbackType),
  ]);
  if (!("size" in fileInfo)) throw new Error("无法读取图片文件信息");
  if (fileInfo.size > 5 * 1024 * 1024) {
    throw new Error("图片不能超过 5MB，请选择较小的图片");
  }
  const signature = await request<UploadSignature>({
    method: "GET",
    url: `${API_BASE}/files/upload-signature`,
    params: { file_type: fileType, category },
  });
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = normalizeExpireTime(signature.expired_time, now + 1800);
  const cos = new COS({
    SimpleUploadMethod: "putObject",
    getAuthorization: (_options, callback) =>
      callback({
        TmpSecretId: signature.credentials.tmp_secret_id,
        TmpSecretKey: signature.credentials.tmp_secret_key,
        SecurityToken: signature.credentials.session_token,
        StartTime: normalizeStartTime(signature.start_time, now - 30),
        ExpiredTime: expiresAt,
      }),
  });
  await new Promise<void>((resolve, reject) =>
    cos.uploadFile(
      {
        Bucket: signature.bucket,
        Region: signature.region,
        Key: signature.file_key,
        FilePath: filePath,
        ContentType: fileType,
      },
      (error) => (error ? reject(new Error(uploadErrorMessage(error))) : resolve()),
    ),
  );
  const callback = await request<UploadCallback>({
    method: "POST",
    url: `${API_BASE}/files/callback`,
    data: {
      file_key: signature.file_key,
      file_url: signature.file_url,
      file_size: fileInfo.size,
      file_type: fileType,
    },
  });
  return callback.cdn_url;
}

/** FileSystemManager is callback-based; do not await its void return value. */
function readLocalFileInfo(filePath: string): Promise<{ size: number }> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().getFileInfo({
      filePath,
      success: (info) => {
        if (!Number.isFinite(info.size) || info.size < 0) {
          reject(new Error("无法读取图片文件信息"));
          return;
        }
        resolve({ size: info.size });
      },
      fail: () => reject(new Error("无法读取图片文件信息")),
    });
  });
}

/** 真机选择图片时不能假定格式为 JPEG；后端仅接受 jpg/png/webp。 */
async function resolveImageMimeType(
  filePath: string,
  fallbackType: ImageMime,
): Promise<ImageMime> {
  try {
    const info = await Taro.getImageInfo({ src: filePath });
    const type = info.type?.toLowerCase();
    if (type === "jpg" || type === "jpeg") return "image/jpeg";
    if (type === "png") return "image/png";
    if (type === "webp") return "image/webp";
  } catch {
    // 部分 Android 机型不会返回 type，继续根据临时文件扩展名判断。
  }
  const extension = filePath.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return fallbackType;
}

function normalizeExpireTime(value: number | string | undefined, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) && result > Math.floor(Date.now() / 1000)
    ? Math.floor(result)
    : fallback;
}

function normalizeStartTime(value: number | string | undefined, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? Math.floor(result) : fallback;
}

function uploadErrorMessage(error: unknown): string {
  const record = error as {
    error?: { Code?: string; Message?: string };
    errMsg?: string;
    statusCode?: number;
  };
  const code = record?.error?.Code;
  if (code === "AccessDenied") return "COS 上传权限不足，请检查临时密钥权限";
  if (code === "RequestTimeTooSkewed" || code === "RequestExpired") return "设备时间异常，请校准系统时间后重试";
  if (record?.statusCode === 403) return "COS 拒绝上传，请检查存储桶权限与小程序域名配置";
  return record?.error?.Message || record?.errMsg || "图片上传失败，请稍后重试";
}
