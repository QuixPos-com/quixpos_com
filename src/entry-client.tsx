import { hydrate, render } from 'preact'
import { App } from './components/App'

const container = document.getElementById('app')

if (container) {
  if (container.hasChildNodes()) {
    hydrate(<App url={window.location.pathname} />, container)
  } else {
    render(<App url={window.location.pathname} />, container)
  }
}
