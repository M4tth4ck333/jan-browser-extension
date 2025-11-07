import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setMcpRegisteredTab,
  getMcpRegisteredTab,
  clearMcpRegisteredTab,
  selectTab,
  isTabValid,
  createTab,
  closeTab,
} from '../src/lib/tab-manager.js'

// Mock chrome APIs
const mockChrome = {
  tabs: {
    get: vi.fn(),
    query: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}

// @ts-ignore
globalThis.chrome = mockChrome

describe('Tab Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMcpRegisteredTab()
  })

  describe('Tab Registration', () => {
    it('sets and gets registered tab ID', () => {
      expect(getMcpRegisteredTab()).toBe(null)

      setMcpRegisteredTab(123)
      expect(getMcpRegisteredTab()).toBe(123)
    })

    it('clears registered tab ID', () => {
      setMcpRegisteredTab(123)
      expect(getMcpRegisteredTab()).toBe(123)

      clearMcpRegisteredTab()
      expect(getMcpRegisteredTab()).toBe(null)
    })

    it('updates registered tab ID when set again', () => {
      setMcpRegisteredTab(123)
      expect(getMcpRegisteredTab()).toBe(123)

      setMcpRegisteredTab(456)
      expect(getMcpRegisteredTab()).toBe(456)
    })
  })

  describe('selectTab', () => {
    it('uses registered tab if available and valid', async () => {
      const mockTab = { id: 123, url: 'https://example.com' }
      mockChrome.tabs.get.mockResolvedValue(mockTab)

      setMcpRegisteredTab(123)
      const result = await selectTab({ toolName: 'test' })

      expect(result.ok).toBe(true)
      expect(result.tabId).toBe(123)
      expect(result.tab).toEqual(mockTab)
      expect(mockChrome.tabs.get).toHaveBeenCalledWith(123)
    })

    it('falls back to active tab if registered tab does not exist', async () => {
      const mockActiveTab = { id: 456, url: 'https://example.com', active: true }
      mockChrome.tabs.get.mockRejectedValue(new Error('Tab not found'))
      mockChrome.tabs.query.mockResolvedValue([mockActiveTab])

      setMcpRegisteredTab(123)
      const result = await selectTab({ toolName: 'test' })

      expect(result.ok).toBe(true)
      expect(result.tabId).toBe(456)
      expect(result.tab).toEqual(mockActiveTab)
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true })
    })

    it('uses active tab when no tab is registered', async () => {
      const mockActiveTab = { id: 789, url: 'https://example.com', active: true }
      mockChrome.tabs.query.mockResolvedValue([mockActiveTab])

      const result = await selectTab({ toolName: 'test' })

      expect(result.ok).toBe(true)
      expect(result.tabId).toBe(789)
      expect(result.tab).toEqual(mockActiveTab)
    })

    it('returns error when no active tab is found', async () => {
      mockChrome.tabs.query.mockResolvedValue([])

      const result = await selectTab({ toolName: 'test' })

      expect(result.ok).toBe(false)
      expect(result.error).toContain('No active tab')
    })

    it('rejects chrome:// URLs when requireUrl is true', async () => {
      const mockTab = { id: 123, url: 'chrome://extensions', active: true }
      mockChrome.tabs.query.mockResolvedValue([mockTab])

      const result = await selectTab({ toolName: 'test', requireUrl: true })

      expect(result.ok).toBe(false)
      expect(result.error).toContain('Cannot operate on chrome://')
    })

    it('rejects about: URLs when requireUrl is true', async () => {
      const mockTab = { id: 123, url: 'about:blank', active: true }
      mockChrome.tabs.query.mockResolvedValue([mockTab])

      const result = await selectTab({ toolName: 'test', requireUrl: true })

      expect(result.ok).toBe(false)
      expect(result.error).toContain('Cannot operate on chrome://')
    })

    it('accepts regular URLs when requireUrl is true', async () => {
      const mockTab = { id: 123, url: 'https://example.com', active: true }
      mockChrome.tabs.query.mockResolvedValue([mockTab])

      const result = await selectTab({ toolName: 'test', requireUrl: true })

      expect(result.ok).toBe(true)
      expect(result.tabId).toBe(123)
    })
  })

  describe('isTabValid', () => {
    it('returns true when tab exists', async () => {
      mockChrome.tabs.get.mockResolvedValue({ id: 123 })

      const valid = await isTabValid(123)
      expect(valid).toBe(true)
    })

    it('returns false when tab does not exist', async () => {
      mockChrome.tabs.get.mockRejectedValue(new Error('Tab not found'))

      const valid = await isTabValid(999)
      expect(valid).toBe(false)
    })
  })

  describe('createTab', () => {
    it('creates a new tab with given URL', async () => {
      const mockTab = { id: 123, url: 'https://example.com' }
      mockChrome.tabs.create.mockResolvedValue(mockTab)

      const tab = await createTab('https://example.com', true)

      expect(tab).toEqual(mockTab)
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.com',
        active: true,
      })
    })

    it('creates inactive tab when active is false', async () => {
      const mockTab = { id: 456, url: 'https://example.com' }
      mockChrome.tabs.create.mockResolvedValue(mockTab)

      await createTab('https://example.com', false)

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.com',
        active: false,
      })
    })
  })

  describe('closeTab', () => {
    it('closes a tab by ID', async () => {
      await closeTab(123)

      expect(mockChrome.tabs.remove).toHaveBeenCalledWith(123)
    })

    it('clears registered tab if it matches the closed tab', async () => {
      setMcpRegisteredTab(123)
      expect(getMcpRegisteredTab()).toBe(123)

      await closeTab(123)

      expect(getMcpRegisteredTab()).toBe(null)
    })

    it('does not clear registered tab if closed tab is different', async () => {
      setMcpRegisteredTab(123)

      await closeTab(456)

      expect(getMcpRegisteredTab()).toBe(123)
    })

    it('handles errors gracefully when tab cannot be closed', async () => {
      mockChrome.tabs.remove.mockRejectedValue(new Error('Cannot close tab'))

      // Suppress console warnings for this test
      const originalConsoleWarn = console.warn
      console.warn = vi.fn()

      await expect(closeTab(999)).resolves.not.toThrow()

      console.warn = originalConsoleWarn
    })
  })

  describe('Tab Registration Persistence', () => {
    it('maintains registration across multiple operations', async () => {
      setMcpRegisteredTab(123)

      expect(getMcpRegisteredTab()).toBe(123)
      await isTabValid(123)
      expect(getMcpRegisteredTab()).toBe(123)

      clearMcpRegisteredTab()
      expect(getMcpRegisteredTab()).toBe(null)
    })

    it('clears registration when registered tab is closed', async () => {
      setMcpRegisteredTab(123)
      mockChrome.tabs.get.mockResolvedValue({ id: 123 })

      const valid = await isTabValid(123)
      expect(valid).toBe(true)
      expect(getMcpRegisteredTab()).toBe(123)

      // Mock successful removal for this test
      mockChrome.tabs.remove.mockResolvedValue(undefined)

      await closeTab(123)
      expect(getMcpRegisteredTab()).toBe(null)
    })
  })
})
