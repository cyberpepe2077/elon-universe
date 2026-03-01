export function Aurora() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Blob 1 - Purple/Violet */}
      <div className="aurora-blob-1 absolute top-[20%] left-[15%] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] rounded-full bg-violet-400/30 dark:bg-violet-600/20 blur-[80px] opacity-40 dark:opacity-60" />
      {/* Blob 2 - Blue */}
      <div className="aurora-blob-2 absolute top-[10%] right-[10%] w-[35vw] h-[35vw] max-w-[500px] max-h-[500px] rounded-full bg-blue-400/30 dark:bg-blue-600/20 blur-[80px] opacity-40 dark:opacity-60" />
      {/* Blob 3 - Cyan/Teal */}
      <div className="aurora-blob-3 absolute bottom-[10%] left-[30%] w-[45vw] h-[45vw] max-w-[650px] max-h-[650px] rounded-full bg-cyan-400/20 dark:bg-cyan-600/15 blur-[100px] opacity-30 dark:opacity-50" />
    </div>
  )
}
