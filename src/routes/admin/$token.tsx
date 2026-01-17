import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '../../lib/supabaseClient'

const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET ?? 'videos'
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN

const TAGS = [
  'Emocionante',
  'Engraçado',
  'Curto',
  'Forte abertura',
  'Forte fechamento',
]

type AdminVideo = any

async function fetchAdminVideos() {
  const { data, error } = await (supabase as any)
    .from('videos')
    .select(
      'id, storage_path, duration, is_vertical, has_note, created_at, selected, favorite, tags, order_index, contributor:contributors(name, relation)',
    )
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error || !data) {
    throw new Error('videos')
  }

  const paths = (data as AdminVideo[])
    .map((item) => item.storage_path)
    .filter(Boolean)
  const { data: signed } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, 60 * 60)

  const urlMap = new Map<string, string>()
  signed?.forEach((item) => {
    if (item?.path && item?.signedUrl) {
      urlMap.set(item.path, item.signedUrl)
    }
  })

  return (data as AdminVideo[]).map((item) => ({
    ...item,
    signedUrl: urlMap.get(item.storage_path) ?? null,
  }))
}

export const Route = createFileRoute('/admin/$token')({
  beforeLoad: ({ params }) => {
    if (!ADMIN_TOKEN || params.token !== ADMIN_TOKEN) {
      throw notFound()
    }
  },
  component: AdminDashboard,
})

