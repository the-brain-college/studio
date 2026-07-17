import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  AnalyticsSummary, Command, CommandType, Feedback, FeedbackKind, HeartbeatState,
  FactoryStatus, Order, ProductionGoals, RailwayChip, Schedule, Scene, Video,
} from './types'

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

export function useVideos() {
  return useQuery({
    queryKey: ['videos'],
    queryFn: () => must<Video[]>(supabase.from('videos').select('*').order('created_at', { ascending: false })),
  })
}

export function useVideo(slug: string) {
  return useQuery({
    queryKey: ['video', slug],
    queryFn: () => must<Video>(supabase.from('videos').select('*').eq('slug', slug).single()),
  })
}

export function useScenes(videoId: string | undefined) {
  return useQuery({
    queryKey: ['scenes', videoId],
    enabled: !!videoId,
    queryFn: () => must<Scene[]>(supabase.from('scenes').select('*').eq('video_id', videoId!).order('idx')),
  })
}

export function useSchedules(videoId?: string) {
  return useQuery({
    queryKey: ['schedules', videoId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('schedules').select('*').order('publish_at')
      if (videoId) q = q.eq('video_id', videoId)
      return must<Schedule[]>(q)
    },
  })
}

export function useAnalytics() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: () => must<AnalyticsSummary>(supabase.from('analytics_summary').select('*').single()),
  })
}

export function useAppState(key: string) {
  return useQuery({
    queryKey: ['app_state', key],
    queryFn: async () => {
      const { data } = await supabase.from('app_state').select('value').eq('key', key).maybeSingle()
      return (data?.value ?? null) as Record<string, unknown> | null
    },
  })
}

export function useRailwayFeed() {
  return useQuery({
    queryKey: ['railway-feed'],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<RailwayChip[]> => {
      const { data: sess } = await supabase.auth.getSession()
      const r = await fetch('/api/calendar-railway-feed', {
        headers: { Authorization: `Bearer ${sess.session?.access_token}` },
      })
      if (!r.ok) throw new Error(`railway feed ${r.status}`)
      return r.json()
    },
  })
}

export function useUpdateVideo(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Video>) => {
      const { error } = await supabase.from('videos').update(patch).eq('slug', slug)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['video', slug] })
      void qc.invalidateQueries({ queryKey: ['videos'] })
    },
  })
}

export async function logEvent(video_id: string | null, type: string, payload: Record<string, unknown> = {}) {
  await supabase.from('events').insert({ video_id, type, payload })
}

/* ————— mission control: orders, commands, factory state ————— */

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    refetchInterval: 30_000,
    queryFn: () => must<Order[]>(supabase.from('orders').select('*').order('created_at', { ascending: false })),
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Partial<Order>) => {
      const { data, error } = await supabase.from('orders').insert(row).select().single()
      if (error) throw new Error(error.message)
      return data as Order
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Order> }) => {
      const { error } = await supabase.from('orders').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useCommands(limit = 12) {
  return useQuery({
    queryKey: ['commands'],
    refetchInterval: 15_000,
    queryFn: () => must<Command[]>(supabase.from('commands').select('*').order('created_at', { ascending: false }).limit(limit)),
  })
}

export function useSendCommand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ type, payload }: { type: CommandType; payload?: Record<string, unknown> }) => {
      const { data, error } = await supabase.from('commands').insert({ type, payload: payload ?? {} }).select().single()
      if (error) throw new Error(error.message)
      return data as Command
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['commands'] }),
  })
}

/** PC pulse (heartbeat) + factory-brain status, refreshed together every 20s. */
export function useFactoryState() {
  return useQuery({
    queryKey: ['factory-state'],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_state').select('key,value')
        .in('key', ['heartbeat', 'factory_status', 'production_goals'])
      if (error) throw new Error(error.message)
      const m = new Map((data ?? []).map((r) => [r.key, r.value]))
      return {
        heartbeat: (m.get('heartbeat') ?? null) as HeartbeatState | null,
        status: (m.get('factory_status') ?? null) as FactoryStatus | null,
        goals: (m.get('production_goals') ?? null) as ProductionGoals | null,
      }
    },
  })
}

/** Upload a reference video for the copy pool: storage first, then the order row. */
export async function uploadReference(file: File, fields: { notes?: string; adaptation?: string; reference_url?: string }): Promise<Order> {
  const id = crypto.randomUUID()
  const path = `references/${id}.mp4`
  const { error: upErr } = await supabase.storage.from('media').upload(path, file, { contentType: 'video/mp4' })
  if (upErr) throw new Error(upErr.message)
  const { data, error } = await supabase.from('orders').insert({
    id, kind: 'copy', status: 'pool', reference_path: path,
    adaptation: fields.adaptation ?? 'bridge',
    notes: fields.notes || null, reference_url: fields.reference_url || null,
  }).select().single()
  if (error) throw new Error(error.message)
  return data as Order
}

