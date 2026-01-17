import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Webcam from 'react-webcam'

import { supabase } from '../lib/supabaseClient'

export const Route = createFileRoute('/')({
  component: HomeFlow,
})

type Step =
  | 'intro'
  | 'guide'
  | 'capture'
  | 'preview'
  | 'info'
  | 'confirm'
  | 'thanks'

type CaptureMode = 'record' | 'upload'

type VideoMeta = {
  duration: number
  width: number
  height: number
  isVertical: boolean
  isIdealVertical: boolean
}

type OutroSlide = {
  id: string
  title: string
  description: string
  helper?: string
  photoLabel: string
  path: string
}

const QUESTIONS = [
  'O que faz esse casal combinar tanto?',
  'Que conselho você daria pra essa nova fase?',
  'Qual lembrança mais bonita você tem com eles?',
  'O que você deseja pra esse futuro juntos?',
  'Se pudesse resumir eles em uma palavra, qual seria?',
  'O que você mais admira nessa relação?',
  'Qual momento deles te marcou mais?',
  'Que mensagem você deixaria pra eles verem no futuro?',
  'O que não pode faltar em um relacionamento como esse?',
  'Por que você acredita que eles formam um ótimo casal?',
]

const NOTE_SUGGESTIONS = [
  'Vocês são incríveis juntos',
  'Isso vai marcar uma nova fase',
  'Desejo toda a felicidade do mundo',
]

const MAX_SIZE_MB = 80
const MIN_DURATION = 30
const MAX_DURATION = 120
const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET ?? 'videos'

const OUTRO_SLIDES: OutroSlide[] = [
  {
    id: 'flight',
    title: 'Quer dar uma olhadinha onde tudo vai acontecer?',
    description: 'Um spoilerzinho...',
    helper: 'Foto 1 — substituir pela imagem do avião',
    photoLabel: 'Nós no avião',
    path: '/assets/aviao.jpeg',
  },
  {
    id: 'venue-tease-1',
    title: 'Um lugar especial esperando',
    description:
      'Um pedacinho do cenário que vai guardar esse momento importante.',
    helper: 'Foto 2 — spoiler do lugar especial',
    photoLabel: 'Spoiler do lugar',
    path: '/assets/spoiler-1.jpeg',
  },
  {
    id: 'venue-tease-2',
    title: 'Obrigado por fazer parte desse momento',
    description:
      'Seu vídeo será visto apenas no momento certo. Obrigado por guardar esse carinho com a gente.',
    helper: 'Foto 3 — spoiler do lugar especial',
    photoLabel: 'Outro spoiler do lugar',
    path: '/assets/spoiler-2.jpeg',
  },
]

function getSessionId() {
  const key = 'private_session_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const value = crypto.randomUUID()
  localStorage.setItem(key, value)
  return value
}

function getVideoMetadata(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      const width = video.videoWidth || 0
      const height = video.videoHeight || 0
      const isVertical = height >= width
      const ratio = width > 0 ? height / width : 0
      resolve({
        duration: video.duration || 0,
        width,
        height,
        isVertical,
        isIdealVertical: ratio >= 1.5,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler o vídeo.'))
    }
  })
}

function formatDuration(seconds: number) {
  if (!seconds || Number.isNaN(seconds)) return '0s'
  const rounded = Math.round(seconds)
  return `${rounded}s`
}

