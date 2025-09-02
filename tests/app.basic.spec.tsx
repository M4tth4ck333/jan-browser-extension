import * as React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from './utils'
import App from '../ui/sidepanel/App.jsx'

describe('App basic', () => {
  it('pins layout to viewport and shows hero on first load', async () => {
    const { container } = renderWithProviders(<App />)

    const root = container.firstElementChild as HTMLElement
    expect(root).toBeTruthy()
    expect(root.className).toContain('fixed')
    expect(root.className).toContain('inset-0')
    expect(root.className).toContain('grid')

    await waitFor(() => {
      const el = screen.getByText(/What do you/i)
      expect(!!el).toBe(true)
    })
  })

  it('renders assistant content via Streamdown mock', async () => {
    const chromeAny = (globalThis as any).chrome
    const session = {
      id: 's1',
      title: 'Test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { role: 'assistant', content: 'hello', ts: Date.now() },
        { role: 'user', content: 'Hi', ts: Date.now() },
        { role: 'assistant', content: '# Hello\n\n- item', ts: Date.now() },
      ],
      context: { useContextDefault: true, selectedTabIds: [], contextCache: {}, autoFollowActiveTab: true },
    }
    const isVitest = Boolean((import.meta as any)?.vitest)
    if (!isVitest) {
      // In Bun runner we don't mock Streamdown; just skip this content-specific assertion.
      expect(true).toBe(true)
      return
    }
    if (isVitest && chromeAny.storage?.local?.get?.mockResolvedValueOnce) {
      chromeAny.storage.local.get.mockResolvedValueOnce({ sessions: [session], activeSessionId: 's1' })
    } else {
      const orig = chromeAny.storage.local.get
      chromeAny.storage.local.get = async () => ({ sessions: [session], activeSessionId: 's1' })
      // restore after a tick
      setTimeout(() => { chromeAny.storage.local.get = orig }, 0)
    }

    renderWithProviders(<App />)

    // Our mock Streamdown simply echoes children; ensure it received content
    await waitFor(() => {
      const out = screen.getAllByTestId('streamdown-output').at(-1) as HTMLElement
      expect(out).toHaveTextContent('# Hello')
      expect(out).toHaveTextContent('item')
    })
  })
})
