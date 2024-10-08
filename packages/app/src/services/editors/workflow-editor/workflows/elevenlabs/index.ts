import {
  ClapWorkflow,
  ClapWorkflowEngine,
  ClapWorkflowCategory,
  ClapWorkflowProvider,
} from '@aitube/clap'
import {
  genericHeight2048,
  genericPrompt,
  genericWidth2048,
} from '../common/defaultValues'

// ------------------------------------------------------------------------------
// if a user is already using one of those workflows and you change its settings,
// they will have to reselect it in the UI for changes to be taken into account.
//
// -> we can create a ticket to fix this
// ------------------------------------------------------------------------------
export const elevenlabsWorkflows: ClapWorkflow[] = [
  {
    id: 'elevenlabs://v1/text-to-speech',
    label: 'Text-to-Speech V1',
    description: '',
    tags: ['TTS'],
    author: 'ElevenLabs',
    thumbnailUrl: '',
    nonCommercial: false,
    engine: ClapWorkflowEngine.REST_API,
    provider: ClapWorkflowProvider.ELEVENLABS,
    category: ClapWorkflowCategory.VOICE_GENERATION,
    data: 'v1/text-to-speech',
    schema: '',
    /**
     * Inputs of the workflow (this is used to build an UI for the workflow automatically)
     */
    inputFields: [genericPrompt],
    inputValues: {
      prompt: genericPrompt.defaultValue,
    },
  },
  {
    id: 'elevenlabs://v1/sound-generation',
    label: 'Sound Generation V1',
    description: '',
    tags: ['sound'],
    author: 'ElevenLabs',
    thumbnailUrl: '',
    nonCommercial: false,
    engine: ClapWorkflowEngine.REST_API,
    provider: ClapWorkflowProvider.ELEVENLABS,
    category: ClapWorkflowCategory.SOUND_GENERATION,
    data: 'v1/sound-generation',
    schema: '',
    /**
     * Inputs of the workflow (this is used to build an UI for the workflow automatically)
     */
    inputFields: [genericPrompt],
    inputValues: {
      [genericPrompt.id]: genericPrompt.defaultValue,
    },
  },
]