function HomeFlow() {
  const [step, setStep] = useState<Step>('intro')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('record')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [agreeHorizontal, setAgreeHorizontal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [outroIndex, setOutroIndex] = useState(0)
  const [showOutroVideo, setShowOutroVideo] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const webcamRef = useRef<Webcam | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  const [question, setQuestion] = useState(
    () => QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)],
  )
  const [suggestionIndex, setSuggestionIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setSuggestionIndex((prev) => (prev + 1) % NOTE_SUGGESTIONS.length)
    }, 4000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleChooseAction = (mode: CaptureMode) => {
    setCaptureMode(mode)
    setStep('guide')
  }

  const handleNewQuestion = () => {
    setQuestion((current) => {
      let next = current
      for (let i = 0; i < 5; i += 1) {
        const candidate =
          QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]
        if (candidate !== current) {
          next = candidate
          break
        }
      }
      return next
    })
  }

  const stopWebcam = () => {
    const stream = (webcamRef.current as any)?.stream as MediaStream | undefined
    stream?.getTracks().forEach((track) => track.stop())
    setIsCameraReady(false)
    setIsRecording(false)
  }

  const handleProcessFile = async (selected: File) => {
    if (!selected.type.startsWith('video/')) {
      setError('Envie apenas vídeos. Outros formatos não são aceitos.')
      return
    }

    const sizeMb = selected.size / (1024 * 1024)
    if (sizeMb > MAX_SIZE_MB) {
      setError(
        `O vídeo passou do limite de ${MAX_SIZE_MB}MB. Escolha um arquivo menor.`,
      )
      return
    }

    try {
      const data = await getVideoMetadata(selected)
      setMeta(data)
      setFile(selected)
      setAgreeHorizontal(false)
      setError(null)
      setStep('preview')
    } catch {
      setError('Não conseguimos preparar o vídeo. Tente novamente.')
    }
  }

  const openFilePicker = () => {
    inputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    await handleProcessFile(selected)
  }

  const startRecording = () => {
    const stream = (webcamRef.current as any)?.stream as MediaStream | undefined
    if (!stream) {
      setCameraError('Câmera não disponível no momento.')
      return
    }
    if (!window.MediaRecorder) {
      setCameraError('Gravação não suportada neste navegador.')
      return
    }

    try {
      recordedChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType,
        })
        const file = new File([blob], `gravacao-${Date.now()}.webm`, {
          type: blob.type,
        })
        setIsRecording(false)
        await handleProcessFile(file)
      }

      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
    } catch {
      setCameraError('Não conseguimos iniciar a gravação.')
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setIsRecording(false)
  }

  const resetCapture = () => {
    setFile(null)
    setMeta(null)
    setPreviewUrl(null)
    setAgreeHorizontal(false)
    setError(null)
    setStep('capture')
  }

  useEffect(() => {
    if (step === 'capture' && captureMode === 'record') {
      return
    }
    stopWebcam()
  }, [step, captureMode])

  useEffect(() => {
    if (step === 'thanks') {
      setOutroIndex(0)
      setShowOutroVideo(false)
    }
  }, [step])

  useEffect(() => {
    if (!isRecording) return
    const id = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [isRecording])

  const handleSubmit = async () => {
    if (!file || !meta) return
    if (!name.trim()) {
      setError('Digite seu nome para continuar.')
      setStep('info')
      return
    }
    if (!meta.isVertical && !agreeHorizontal) {
      setError('Confirme que deseja enviar o vídeo horizontal.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const sessionId = getSessionId()
      const createdAt = new Date().toISOString()
      const userAgent = navigator.userAgent

      const { data: contributor, error: contributorError } = await supabase
        .from('contributors')
        .insert({
          name: name.trim(),
          relation: relation.trim() || null,
          session_id: sessionId,
          created_at: createdAt,
          user_agent: userAgent,
        })
        .select('id')
        .single()

      if (contributorError || !contributor) {
        throw new Error('contributors')
      }

      const extension = file.name.split('.').pop() || 'mp4'
      const storagePath = `${sessionId}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        throw new Error('upload')
      }

      const { data: video, error: videoError } = await supabase
        .from('videos')
        .insert({
          contributor_id: contributor.id,
          storage_path: storagePath,
          duration: Math.round(meta.duration),
          is_vertical: meta.isVertical,
          has_note: Boolean(note.trim()),
          created_at: createdAt,
          selected: false,
          favorite: false,
        })
        .select('id')
        .single()

      if (videoError || !video) {
        throw new Error('videos')
      }

      if (note.trim()) {
        const { error: noteError } = await supabase.from('notes').insert({
          video_id: video.id,
          content: note.trim(),
          created_at: createdAt,
        })

        if (noteError) {
          throw new Error('notes')
        }
      }

      setStep('thanks')
    } catch {
      setError(
        'Tivemos um problema ao enviar. Tente novamente quando estiver pronto.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-5 pb-20 pt-8">
      <div className="landscape-warning">Gire o celular para ficar em pé</div>
      <div className="w-full max-w-md space-y-6">
        {step === 'intro' && (
          <IntroScreen
            onRecord={() => handleChooseAction('record')}
            onUpload={() => handleChooseAction('upload')}
          />
        )}

        {step === 'guide' && (
          <GuideScreen
            question={question}
            onNewQuestion={handleNewQuestion}
            onContinue={() => setStep('capture')}
          />
        )}

        {step === 'capture' && (
          <CaptureScreen
            captureMode={captureMode}
            isCameraReady={isCameraReady}
            isRecording={isRecording}
            cameraError={cameraError}
            recordingSeconds={recordingSeconds}
            onCameraReady={() => {
              setCameraError(null)
              setIsCameraReady(true)
            }}
            onCameraError={() => {
              setCameraError(
                'Não foi possível abrir a câmera. Tente novamente.',
              )
              setIsCameraReady(false)
            }}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onOpenFilePicker={openFilePicker}
            onBack={() => setStep('intro')}
            inputRef={inputRef}
            webcamRef={webcamRef}
            onFileChange={handleFileChange}
          />
        )}

        {step === 'preview' && file && meta && (
          <PreviewScreen
            file={file}
            meta={meta}
            previewUrl={previewUrl}
            note={note}
            showNote={showNote}
            suggestion={NOTE_SUGGESTIONS[suggestionIndex]}
            agreeHorizontal={agreeHorizontal}
            onToggleNote={() => setShowNote((prev) => !prev)}
            onNoteChange={setNote}
            onAgreeHorizontal={setAgreeHorizontal}
            onRetry={resetCapture}
            onContinue={() => setStep('info')}
          />
        )}

        {step === 'info' && (
          <InfoScreen
            name={name}
            relation={relation}
            onNameChange={setName}
            onRelationChange={setRelation}
            onContinue={() => setStep('confirm')}
            onBack={() => setStep('preview')}
          />
        )}

        {step === 'confirm' && (
          <ConfirmScreen
            name={name}
            relation={relation}
            isSubmitting={isSubmitting}
            onEdit={() => setStep('info')}
            onSubmit={handleSubmit}
          />
        )}

        {step === 'thanks' && (
          <ThanksScreen
            slides={OUTRO_SLIDES}
            activeIndex={outroIndex}
            showVideo={showOutroVideo}
            onPrev={() => setOutroIndex((prev) => Math.max(prev - 1, 0))}
            onNext={() =>
              setOutroIndex((prev) =>
                Math.min(prev + 1, OUTRO_SLIDES.length - 1),
              )
            }
            onFinish={() => setShowOutroVideo(true)}
            onCloseVideo={() => setShowOutroVideo(false)}
          />
        )}

        {error && <ErrorBanner message={error} />}

        {step === 'preview' && meta && (
          <p className="text-xs text-slate-500">
            Recomendado entre {MIN_DURATION}s e {MAX_DURATION}s.
          </p>
        )}
      </div>
    </main>
  )
}

function IntroScreen({
  onRecord,
  onUpload,
}: {
  onRecord: () => void
  onUpload: () => void
}) {
  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-white border border-rose-100 shadow-sm">
        <img
          src="/assets/wedding-couple.jpeg"
          alt="Casal feliz"
          className="w-full h-auto"
        />
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Mensagem especial em vídeo</h1>
        <p className="text-base text-slate-600">
          Grave um recado curto e carinhoso. Este registro será guardado com
          cuidado e só será visto no momento certo.
        </p>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Esse vídeo vai aparecer no pedido de noivado. É super importante que
          ela não descubra nada antes — por favor, mantenha em segredo.
        </div>
      </div>

      <div className="grid gap-3">
        <button
          className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold shadow-lg shadow-rose-500/20"
          onClick={onRecord}
        >
          🎥 Gravar vídeo agora
        </button>
        <button
          className="w-full rounded-2xl bg-rose-100 text-rose-700 py-4 text-lg font-semibold border border-rose-200"
          onClick={onUpload}
        >
          📤 Enviar vídeo da galeria
        </button>
      </div>
    </section>
  )
}

function GuideScreen({
  question,
  onNewQuestion,
  onContinue,
}: {
  question: string
  onNewQuestion: () => void
  onContinue: () => void
}) {
  return (
    <section className="space-y-5 h-full">
      <img
        src="/assets/foto-fofa.jpeg"
        alt="Foto fofa"
        className="w-full aspect-square object-cover rounded-full"
      />
      <div className="flex items-center gap-4">
        <div className="grow">
          <p className="text-sm text-slate-500">Para inspirar você:</p>
          <p className="text-lg font-semibold">{question}</p>
          <button
            className="mt-2 text-sm text-rose-500"
            onClick={onNewQuestion}
          >
            Ver outra ideia
          </button>
        </div>
      </div>
      <div className="mt-auto rounded-2xl border border-rose-100 bg-white p-4 text-slate-600 shadow-sm">
        <p className="text-sm">Grave com o celular em pé.</p>
        <p className="text-sm">Recomendado: entre 30s e 120s.</p>
      </div>
      <button
        className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold"
        onClick={onContinue}
      >
        Ok, vou gravar
      </button>
    </section>
  )
}

function CaptureScreen({
  captureMode,
  isCameraReady,
  isRecording,
  cameraError,
  onStartRecording,
  onStopRecording,
  onOpenFilePicker,
  onBack,
  inputRef,
  webcamRef,
  onFileChange,
  onCameraReady,
  onCameraError,
  recordingSeconds,
}: {
  captureMode: CaptureMode
  isCameraReady: boolean
  isRecording: boolean
  cameraError: string | null
  onStartRecording: () => void
  onStopRecording: () => void
  onOpenFilePicker: () => void
  onBack: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  webcamRef: React.RefObject<Webcam | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCameraReady: () => void
  onCameraError: () => void
  recordingSeconds: number
}) {
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-rose-100 bg-white p-6 text-center space-y-4 shadow-sm">
        <div className="mx-auto h-72 w-44 rounded-3xl border-2 border-dashed border-rose-200 flex items-center justify-center text-rose-300 overflow-hidden relative">
          {captureMode === 'record' ? (
            <Webcam
              ref={webcamRef}
              audio
              mirrored
              onUserMedia={onCameraReady}
              onUserMediaError={onCameraError}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'user' }}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>Vertical</span>
          )}
          {captureMode === 'record' && isRecording && (
            <div className="absolute top-2 right-2 rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white shadow">
              {formatTime(recordingSeconds)}
            </div>
          )}
        </div>
        {captureMode === 'record' && cameraError && (
          <p className="text-sm text-rose-600">{cameraError}</p>
        )}
      </div>

      {captureMode === 'record' ? (
        <button
          className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold"
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={!isCameraReady}
        >
          {isRecording ? 'Parar gravação' : 'Começar gravação'}
        </button>
      ) : (
        <button
          className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold"
          onClick={onOpenFilePicker}
        >
          Escolher vídeo
        </button>
      )}

      {captureMode === 'record' && !isCameraReady && (
        <button
          className="w-full rounded-2xl bg-rose-100 text-rose-700 py-3 text-base font-semibold"
          onClick={onOpenFilePicker}
        >
          Usar câmera do aparelho
        </button>
      )}
      <button
        className="w-full rounded-2xl border border-rose-200 py-3 text-rose-600"
        onClick={onBack}
      >
        Voltar
      </button>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="video/*"
        capture={captureMode === 'record' ? 'user' : undefined}
        onChange={onFileChange}
      />
    </section>
  )
}

function PreviewScreen({
  file,
  meta,
  previewUrl,
  note,
  showNote,
  suggestion,
  agreeHorizontal,
  onToggleNote,
  onNoteChange,
  onAgreeHorizontal,
  onRetry,
  onContinue,
}: {
  file: File
  meta: VideoMeta
  previewUrl: string | null
  note: string
  showNote: boolean
  suggestion: string
  agreeHorizontal: boolean
  onToggleNote: () => void
  onNoteChange: (value: string) => void
  onAgreeHorizontal: (value: boolean) => void
  onRetry: () => void
  onContinue: () => void
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl overflow-hidden border border-rose-100 bg-rose-100">
        {previewUrl && (
          <video
            src={previewUrl}
            controls
            playsInline
            className="w-full max-h-[70vh]"
          />
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700">
          <span>Duração</span>
          <span className="font-semibold">{formatDuration(meta.duration)}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700">
          <span>Formato</span>
          <span
            className={`font-semibold ${
              meta.isVertical && meta.isIdealVertical
                ? 'text-emerald-600'
                : meta.isVertical
                  ? 'text-amber-600'
                  : 'text-amber-600'
            }`}
          >
            {meta.isVertical && meta.isIdealVertical
              ? '✅ Vídeo vertical (ideal)'
              : meta.isVertical
                ? '⚠️ Vídeo vertical (ok)'
                : '⚠️ Pode não ficar bom no resultado final'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700">
          <span>Tamanho</span>
          <span className="font-semibold">
            {(file.size / (1024 * 1024)).toFixed(1)}MB
          </span>
        </div>
      </div>

      {(meta.duration < MIN_DURATION || meta.duration > MAX_DURATION) && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-800">
          Duração recomendada entre {MIN_DURATION}s e {MAX_DURATION}s.
        </div>
      )}

      {!meta.isVertical && (
        <label className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700">
          <input
            type="checkbox"
            checked={agreeHorizontal}
            onChange={(event) => onAgreeHorizontal(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-amber-300 bg-white"
          />
          Entendo que vídeos na horizontal podem não ficar bons no resultado
          final.
        </label>
      )}

      <div className="rounded-2xl border border-rose-100 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">Nota escrita (opcional)</p>
          <button className="text-sm text-rose-500" onClick={onToggleNote}>
            {showNote ? 'Ocultar' : 'Adicionar'}
          </button>
        </div>
        {showNote && (
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={`Se quiser, deixe uma frase curta… ${suggestion}`}
            className="w-full min-h-24 rounded-xl border border-rose-100 bg-rose-50/40 p-3 text-sm text-slate-700 placeholder:text-slate-400"
            maxLength={240}
          />
        )}
      </div>

      <div className="grid gap-3">
        <button
          className="w-full rounded-2xl bg-rose-100 text-rose-700 py-4 text-lg font-semibold"
          onClick={onRetry}
        >
          🔁 Gravar novamente
        </button>
        <button
          className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold"
          onClick={onContinue}
        >
          🚀 Enviar vídeo
        </button>
      </div>
    </section>
  )
}

function InfoScreen({
  name,
  relation,
  onNameChange,
  onRelationChange,
  onContinue,
  onBack,
}: {
  name: string
  relation: string
  onNameChange: (value: string) => void
  onRelationChange: (value: string) => void
  onContinue: () => void
  onBack: () => void
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Antes de enviar</h2>
        <p className="text-sm text-slate-600">
          Seu vídeo ficará identificado com seu nome e relação com o casal.
        </p>
      </div>
      <div className="space-y-3">
        <label className="text-sm text-slate-600">Nome</label>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Seu nome"
          className="w-full rounded-2xl border border-rose-200 bg-white p-4 text-base text-slate-900"
        />
        <label className="text-sm text-slate-600">Relação (opcional)</label>
        <input
          value={relation}
          onChange={(event) => onRelationChange(event.target.value)}
          placeholder="ex: amiga da faculdade"
          className="w-full rounded-2xl border border-rose-200 bg-white p-4 text-base text-slate-900"
        />
        <p className="text-xs text-slate-500">
          exemplos: amiga da faculdade · primo · colega de trabalho
        </p>
      </div>

      <button
        className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold"
        onClick={onContinue}
      >
        Continuar
      </button>
      <button
        className="w-full rounded-2xl border border-rose-200 py-3 text-rose-600"
        onClick={onBack}
      >
        Voltar
      </button>
    </section>
  )
}

function ConfirmScreen({
  name,
  relation,
  isSubmitting,
  onEdit,
  onSubmit,
}: {
  name: string
  relation: string
  isSubmitting: boolean
  onEdit: () => void
  onSubmit: () => void
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-rose-100 bg-white p-4 text-sm text-slate-700">
        Esse vídeo será identificado como:
        <strong className="block text-base text-slate-900 mt-2">
          {name || 'Seu nome'} — {relation || 'sem relação informada'}
        </strong>
      </div>
      <button
        className="w-full rounded-2xl bg-rose-100 text-rose-700 py-3"
        onClick={onEdit}
      >
        Editar informações
      </button>
      <button
        className="w-full rounded-2xl bg-rose-500 text-white py-4 text-lg font-semibold disabled:opacity-60"
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Enviando…' : 'Enviar vídeo'}
      </button>
    </section>
  )
}

function ThanksScreen({
  slides,
  activeIndex,
  showVideo,
  onPrev,
  onNext,
  onFinish,
}: {
  slides: OutroSlide[]
  activeIndex: number
  showVideo: boolean
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
  onCloseVideo: () => void
}) {
  const slide = slides[activeIndex]
  const isLast = activeIndex === slides.length - 1

  if (showVideo) {
    return (
      <section className="space-y-6">
        <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
          <video
            src="/assets/video_mary_rodando.mp4"
            controls
            playsInline
            className="w-full rounded-2xl bg-rose-50"
            autoPlay
          />
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm">
        <div className="h-72 w-full bg-linear-to-br from-rose-200 via-white to-pink-100 flex items-center justify-center">
          <img
            src={slide.path}
            alt={slide.title}
            className="object-cover h-full w-full"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-rose-100 bg-white p-5 space-y-3 shadow-sm">
        <h2 className="text-xl font-semibold">{slide.title}</h2>
        <p className="text-sm text-slate-600">{slide.description}</p>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="rounded-2xl border border-rose-200 px-4 py-2 text-rose-600 disabled:opacity-40"
          onClick={onPrev}
          disabled={activeIndex === 0}
        >
          Voltar
        </button>
        <div className="flex items-center gap-2">
          {slides.map((item, index) => (
            <span
              key={item.id}
              className={`h-2 w-2 rounded-full ${
                index === activeIndex ? 'bg-rose-500' : 'bg-rose-200'
              }`}
            />
          ))}
        </div>
        <button
          className="rounded-2xl bg-rose-500 px-5 py-2 text-white"
          onClick={isLast ? onFinish : onNext}
        >
          {isLast ? 'Fim' : 'Próximo'}
        </button>
      </div>
    </section>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      {message}
    </div>
  )
}
