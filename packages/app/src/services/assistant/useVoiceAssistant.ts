import { useEffect } from 'react'

import { useMic } from '../mic/useMic'
import { useAssistant } from './useAssistant'

export function useVoiceAssistant() {
  const processUserMessage = useAssistant((s) => s.processUserMessage)
  const transcript = useMic((s) => s.transcript)
  const isSupported = useMic((s) => s.isSupported)
  const isListening = useMic((s) => s.isListening)
  const init = useMic((s) => s.init)
  const start = useMic((s) => s.start)
  const stop = useMic((s) => s.stop)
  const clear = useMic((s) => s.clear)

  useEffect(() => {
    processUserMessage(transcript)
  }, [transcript, processUserMessage])

  return {
    isSupported,
    isListening,
    init,
    start,
    stop,
    clear,
  }
}
