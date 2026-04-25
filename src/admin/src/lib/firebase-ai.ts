import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai'
import { app } from './firebase'

const ai = getAI(app, { backend: new GoogleAIBackend() })

export const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash-lite' })
