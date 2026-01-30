import { readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { readConfig } from './config.js'
import { deriveBrainPassword } from './homeserver.js'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const SKILLS_DIR = join(DATA_DIR, 'skills')

const runningSkills = new Map() // userId -> { client, name }

/**
 * Scan skills/ directory and boot each internal skill.
 * Each subfolder name is the skill's Matrix localpart (e.g. "translator").
 * The folder must contain an index.js that exports a default function(nervur).
 */
export async function bootInternalSkills() {
  const config = readConfig()
  if (!config?.homeserver?.url || !config?.brain?.registrationKey) {
    console.log('Skills: skipping — brain not fully configured')
    return
  }

  if (!existsSync(SKILLS_DIR)) {
    console.log('Skills: no skills/ directory found, skipping')
    return
  }

  const { url: hsUrl } = config.homeserver
  const { registrationKey } = config.brain
  const serverName = config.homeserver.serverName

  const entries = readdirSync(SKILLS_DIR).filter((name) => {
    const p = join(SKILLS_DIR, name)
    return statSync(p).isDirectory() && existsSync(join(p, 'index.js'))
  })

  if (entries.length === 0) {
    console.log('Skills: no skill folders with index.js found')
    return
  }

  console.log(`Skills: found ${entries.length} internal skill(s): ${entries.join(', ')}`)

  for (const name of entries) {
    const userId = `@${name}:${serverName}`
    const password = deriveBrainPassword(registrationKey, name)
    const skillPath = join(SKILLS_DIR, name, 'index.js')

    try {
      // Dynamic import the SDK from the sdks/js submodule
      const { connect } = await import('../../sdks/js/src/index.js')

      const client = await connect({ homeserverUrl: hsUrl, userId, password })
      console.log(`Skills: ${name} connected as ${userId}`)

      // Load and run the skill code
      const skillModule = await import(pathToFileURL(skillPath).href)
      const handler = skillModule.default || skillModule
      if (typeof handler === 'function') {
        handler(client)
        // Re-emit connected so skill handlers registered after connect() see it
        if (client.connected) {
          client.emit('connected', { userId: client.userId, roomId: client.roomId })
        }
      } else {
        console.warn(`Skills: ${name}/index.js does not export a default function`)
      }

      runningSkills.set(userId, { client, name })
    } catch (err) {
      console.error(`Skills: failed to boot ${name}:`, err.message)
    }
  }
}

/**
 * Stop all running internal skills.
 */
export function stopAllSkills() {
  for (const [userId, { client, name }] of runningSkills) {
    try {
      client.disconnect()
      console.log(`Skills: ${name} disconnected`)
    } catch {
      /* ignore */
    }
  }
  runningSkills.clear()
}
