import type { TerminalRef } from '../types/circuit'

export function terminalKey(terminal: TerminalRef): string {
  return `${terminal.componentId}:${terminal.side}`
}
