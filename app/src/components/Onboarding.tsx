import { useState } from 'react'
import { Button } from './Button'
import { openExternalUrl } from '@/lib/api'
import styles from './Onboarding.module.css'

interface OnboardingProps {
  onComplete: () => void
}

interface Slide {
  icon: React.ReactNode
  title: string
  description: string
  detail: string
  action?: {
    label: string
    href: string
  }
}

// SVG Icons
const MessageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M14 18h20M14 24h16M14 30h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M34 32l4 4v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const KitIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" fill="none" />
    {/* Mask */}
    <ellipse cx="24" cy="20" rx="10" ry="7" stroke="currentColor" strokeWidth="2" fill="none" />
    <circle cx="20" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="28" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    {/* Snorkel */}
    <path d="M34 14v8c0 2-1 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    {/* Fins */}
    <path d="M16 32l-3 6M24 32v6M32 32l3 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const CheckInIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" fill="none" />
    {/* Clipboard */}
    <rect x="16" y="14" width="16" height="22" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M20 14v-2a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
    {/* Checkmarks */}
    <path d="M19 22l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 30l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const slides: Slide[] = [
  {
    icon: <MessageIcon />,
    title: 'Connect first',
    description: "Drop us a message before you book. We'll confirm the best night, what to bring, and whether the session is drills, match play, or team practice.",
    detail: 'Regularly checking WhatsApp and Instagram to make your first session better.',
    action: {
      label: 'Message us',
      href: 'https://wwuwh.com/connect/',
    },
  },
  {
    icon: <KitIcon />,
    title: 'Get the right kit',
    description: "Mask, snorkel and fins are the basics. If you're new, we can often help with club kit for your first few sessions.",
    detail: '',
    action: {
      label: 'View Kit Guide',
      href: 'https://wwuwh.com/kit/',
    },
  },
  {
    icon: <CheckInIcon />,
    title: 'Register + turn up',
    description: "Once we've confirmed the best session for you, register attendance through our members app so we can plan numbers and keep sessions running smoothly.",
    detail: "On the night we'll introduce you, pair you with someone, and ease you into drills or game time based on experience. Safety and welcome come first.",
  },
]

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    } else {
      onComplete()
    }
  }

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  const handleSkip = () => {
    onComplete()
  }

  const slide = slides[currentSlide]
  const isLastSlide = currentSlide === slides.length - 1

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <img src="/assets/logo.png" alt="WWUWH" />
        </div>

        {/* Progress dots */}
        <div className={styles.progress}>
          {slides.map((_, index) => (
            <button
              key={index}
              className={`${styles.dot} ${index === currentSlide ? styles.dotActive : ''}`}
              onClick={() => setCurrentSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Slide content */}
        <div className={styles.slideContent}>
          <div className={styles.icon}>{slide.icon}</div>
          <h2 className={styles.title}>{slide.title}</h2>
          <p className={styles.description}>{slide.description}</p>
          {slide.detail && <p className={styles.detail}>{slide.detail}</p>}
          {slide.action && (
            <a
              href={slide.action.href}
              className={styles.actionLink}
              onClick={(e) => {
                e.preventDefault()
                openExternalUrl(slide.action!.href)
              }}
            >
              {slide.action.label}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={styles.actionIcon}
              >
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          )}
        </div>

        {/* Navigation */}
        <div className={styles.navigation}>
          {currentSlide > 0 ? (
            <Button variant="ghost" size="sm" onClick={handlePrev}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip
            </Button>
          )}
          <Button size="sm" onClick={handleNext}>
            {isLastSlide ? "Let's go" : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
