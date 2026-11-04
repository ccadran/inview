// Journal des déclenchements : affiché à l'écran et lu par les tests Playwright.
declare global {
  interface Window {
    __log: string[]
  }
}

window.__log = []
const panel = document.createElement('div')
panel.id = 'log'
document.body.append(panel)

export const log = (message: string): void => {
  window.__log.push(message)
  const line = document.createElement('div')
  line.textContent = message
  panel.prepend(line)
}

/** Trace une ligne horizontale à `start` % au-dessus du bas de l'écran. */
export const drawStartLine = (start: number): void => {
  const line = document.createElement('div')
  line.className = 'start-line'
  line.style.bottom = `${start}%`
  line.innerHTML = `<span>start ${start}%</span>`
  document.body.append(line)
}
