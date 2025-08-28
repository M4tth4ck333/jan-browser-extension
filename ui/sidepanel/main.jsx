import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import App from './App.jsx'
import * as Tooltip from '@radix-ui/react-tooltip'
import '../../src/shims/browser.js'

const root = createRoot(document.getElementById('root'))
root.render(
  <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
    <App />
  </Tooltip.Provider>
)
