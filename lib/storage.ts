import { createAdminClient } from './supabase'

const BUCKET_NAME = 'campaign-scenes'

// Initialize storage bucket (run this once in Supabase dashboard or via migration)
export async function ensureBucketExists() {
  const supabase = createAdminClient()
  
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === BUCKET_NAME)
  
  if (!exists) {
    await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    })
  }
}

// Upload scene image
export async function uploadSceneImage(
  campaignId: string,
  file: File | Buffer,
  fileName: string,
  contentType: string
) {
  const supabase = createAdminClient()
  const path = `${campaignId}/${Date.now()}-${fileName}`
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType,
      upsert: false,
      cacheControl: '31536000' // 1 year
    })
  
  if (error) throw error
  return { path: data.path, fullPath: `${BUCKET_NAME}/${data.path}` }
}

// Get scene image URL (signed URL for private bucket)
export async function getSceneImageUrl(path: string, expiresIn: number = 3600) {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn)
  
  if (error) throw error
  return data.signedUrl
}

// Get scene image as stream (for direct serving)
export async function getSceneImageStream(path: string) {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(path)
  
  if (error) throw error
  return data
}

// Delete scene image
export async function deleteSceneImage(path: string) {
  const supabase = createAdminClient()
  
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([path])
  
  if (error) throw error
}

// Get public URL (if bucket is public)
export function getPublicUrl(path: string) {
  const supabase = createAdminClient()
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
  return data.publicUrl
}
