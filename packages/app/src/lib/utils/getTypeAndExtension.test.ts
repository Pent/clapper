import { expect, test } from 'vitest'
import { ClapOutputType } from '@aitube/clap'

import { getTypeAndExtension } from './getTypeAndExtension'

const gifUri = `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7`

const pngUri = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=`

const mp4Uri = `data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAtJtZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwMyA5NDFjYWU2IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMiAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAVZYiEABX//vfJ78Cm6/X2tb9gAQD5AAADBm1vb3YAAABsbXZoZAAAAADgYBEw4GARMAAAA+gAAAPoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIwdHJhawAAAFx0a2hkAAAAA+BgETDgYBEwAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAUAAAAFAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAD6AAAAAAAAQAAAAABqG1kaWEAAAAgbWRoZAAAAADgYBEw4GARMAAAQAAAAEAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVNtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAETc3RibAAAAK9zdHNkAAAAAAAAAAEAAACfYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAUABQASAAAAEgAAAAAAAAAARVMYXZjNTkuNTYuMTAwIGxpYngyNjQAAAAAAAAAAAAAABj//wAAADVhdmNDAWQAM//hABhnZAAzrNlJeeeEAAADAAQAAAMACDxgxlgBAAZo6+PLIsD9+PgAAAAAFGJ0cnQAAAAAAAAWUAAAFlAAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAACygAAAAEAAAAUc3RjbwAAAAAAAAABAAAAMAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTkuMzUuMTAw`

test('getTypeAndExtension', () => {
  expect(getTypeAndExtension(gifUri)).toStrictEqual({
    assetFileFormat: 'image/gif',
    category: 'image',
    extension: 'gif',
    outputType: ClapOutputType.IMAGE,
  })
  expect(getTypeAndExtension(pngUri)).toStrictEqual({
    assetFileFormat: 'image/png',
    category: 'image',
    extension: 'png',
    outputType: ClapOutputType.IMAGE,
  })
  expect(getTypeAndExtension(mp4Uri)).toStrictEqual({
    assetFileFormat: 'video/mp4',
    category: 'video',
    extension: 'mp4',
    outputType: ClapOutputType.VIDEO,
  })
})

/**
 * Related to the `Maximum call stack size exceeded` issue
 * when using RegExp, now with string/array manipulation is
 * much faster and the `stack` error solved; I wasn't able to easily
 * replicate the stack size error in vitest env, seems happening only
 * in Next env; so only a "performance" test is done.
 *
 * Issue: https://github.com/jbilcke-hf/clapper/issues/72
 */
test('getTypeAndExtension should be fast for long uris', () => {
  const startTime = Date.now()
  const longBase64String = 'a'.repeat(500_000_000)
  const dataUri = `data:image/png;base64,${longBase64String}`
  const result = getTypeAndExtension(dataUri)
  expect(result).toStrictEqual({
    assetFileFormat: 'image/png',
    category: 'image',
    extension: 'png',
    outputType: ClapOutputType.IMAGE,
  })
  const endTime = Date.now()
  const duration = endTime - startTime
  // Original regexp approach was running around ~350ms; new one is around ~70ms
  expect(duration).toBeLessThan(200)
})
