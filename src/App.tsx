import { motion } from 'framer-motion'

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-xl text-center space-y-4"
      >
        <p className="text-sm uppercase tracking-widest text-sky-400">
          Newsroom Intelligence Platform
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">InsightWire</h1>
        <p className="text-slate-400">
          Discover important stories before they become mainstream news.
          Dashboard, timelines, calendars, and alerts are coming online next.
        </p>
      </motion.div>
    </div>
  )
}

export default App
