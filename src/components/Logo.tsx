export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <path d="M9 9h6v6H9zM17 9h6v6h-6zM9 17h6v6H9z" className="fill-bg" />
      <path d="M17 17h6v6h-6z" className="fill-accent" />
    </svg>
  )
}
