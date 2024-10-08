'use client'

import {
  ClapAssetSource,
  ClapEntity,
  ClapImageRatio,
  ClapMeta,
  ClapOutputType,
  ClapProject,
  ClapSegment,
  ClapSegmentCategory,
  ClapSegmentStatus,
  getClapAssetSourceType,
  newClap,
  newSegment,
  parseClap,
  serializeClap,
  UUID,
} from '@aitube/clap'
import {
  TimelineStore,
  useTimeline,
  TimelineSegment,
  removeFinalVideosAndConvertToTimelineSegments,
  getFinalVideo,
  DEFAULT_DURATION_IN_MS_PER_STEP,
  clapSegmentToTimelineSegment,
} from '@aitube/timeline'
import { ParseScriptProgressUpdate, parseScriptToClap } from '@aitube/broadway'
import {
  IOStore,
  ScriptEditorStore,
  TaskCategory,
  TaskVisibility,
} from '@aitube/clapper-services'
import { create } from 'zustand'
import * as fflate from 'fflate'

import { getDefaultIOState } from './getDefaultIOState'

import { blobToBase64DataUri } from '@/lib/utils/blobToBase64DataUri'
import { parseFileIntoSegments } from './parseFileIntoSegments'
import { useTasks } from '@/components/tasks/useTasks'

import { parseFileName } from './parseFileName'
import { useRenderer } from '../renderer'
import { base64DataUriToUint8Array } from '@/lib/utils/base64DataUriToUint8Array'

import { formatDuration } from '@/lib/utils/formatDuration'
import {
  ExportableSegment,
  formatSegmentForExport,
} from '@/lib/utils/formatSegmentForExport'
import { sleep } from '@/lib/utils/sleep'
import { FFMPegAudioInput, FFMPegVideoInput } from './ffmpegUtils'
import { createFullVideo } from './createFullVideo'
import { extractScenesFromVideo } from './extractScenesFromVideo'
import { base64DataUriToFile } from '@/lib/utils/base64DataUriToFile'
import { useUI } from '../ui'
import { getTypeAndExtension } from '@/lib/utils/getTypeAndExtension'

import { useScriptEditor } from '../editors'
import {
  generateEDL,
  generateFCP,
  generateMLT,
  generateOTIO,
  generateOTIOZ,
} from './formats'

