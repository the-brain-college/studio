import * as tus from 'tus-js-client'
import { supabase } from './supabase'

const SIX_MB = 6 * 1024 * 1024
export const MAX_FINAL_BYTES = 48 * 1024 * 1024 // free-tier bucket cap is 50 MB; keep margin

/**
 * Resumable upload of the final edit to the private bucket.
 * Supabase's TUS endpoint requires chunks of exactly 6 MB.
 */
export function uploadFinal(
  slug: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  const objectName = `finals/${slug}/final.mp4`
  return new Promise((resolve, reject) => {
    void (async () => {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) return reject(new Error('not signed in'))
      const upload = new tus.Upload(file, {
        endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 1500, 4000, 8000],
        chunkSize: SIX_MB,
        headers: { authorization: `Bearer ${token}`, 'x-upsert': 'true' },
        metadata: {
          bucketName: 'media',
          objectName,
          contentType: 'video/mp4',
          cacheControl: '3600',
        },
        onError: reject,
        onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
        onSuccess: () => resolve(objectName),
      })
      const prev = await upload.findPreviousUploads()
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })()
  })
}