/* ————— feedback: Filipe's verdicts are the factory's most important input ————— */

export function useAllFeedback() {
  return useQuery({
    queryKey: ['feedback'],
    queryFn: () => must<Feedback[]>(supabase.from('feedback').select('*').order('created_at', { ascending: false })),
  })
}

export function useAddFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { video_id: string; kind: FeedbackKind; stars?: number; comment?: string }) => {
      const { error } = await supabase.from('feedback').insert(row)
      if (error) throw new Error(error.message)
      await logEvent(row.video_id, `feedback_${row.kind}`, { stars: row.stars ?? null })
    },
    // optimistic: a Reject moves the card the instant the button is pressed
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ['feedback'] })
      const prev = qc.getQueryData<Feedback[]>(['feedback'])
      const ghost: Feedback = {
        id: -Date.now(), video_id: row.video_id, kind: row.kind, stars: row.stars ?? null,
        comment: row.comment ?? null, created_at: new Date().toISOString(), acknowledged_at: null, retracted_at: null,
      }
      qc.setQueryData<Feedback[]>(['feedback'], (old) => [ghost, ...(old ?? [])])
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['feedback'], ctx.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

/** Undo a rejection: retract every active reject on the video (audit trail stays). */
export function useUndoReject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (video: Video) => {
      const { error } = await supabase.from('feedback')
        .update({ retracted_at: new Date().toISOString() })
        .eq('video_id', video.id).eq('kind', 'reject').is('retracted_at', null)
      if (error) throw new Error(error.message)
      await logEvent(video.id, 'feedback_reject_undone')
    },
    onMutate: async (video) => {
      await qc.cancelQueries({ queryKey: ['feedback'] })
      const prev = qc.getQueryData<Feedback[]>(['feedback'])
      const now = new Date().toISOString()
      qc.setQueryData<Feedback[]>(['feedback'], (old) =>
        (old ?? []).map((f) => (f.video_id === video.id && f.kind === 'reject' && !f.retracted_at ? { ...f, retracted_at: now } : f)))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['feedback'], ctx.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

function patchVideoCaches(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Video>) {
  qc.setQueryData<Video[]>(['videos'], (old) => old?.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  qc.setQueriesData<Video>({ queryKey: ['video'] }, (old) => (old && old.id === id ? { ...old, ...patch } : old))
}

/** Optimistic verdict/state mutation on a video row (approve, move back to New, mark downloaded). */
function useVideoPatch(event: string, makePatch: (v: Video) => Partial<Video> | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (video: Video) => {
      const patch = makePatch(video)
      if (!patch) return
      const { error } = await supabase.from('videos').update(patch).eq('id', video.id)
      if (error) throw new Error(error.message)
      await logEvent(video.id, event)
    },
    onMutate: async (video) => {
      const patch = makePatch(video)
      if (!patch) return {}
      await qc.cancelQueries({ queryKey: ['videos'] })
      const prevList = qc.getQueryData<Video[]>(['videos'])
      patchVideoCaches(qc, video.id, patch)
      return { prevList }
    },
    onError: (_e, _v, ctx) => ctx?.prevList && qc.setQueryData(['videos'], ctx.prevList),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['videos'] })
      void qc.invalidateQueries({ queryKey: ['video'] })
    },
  })
}

/** Approve = the verdict. The download that follows is handled by the approve flow. */
export function useApproveVideo() {
  return useVideoPatch('approved', () => ({ approved_at: new Date().toISOString() }))
}

/** Revert an approval: the video goes back to New. The downloaded file fact is kept. */
export function useUnapproveVideo() {
  return useVideoPatch('approval_undone', () => ({ approved_at: null }))
}

/** Record that the scenes ZIP actually landed on Filipe's disk. */
export function useMarkDownloaded() {
  return useVideoPatch('scenes_downloaded', (v) => (v.downloaded_at ? null : { downloaded_at: new Date().toISOString() }))
}

/** Filipe scheduled the video in Meta Business Suite (FB+IG paired). Reversible. */
export function useMarkMetaScheduled() {
  return useVideoPatch('meta_scheduled', () => ({ meta_scheduled_at: new Date().toISOString() }))
}
export function useUnmarkMetaScheduled() {
  return useVideoPatch('meta_schedule_unmarked', () => ({ meta_scheduled_at: null }))
}