export const useIO = create<IOStore>((set, get) => ({
  ...getDefaultIOState(),

  clear: () => {
    const renderer = useRenderer.getState()
    const timeline: TimelineStore = useTimeline.getState()

    // reset various things
    renderer.clear()
    timeline.clear()
  },
  openFiles: async (files: File[]) => {
    const { openClapBlob, openScreenplay, openVideo } = get()
    const timeline: TimelineStore = useTimeline.getState()
    const { segments, addSegments } = timeline

    if (Array.isArray(files)) {
      console.log('user tried to drop some files:', files)

      // for now let's simplify things, and only import the first file
      const file: File | undefined = files.at(0)
      if (!file) {
        return
      }

      const input = `${file.name || ''}`
      const { fileName, projectName, extension } = parseFileName(input)

      const fileType = `${file.type || ''}`

      console.log(`file type: ${fileType}`)

      const isClapFile = extension === 'clap'

      if (isClapFile) {
        await openClapBlob(projectName, fileName, file)
        return
      }

      const isTextFile = fileType.startsWith('text/')
      if (isTextFile) {
        await openScreenplay(projectName, fileName, file)
        return
      }

      const isAudioFile = fileType.startsWith('audio/')

      // TODO: detect the type of file, and do a different treatment based on this
      // screenplay files: -> analyze (if there is existing data, show a modal asking to save or not)
      // mp3 file: ->
      if (isAudioFile) {
        const newSegments = await parseFileIntoSegments({ file })

        console.log('calling  timeline.addSegments with:', newSegments)
        await timeline.addSegments({ segments: newSegments })

        return
      }

      const isVideoFile = fileType.startsWith('video/')
      if (isVideoFile) {
        await openVideo(projectName, fileName, file)
        return
      }
    }
    useUI.getState().setShowWelcomeScreen(false)
  },
  openVideo: async (
    projectName: string,
    fileName: string,
    fileContent: string | Blob
  ): Promise<void> => {
    const timeline: TimelineStore = useTimeline.getState()

    const sceneExtractionTask = useTasks.getState().add({
      category: TaskCategory.IMPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Starting up, can take a few minutes..`,
      successMessage: `Extracting scenes.. 100%`,
      value: 0,
    })

    const file =
      typeof fileContent === 'string'
        ? base64DataUriToFile(fileContent, fileName)
        : fileContent

    const scenes = await extractScenesFromVideo(file, {
      frameFormat: 'png', // in theory we could also use 'jpg', but this freezes FFmpeg
      maxWidth: 1024,
      maxHeight: 576,
      framesPerScene: 1,
      autoCrop: true,
      sceneThreshold: 0.1,
      minSceneDuration: 1,
      debug: true,
      onProgress: (progress: number) => {
        sceneExtractionTask.setProgress({
          message: `Extracting scenes.. ${progress}%`,
          value: progress,
        })
      },
    })

    // optional: reset the project
    // await timeline.setClap(newClap())

    let currentStoryboardIndex = 0
    let startTimeInMs = 0
    const durationInSteps = 4
    const durationInMs = durationInSteps * DEFAULT_DURATION_IN_MS_PER_STEP
    let endTimeInMs = startTimeInMs + durationInMs

    // TODO: extract info from the original video to determine things like
    // the orientation, duration..
    timeline.setClap(
      newClap({
        meta: {
          id: UUID(),
          title: projectName,
          description: `${projectName} (${fileName})`,
          synopsis: '',
          licence: '',

          imageRatio: ClapImageRatio.LANDSCAPE,
          durationInMs: frames.length * durationInMs,

          // TODO: those should come from the Clapper user settings

          width: 1024,
          height: 576,
          imagePrompt: '',
          storyPrompt: '',
          systemPrompt: '',
          isLoop: false,
          isInteractive: false,

          bpm: 120,
          frameRate: 24,
        },
      })
    )

    for (const scene of scenes) {
      console.log('parsing scene:', scene)
      try {
        const frameFile = base64DataUriToFile(
          scene.frames[0],
          `storyboard_${++currentStoryboardIndex}.png`
        )

        const assetDurationInMs = scene.endTimeInMs - scene.startTimeInMs

        // this returns multiple segments (video, image..)
        const newSegments = await parseFileIntoSegments({
          file: frameFile,
          startTimeInMs: scene.startTimeInMs,
          endTimeInMs: scene.endTimeInMs,
        })

        for (const newSegment of newSegments) {
          newSegment.assetDurationInMs = assetDurationInMs
          if (newSegment.category === ClapSegmentCategory.VIDEO) {
            const { assetFileFormat, outputType } = getTypeAndExtension(
              scene.video
            )
            newSegment.assetFileFormat = assetFileFormat
            newSegment.assetUrl = scene.video
            newSegment.status = ClapSegmentStatus.COMPLETED
            newSegment.outputType = outputType
          }
        }
        await timeline.addSegments({ segments: newSegments })
      } catch (err) {
        console.error(`failed to process scene:`, scene)
        console.error(err)
      }
    }

    sceneExtractionTask.success()

    useUI.getState().setShowWelcomeScreen(false)
  },
  openScreenplay: async (
    projectName: string,
    fileName: string,
    fileContent: string | Blob
  ): Promise<void> => {
    const plainText =
      typeof fileContent === 'string'
        ? fileContent
        : await new Response(fileContent).text()

    const timeline: TimelineStore = useTimeline.getState()
    const scriptEditor: ScriptEditorStore = useScriptEditor.getState()
    const task = useTasks.getState().add({
      category: TaskCategory.IMPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Loading ${fileName}`,
      successMessage: `Successfully loaded the screenplay!`,
      value: 0,
    })
    task.setProgress({
      message: 'Analyzing screenplay..',
      value: 10,
    })

    try {
      // this is the old way, based on a call to a separate API hosted on HF
      // obviously this wasn't very practical and easy to scale, so I'm dropping it
      //
      // const res = await fetch("https://jbilcke-hf-broadway-api.hf.space", {
      //   method: "POST",
      //   headers: { 'Content-Type': 'text/plain' },
      //   body: plainText,
      // })
      // const blob = await res.blob()
      // task.setProgress({
      //   message: "Loading scenes..",
      //   value: 50
      // })
      // const clap = await parseClap(blob)

      // new way: we analyze the screenplay on browser side
      const clap = await parseScriptToClap(
        plainText,
        async ({ value, sleepDelay, message }) => {
          const relativeProgressRatio = value / 100
          const totalProgress = 10 + relativeProgressRatio * 80
          task.setProgress({
            message,
            value: totalProgress,
          })
          await sleep(sleepDelay || 25)
        }
      )

      clap.meta.title = `${projectName || ''}`

      task.setProgress({
        message: 'Loading rendering engine..',
        value: 90,
      })

      await timeline.setClap(clap)
      scriptEditor.loadDraftFromClap(clap)

      task.setProgress({
        message: 'Nearly there..',
        value: 98,
      })

      task.success()
    } catch (err) {
      console.error('failed to import the screenplay:', err)
      task.fail(`${err || 'unknown screenplay import error'}`)
    } finally {
    }
    useUI.getState().setShowWelcomeScreen(false)
  },
  openScreenplayUrl: async (url: string) => {
    const timeline: TimelineStore = useTimeline.getState()
    const scriptEditor: ScriptEditorStore = useScriptEditor.getState()

    const { fileName, projectName } = parseFileName(
      `${url.split('/').pop() || url}`
    )

    const task = useTasks.getState().add({
      category: TaskCategory.IMPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Loading ${fileName}`,
      successMessage: `Successfully downloaded the screenplay!`,
      value: 0,
    })

    task.setProgress({
      message: 'Downloading screenplay..',
      value: 10,
    })

    try {
      const res = await fetch(url)
      const plainText = await res.text()
      // new way: we analyze the screenplay on browser side
      const clap = await parseScriptToClap(
        plainText,
        async ({ value, sleepDelay, message }) => {
          const relativeProgressRatio = value / 100
          const totalProgress = 10 + relativeProgressRatio * 80
          task.setProgress({
            message,
            value: totalProgress,
          })
          await sleep(sleepDelay || 25)
        }
      )

      clap.meta.title = `${projectName || ''}`

      task.setProgress({
        message: 'Loading rendering engine..',
        value: 90,
      })

      await timeline.setClap(clap)
      scriptEditor.loadDraftFromClap(clap)

      task.setProgress({
        message: 'Nearly there..',
        value: 98,
      })

      task.success()
    } catch (err) {
      task.fail(`${err || 'unknown error'}`)
    }
    useUI.getState().setShowWelcomeScreen(false)
  },
  saveAnyFile: (blob: Blob, fileName: string) => {
    // Create an object URL for the compressed clap blob
    // object urls are short-lived urls, with the benefit of having a short id too

    const objectUrl = URL.createObjectURL(blob)

    // Create an anchor element and force browser download
    const anchor = document.createElement('a')
    anchor.href = objectUrl

    anchor.download = fileName

    document.body.appendChild(anchor) // Append to the body (could be removed once clicked)
    anchor.click() // Trigger the download

    // Cleanup: revoke the object URL and remove the anchor element
    URL.revokeObjectURL(objectUrl)
    document.body.removeChild(anchor)
  },

  openClapUrl: async (url: string) => {
    const timeline: TimelineStore = useTimeline.getState()
    const scriptEditor: ScriptEditorStore = useScriptEditor.getState()
    const { setClap } = timeline

    const { fileName, projectName } = parseFileName(
      `${url.split('/').pop() || url}`
    )

    const task = useTasks.getState().add({
      category: TaskCategory.IMPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Loading ${fileName}`,
      successMessage: `Successfully downloaded the project!`,
      value: 0,
    })

    task.setProgress({
      message: 'Downloading file..',
      value: 10,
    })

    try {
      const res = await fetch(url)
      const blob = await res.blob()

      task.setProgress({
        message: 'Loading scenes..',
        value: 30,
      })

      const clap = await parseClap(blob)
      clap.meta.title = `${projectName}`

      task.setProgress({
        message: 'Loading rendering engine..',
        value: 70,
      })

      await setClap(clap)
      scriptEditor.loadDraftFromClap(clap)

      task.success()
    } catch (err) {
      task.fail(`${err || 'unknown error'}`)
    }
    useUI.getState().setShowWelcomeScreen(false)
  },
  openClapBlob: async (projectName: string, fileName: string, blob: Blob) => {
    const timeline: TimelineStore = useTimeline.getState()
    const scriptEditor: ScriptEditorStore = useScriptEditor.getState()
    const { setClap } = timeline

    const task = useTasks.getState().add({
      category: TaskCategory.IMPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Loading ${fileName}`,
      successMessage: `Successfully loaded the project!`,
      value: 0,
    })
    try {
      task.setProgress({
        message: 'Loading scenes..',
        value: 30,
      })

      const clap = await parseClap(blob)
      clap.meta.title = `${projectName}`

      task.setProgress({
        message: 'Loading rendering engine..',
        value: 70,
      })

      await setClap(clap)
      scriptEditor.loadDraftFromClap(clap)

      task.success()
    } catch (err) {
      task.fail(`${err || 'unknown error'}`)
    }
    useUI.getState().setShowWelcomeScreen(false)
  },
  saveClap: async () => {
    const { saveAnyFile } = get()
    const { getClap } = useTimeline.getState()

    const tasks = useTasks.getState()

    const task = tasks.add({
      category: TaskCategory.EXPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Exporting project to OpenClap..`,
      successMessage: `Successfully exported the project!`,
      // mode: "percentage", // default
      // min: 0, // default
      // max: 100 // default
    })

    const clap = await getClap()

    if (!clap) {
      throw new Error(`cannot save a clap.. if there is no clap`)
    }

    // TODO: serializeClap should have a progress callback, so that we can
    // track the progression.
    //
    // also, I'm 100% aware that at some point we will just want to use the
    // desktop version of Clapper, so that we can write the gzip stream directly to the disk
    const blob: Blob = await serializeClap(clap)
    saveAnyFile(blob, `my_project.clap`) // <-- TODO use the project filename

    task.success()
  },

  saveVideoFile: async () => {
    const { saveAnyFile } = get()
    console.log(`rendering project using the embedded FFmpeg..`)

    const task = useTasks.getState().add({
      category: TaskCategory.EXPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Rendering the project to MP4..`,
      successMessage: `Successfully exported the MP4 video!`,
      value: 0,
    })

    try {
      const timeline: TimelineStore = useTimeline.getState()

      const {
        width,
        height,
        durationInMs,
        segments: timelineSegments,
        getClap,
      } = timeline

      const clap = await getClap()

      if (!clap) {
        throw new Error(`cannot save a clap.. if there is no clap`)
      }

      const ignoreThisVideoSegmentId = (await getFinalVideo(clap))?.id || ''

      const segments: ExportableSegment[] = timelineSegments
        .map((segment, i) => formatSegmentForExport(segment, i))
        .filter(
          ({ id, isExportableToFile }) =>
            isExportableToFile && id !== ignoreThisVideoSegmentId
        )

      const videos: FFMPegVideoInput[] = []
      const images: FFMPegVideoInput[] = []
      const audios: FFMPegAudioInput[] = []

      segments.forEach(
        ({
          segment,
          prefix,
          filePath,
          assetUrl,
          assetSourceType,
          isExportableToFile,
        }) => {
          if (isExportableToFile) {
            assetUrl = filePath
            assetSourceType = ClapAssetSource.PATH

            if (filePath.startsWith('video/')) {
              videos.push({
                data: base64DataUriToUint8Array(segment.assetUrl),
                startTimeInMs: segment.startTimeInMs,
                endTimeInMs: segment.endTimeInMs,
                durationInSecs: segment.assetDurationInMs / 1000,
                category: segment.category,
              })
            } else if (
              filePath.startsWith('image/') ||
              segment.category === ClapSegmentCategory.IMAGE
            ) {
              images.push({
                data: base64DataUriToUint8Array(segment.assetUrl),
                startTimeInMs: segment.startTimeInMs,
                endTimeInMs: segment.endTimeInMs,
                durationInSecs:
                  (segment.endTimeInMs - segment.startTimeInMs) / 1000,
                category: segment.category,
              })
            } else if (
              filePath.startsWith('music/') ||
              filePath.startsWith('sound/') ||
              filePath.startsWith('dialogue/')
            ) {
              audios.push({
                data: base64DataUriToUint8Array(segment.assetUrl),
                startTimeInMs: segment.startTimeInMs,
                endTimeInMs: segment.endTimeInMs,
                durationInSecs: segment.assetDurationInMs / 1000,
                category: segment.category,
              })
            }
          }
        }
      )

      // Combine videos and images
      const videoInputs = [...videos, ...images].sort(
        (a, b) => a.startTimeInMs - b.startTimeInMs
      )

      const fullVideo = await createFullVideo(
        videoInputs,
        audios,
        width,
        height,
        durationInMs,
        (progress, message) => {
          task.setProgress({
            message: `Rendering video (${Math.round(progress)}%)`,
            value: progress * 0.9,
          })
        }
      )

      const videoBlob = new Blob([fullVideo], { type: 'video/mp4' })
      saveAnyFile(videoBlob, 'my_project.mp4')
      task.success()
    } catch (err) {
      console.error(err)
      task.fail(`${err || 'unknown error'}`)
    }
  },

  saveZipFile: async () => {
    const { saveAnyFile } = get()
    console.log(`exporting project to ZIP..`)

    const task = useTasks.getState().add({
      category: TaskCategory.EXPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Exporting project to ZIP..`,
      successMessage: `Successfully exported the project!`,
      value: 0,
    })

    try {
      const timeline: TimelineStore = useTimeline.getState()

      const { segments: timelineSegments } = timeline

      const segments: ExportableSegment[] = timelineSegments
        .map((segment, i) => formatSegmentForExport(segment, i))
        .filter(({ isExportableToFile }) => isExportableToFile)

      let files: fflate.AsyncZippable = {}

      const meta = timeline.getClapMeta()

      files['story_prompt.txt'] = fflate.strToU8(meta.storyPrompt)

      files['meta.json'] = fflate.strToU8(JSON.stringify(meta, null, 2))

      try {
        const edlXml = await generateEDL()
        files['edl_project.edl'] = fflate.strToU8(edlXml)
      } catch (err) {
        console.error(`failed to generate the EDL file`)
      }

      try {
        const shotcutMltXml = await generateMLT()
        files['shotcut_project.mlt'] = fflate.strToU8(shotcutMltXml)
      } catch (err) {
        console.error(`failed to generate the MLT XML file`)
      }

      try {
        const fcpXml = await generateFCP()
        files['finalcut_project.fcpxml'] = fflate.strToU8(fcpXml)
      } catch (err) {
        console.error(`failed to generate the FCPXML file`)
      }

      try {
        const otio = await generateOTIO()
        files['opentimeline_project.otio'] = fflate.strToU8(otio)
      } catch (err) {
        console.error(`failed to generate the OpenTimelineIO file`)
      }

      const videos: FFMPegVideoInput[] = []
      const audios: FFMPegAudioInput[] = []

      const includeFullVideo = false

      segments.forEach(
        ({
          segment,
          prefix,
          filePath,
          assetUrl,
          assetSourceType,
          isExportableToFile,
        }) => {
          // we extract the base64 files
          if (isExportableToFile) {
            files[filePath] = [
              // we don't compress assets since normally they already use
              // some form of compression (PNG, JPEG, MP3, MP4 etc..)
              base64DataUriToUint8Array(segment.assetUrl),
              { level: 0 },
            ]
            assetUrl = filePath
            assetSourceType = ClapAssetSource.PATH

            if (includeFullVideo) {
              if (filePath.startsWith('video/')) {
                videos.push({
                  data: base64DataUriToUint8Array(segment.assetUrl),
                  startTimeInMs: segment.startTimeInMs,
                  endTimeInMs: segment.endTimeInMs,
                  durationInSecs: segment.assetDurationInMs / 1000,
                  category: segment.category,
                })
              }

              if (
                filePath.startsWith('music/') ||
                filePath.startsWith('dialogue/')
              ) {
                audios.push({
                  data: base64DataUriToUint8Array(segment.assetUrl),
                  startTimeInMs: segment.startTimeInMs,
                  endTimeInMs: segment.endTimeInMs,
                  durationInSecs: segment.assetDurationInMs / 1000,
                  category: segment.category,
                })
              }
            }
          }

          // segment metadata
          files[`segments/${prefix}${segment.id}.json`] = fflate.strToU8(
            JSON.stringify(
              {
                ...segment,
                assetUrl,
                assetSourceType,
              },
              null,
              2
            )
          )
        }
      )

      if (includeFullVideo) {
        const fullVideo = await createFullVideo(
          videos,
          audios,
          meta.width,
          meta.height,
          timeline.durationInMs,
          (progress, message) => {
            task.setProgress({
              message,
              value: progress * 0.9,
            })
          }
        )

        files['video/full.mp4'] = [
          // we don't compress assets since normally they already use
          // some form of compression (PNG, JPEG, MP3, MP4 etc..)
          fullVideo as Uint8Array,
          { level: 0 },
        ]
      }

      fflate.zip(
        files,
        {
          // options
        },
        (error, zipFile) => {
          task.setProgress({
            message: 'Saving to file..',
            value: 100,
          })
          saveAnyFile(new Blob([zipFile]), 'my_project.zip')
          task.success()
        }
      )
    } catch (err) {
      console.error(err)
      task.fail(`${err || 'unknown error'}`)
    }
  },

  saveOTIOZFile: async () => {
    const { saveAnyFile } = get()
    console.log(`Exporting project to OTIOZ...`)

    const task = useTasks.getState().add({
      category: TaskCategory.EXPORT,
      visibility: TaskVisibility.BLOCKER,
      initialMessage: `Exporting project to OTIOZ...`,
      successMessage: `Successfully exported the project to OTIOZ!`,
      value: 0,
    })

    try {
      task.setProgress({
        message: 'Generating OTIOZ content...',
        value: 10,
      })

      const otiozData = await generateOTIOZ()

      task.setProgress({
        message: 'Preparing file for download...',
        value: 90,
      })

      const blob = new Blob([otiozData], { type: 'application/octet-stream' })
      saveAnyFile(blob, 'my_project.otioz')

      task.success()
    } catch (err) {
      console.error('Failed to generate OTIOZ:', err)
      task.fail(`${err || 'Unknown error occurred while generating OTIOZ'}`)
    }
  },
  openMLT: async (file: File) => {
    useUI.getState().setShowWelcomeScreen(false)
  },
  saveMLT: async () => {},

  openKdenline: async (file: File) => {
    useUI.getState().setShowWelcomeScreen(false)
  },

  saveKdenline: async () => {
    const { saveAnyFile } = get()
    const clap: ClapProject = useTimeline.getState().clap
    // const tracks: ClapTracks = useTimeline.getState().tracks

    throw new Error(`cannot run in a browser, unfortunately`)

    /*
    // hum.. we should add FPS to the ClapProject metadata
    const fps = 30 // clap.meta

    // for documentation, look at the example test file in:
    // https://www.npmjs.com/package/kdenlive?activeTab=code
    const project = new Project(fps)

    const cameraSegments = clap.segments.filter(s => s.category === ClapSegmentCategory.CAMERA)
 
    const segmentsWithNonEmptyAssets = clap.segments.filter(s => s.assetUrl)

    // const videoSegments = clap.segments.filter(s => s.category === ClapSegmentCategory.VIDEO && s.assetUrl)
    const videoTractor = project.addVideoTractor()

    // const soundSegments = clap.segments.filter(s => s.category === ClapSegmentCategory.SOUND && s.assetUrl)
    const soundTractor = project.addAudioTractor()

    // const voiceSegments = clap.segments.filter(s => s.category === ClapSegmentCategory.DIALOGUE && s.assetUrl)
    const voiceTractor = project.addAudioTractor()

    // const musicSegments = clap.segments.filter(s => s.category === ClapSegmentCategory.MUSIC && s.assetUrl)
    const musicTractor = project.addAudioTractor()

    for (const shot of cameraSegments) {
      const videoSegments = filterSegments(
        ClapSegmentFilteringMode.ANY,
        shot,
        segmentsWithNonEmptyAssets,
        ClapSegmentCategory.VIDEO
      )
      const videoSegment = videoSegments.at(0)
      if (videoSegment) { continue }

      const producer = project.addProducer(`${videoSegment.id}.mp4`)
			
      const entry = new Entry(
        producer,
        formatDuration(shot.startTimeInMs),
        formatDuration(shot.endTimeInMs)
      )
			videoTractor.addEntry(entry)
			// audio_track.addEntry(entry)
    }

    const xml = await project.toXML()
    const blob = new Blob([xml], { type: "text/xml" })
    saveAnyFile(blob, `my_project.kdenlive`)

    */
  },

  openOpenTimelineIO: async (file: File) => {
    useUI.getState().setShowWelcomeScreen(false)
  },

  saveOpenTimelineIO: async () => {},

  saveEntitiesToClap: async (entities: ClapEntity[]): Promise<void> => {
    const blob = await serializeClap(newClap({ entities }))
    get().saveAnyFile(blob, `my_entities.clap`)
  },

  openEntitiesFromClap: async (file: File): Promise<ClapEntity[]> => {
    if (!file) {
      throw new Error('openEntities: no file provided')
    }

    const input = `${file.name || ''}`
    const fileType = `${file.type || ''}`
    console.log(`file type: ${fileType}`)

    const isClapFile = parseFileName(input).extension === 'clap'
    if (!isClapFile) {
      throw new Error(`openEntities: cannot open this file type: ${fileType}`)
    }

    const { entities } = await parseClap(file)

    useUI.getState().setShowWelcomeScreen(false)

    return entities
  },
}))
