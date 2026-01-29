import net from 'net'
import { access, constants } from 'fs/promises'

export function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve({ port, available: false }))
    server.once('listening', () => {
      server.close(() => resolve({ port, available: true }))
    })
    server.listen(port, '0.0.0.0')
  })
}

export async function checkPorts(ports) {
  return Promise.all(ports.map(checkPort))
}

export async function checkWritePermissions(dir) {
  try {
    await access(dir, constants.W_OK)
    return { dir, writable: true }
  } catch {
    return { dir, writable: false }
  }
}