function AdminDashboard() {
  const {
    data: unsafeData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['admin-videos'],
    queryFn: fetchAdminVideos,
  })
  const data: AdminVideo[] = unsafeData ?? []

  const [activeTag, setActiveTag] = useState<string>('Todos')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [activeVideo, setActiveVideo] = useState<(typeof data)[0] | null>(null)

  const orderedVideos = useMemo(() => {
    const withOrder = data.filter(
      (video: AdminVideo) => video.order_index !== null,
    )
    const withoutOrder = data.filter(
      (video: AdminVideo) => video.order_index == null,
    )
    return [...withOrder, ...withoutOrder]
  }, [data])

  const filteredVideos = useMemo(() => {
    if (activeTag === 'Todos') return orderedVideos
    return orderedVideos.filter((video) =>
      (video.tags ?? []).includes(activeTag),
    )
  }, [activeTag, orderedVideos])

  const totals = useMemo(() => {
    const total = data?.length ?? 0
    const withNote =
      data?.filter((video: AdminVideo) => video.has_note).length ?? 0
    return { total, withNote }
  }, [data])

  const updateTag = async (video: (typeof data)[0], tag: string) => {
    const current = new Set(video.tags ?? [])
    if (current.has(tag)) current.delete(tag)
    else current.add(tag)
    await (supabase as any)
      .from('videos')
      .update({ tags: Array.from(current) })
      .eq('id', video.id)
    await refetch()
  }

  const updateOrder = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) return
    const base = orderedVideos.map((video) => video.id)
    const next = base.filter((id) => id !== draggingId)
    const targetIndex = next.indexOf(targetId)
    next.splice(targetIndex, 0, draggingId)

    await Promise.all(
      next.map((id, index) =>
        (supabase as any)
          .from('videos')
          .update({ order_index: index })
          .eq('id', id),
      ),
    )
    await refetch()
  }

  const toggleFlag = async (
    video: (typeof data)[0],
    field: 'favorite' | 'selected',
  ) => {
    await supabase
      .from('videos')
      .update({ [field]: !video[field] })
      .eq('id', video.id)
    await refetch()
  }

  const handleDelete = async (video: (typeof data)[0]) => {
    const confirmed = window.confirm(
      'Tem certeza que deseja excluir este vídeo? Essa ação é permanente.',
    )
    if (!confirmed) return

    if (video.storage_path) {
      await supabase.storage.from(STORAGE_BUCKET).remove([video.storage_path])
    }

    await supabase.from('videos').delete().eq('id', video.id)

    setActiveVideo(null)
    await refetch()
  }

  return (
    <main className="min-h-screen bg-rose-50 text-slate-900 px-5 pb-16 pt-10">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Painel reservado</h1>
          <p className="text-sm text-slate-600">
            Use este espaço para revisar os vídeos recebidos.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Total de vídeos</p>
            <p className="text-2xl font-semibold">{totals.total}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Total com nota escrita</p>
            <p className="text-2xl font-semibold">{totals.withNote}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Status geral</p>
            <p className="text-2xl font-semibold">Em andamento</p>
          </div>
        </section>

        <section className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Linha do tempo</h2>
          <div className="space-y-2 text-sm text-slate-600">
            {isLoading && <p>Carregando envios...</p>}
            {data?.slice(0, 6).map((video: AdminVideo) => {
              const contributor = video.contributor
              return (
                <div
                  key={video.id}
                  className="flex items-center justify-between"
                >
                  <span>{contributor?.name ?? 'Sem nome'}</span>
                  <span>
                    {video.created_at
                      ? new Date(video.created_at).toLocaleString('pt-BR')
                      : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full px-4 py-2 text-sm ${
                activeTag === 'Todos'
                  ? 'bg-rose-500 text-white'
                  : 'bg-rose-100 text-rose-700'
              }`}
              onClick={() => setActiveTag('Todos')}
            >
              Todos
            </button>
            {TAGS.map((tag) => (
              <button
                key={tag}
                className={`rounded-full px-4 py-2 text-sm ${
                  activeTag === tag
                    ? 'bg-rose-500 text-white'
                    : 'bg-rose-100 text-rose-700'
                }`}
                onClick={() => setActiveTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {isError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                Não foi possível carregar os vídeos. Tente novamente.
              </div>
            )}

            {filteredVideos.map((video: AdminVideo) => {
              const contributor = Array.isArray(video.contributor)
                ? video.contributor[0]
                : video.contributor

              return (
                <div
                  key={video.id}
                  draggable
                  onDragStart={() => setDraggingId(video.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => updateOrder(video.id)}
                  className="rounded-2xl border border-rose-100 bg-white p-4 space-y-3 shadow-sm"
                >
                  <div className="flex gap-4">
                    <div className="h-28 w-20 rounded-xl bg-rose-100 overflow-hidden">
                      {video.signedUrl ? (
                        <video
                          src={video.signedUrl}
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-rose-50" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-base font-semibold">
                            {contributor?.name ?? 'Sem nome'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {contributor?.relation ?? 'Relação não informada'}
                          </p>
                        </div>
                        <div className="text-xs text-slate-500">
                          {video.created_at
                            ? new Date(video.created_at).toLocaleDateString(
                                'pt-BR',
                              )
                            : '-'}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                          🎥 {video.is_vertical ? 'Vertical' : 'Horizontal'}
                        </span>
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                          📝 {video.has_note ? 'Tem nota' : 'Sem nota'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {TAGS.map((tag) => (
                      <button
                        key={tag}
                        className={`rounded-full px-3 py-1 text-xs ${
                          (video.tags ?? []).includes(tag)
                            ? 'bg-rose-500 text-white'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                        onClick={() => updateTag(video, tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    <button
                      className="rounded-xl bg-rose-100 py-2 text-sm text-rose-700"
                      onClick={() => toggleFlag(video, 'favorite')}
                    >
                      {video.favorite ? '★ Favorito' : '☆ Favorito'}
                    </button>
                    <button
                      className="rounded-xl bg-rose-100 py-2 text-sm text-rose-700"
                      onClick={() => toggleFlag(video, 'selected')}
                    >
                      {video.selected ? '✔ Selecionado' : 'Marcar para edição'}
                    </button>
                    <button
                      className="rounded-xl bg-rose-100 py-2 text-sm text-rose-700 disabled:opacity-50"
                      onClick={() => setActiveVideo(video)}
                      disabled={!video.signedUrl}
                    >
                      Ver vídeo
                    </button>
                    <button
                      className="rounded-xl bg-rose-50 py-2 text-sm text-rose-700 border border-rose-200"
                      onClick={() => handleDelete(video)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}

            {!isLoading && filteredVideos.length === 0 && (
              <p className="text-sm text-slate-500">Nenhum vídeo por aqui.</p>
            )}
          </div>
        </section>
      </div>
      {activeVideo?.signedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Pré-visualização</h3>
              <button
                className="text-rose-500"
                onClick={() => setActiveVideo(null)}
              >
                Fechar
              </button>
            </div>
            <video
              src={activeVideo.signedUrl}
              controls
              playsInline
              className="w-full rounded-2xl bg-rose-50"
            />
          </div>
        </div>
      )}
    </main>
  )
}
