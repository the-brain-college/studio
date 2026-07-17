export type VideoStatus = 'ingested' | 'edited' | 'scheduled' | 'published'
export type ScheduleState = 'pending' | 'scheduled' | 'published' | 'failed' | 'canceled'
export type Platform = 'youtube' | 'facebook' | 'instagram'

export interface Video {
  id: string
  slug: string
  title: string | null
  description: string | null
  story: string | null
  mode: string | null
  backlog_ref: string | null
  made_date: string | null
  scene_count: number
  status: VideoStatus
  local_master_path: string | null
  thumb_path: string | null
  final_path: string | null
  final_size_bytes: number | null
  final_uploaded_at: string | null
  scenes_purged_at: string | null
  final_purged_at: string | null
  preview_path: string | null
  downloaded_at: string | null
  qc: { pass?: number; fail?: number; failure_classes?: Record<string, number>; notes?: string } | null
  created_at: string
  updated_at: string
}

export type FeedbackKind = 'reject' | 'rating' | 'note'

export interface Feedback {
  id: number
  video_id: string
  kind: FeedbackKind
  stars: number | null
  comment: string | null
  created_at: string
  acknowledged_at: string | null
}

export interface Scene {
  id: string
  video_id: string
  idx: number
  kind: string | null
  spoken: string | null
  frame_prompt: string | null
  veo_prompt: string | null
  storage_path: string | null
  size_bytes: number | null
  qc_verdict: string | null
  qc_failure_class: string | null
}

export interface Schedule {
  id: string
  video_id: string
  platform: Platform
  slot_date: string
  slot_index: 0 | 1 | 2
  publish_at: string
  youtube_video_id: string | null
  state: ScheduleState
  created_at: string
  confirmed_at: string | null
}

export interface RailwayChip {
  platform: Platform
  publish_at: string
  title: string | null
  caption: string | null
  source: 'railway'
  media_url: string | null
  state: string
}

export interface AnalyticsSummary {
  videos_total: number
  ingested: number
  edited: number
  scheduled: number
  published: number
  videos_30d: number
  queue_depth: number
}

export const STATUS_LABEL: Record<VideoStatus, string> = {
  ingested: 'Ready to edit',
  edited: 'Final uploaded',
  scheduled: 'Scheduled',
  published: 'Published',
}

export const STATUS_TONE: Record<VideoStatus, 'info' | 'warn' | 'accent' | 'ok'> = {
  ingested: 'info',
  edited: 'warn',
  scheduled: 'accent',
  published: 'ok',
}
