import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

interface BlurTextProps {
  text: string
  className?: string
  delay?: number
}

export function BlurText({ text, className = '', delay = 0.05 }: BlurTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const words = text.split(' ')

  return (
    <span ref={ref} className={`inline-flex flex-wrap gap-x-[0.3em] ${className}`}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: 'blur(12px)', y: 20 }}
          animate={inView ? { opacity: 1, filter: 'blur(0px)', y: 0 } : {}}
          transition={{
            duration: 0.6,
            delay: i * delay,
            ease: [0.25, 0.4, 0.25, 1],
          }}
          className="inline-block"
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}
