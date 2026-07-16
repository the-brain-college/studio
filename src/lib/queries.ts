import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { AnalyticsSummary, RailwayChip, Schedule, Scene, Video } from './types'

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
