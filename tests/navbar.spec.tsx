import * as React from 'react'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders } from './utils'
import { Navbar } from '../ui/sidepanel/components/navbar/Navbar.jsx'

describe('Navbar', () => {
  const mockProps = {
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    createNewChat: vi.fn(),
    SettingsTrigger: () => <button>Settings</button>,
    connectedTabId: null,
    currentTabId: null,
    onConnectTab: vi.fn(),
    onFocusToConnectedTab: vi.fn(),
    onDisconnectTab: vi.fn(),
  }

  it('renders navbar with Jan branding', () => {
    renderWithProviders(<Navbar {...mockProps} />)
    expect(screen.getByText('Jan')).toBeTruthy()
  })

  it('shows menu trigger when sidebar is closed', () => {
    renderWithProviders(<Navbar {...mockProps} sidebarOpen={false} />)
    const menuButton = screen.getByLabelText('Open sidebar')
    expect(menuButton).toBeTruthy()
  })

  it('hides menu trigger when sidebar is open', () => {
    renderWithProviders(<Navbar {...mockProps} sidebarOpen={true} />)
    const menuButton = screen.queryByLabelText('Open sidebar')
    expect(menuButton).toBeFalsy()
  })

  it('shows connect button with default state when no tab is connected', () => {
    renderWithProviders(<Navbar {...mockProps} />)
    const connectButton = screen.getByTitle(/Not connected - Click to connect/)
    expect(connectButton).toBeTruthy()
  })

  it('shows connect button with connected state when tab is connected', () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={456} />
    )
    const connectButton = screen.getByTitle(/Connected \(different tab\)/)
    expect(connectButton).toBeTruthy()
  })

  it('shows connect button with current tab connected state', () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={123} />
    )
    const connectButton = screen.getByTitle(/Connected \(this tab\)/)
    expect(connectButton).toBeTruthy()
  })

  it('opens dropdown when connect button is clicked', async () => {
    renderWithProviders(<Navbar {...mockProps} currentTabId={789} />)
    const connectButton = screen.getByTitle(/Not connected/)

    fireEvent.click(connectButton)

    await waitFor(() => {
      const connectOption = screen.getByText(/Connect to this tab/)
      expect(connectOption).toBeTruthy()
    })
  })

  it('shows "Focus to connected tab" option when different tab is connected', async () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={456} />
    )
    const connectButton = screen.getByTitle(/Connected \(different tab\)/)

    fireEvent.click(connectButton)

    await waitFor(() => {
      const focusOption = screen.getByText('Focus to connected tab')
      expect(focusOption).toBeTruthy()
    })
  })

  it('shows "Disconnect" option when current tab is connected', async () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={123} />
    )
    const connectButton = screen.getByTitle(/Connected \(this tab\)/)

    fireEvent.click(connectButton)

    await waitFor(() => {
      const disconnectOption = screen.getByText(/Disconnect/)
      expect(disconnectOption).toBeTruthy()
    })
  })

  it('calls onConnectTab when "Connect to this tab" is clicked', async () => {
    const onConnectTab = vi.fn()
    renderWithProviders(
      <Navbar {...mockProps} currentTabId={789} onConnectTab={onConnectTab} />
    )

    const connectButton = screen.getByTitle(/Not connected/)
    fireEvent.click(connectButton)

    await waitFor(() => {
      const connectOption = screen.getByText(/Connect to this tab/)
      fireEvent.click(connectOption)
    })

    expect(onConnectTab).toHaveBeenCalledWith(789)
  })

  it('calls onDisconnectTab when "Disconnect" is clicked', async () => {
    const onDisconnectTab = vi.fn()
    renderWithProviders(
      <Navbar
        {...mockProps}
        connectedTabId={123}
        currentTabId={123}
        onDisconnectTab={onDisconnectTab}
      />
    )

    const connectButton = screen.getByTitle(/Connected \(this tab\)/)
    fireEvent.click(connectButton)

    await waitFor(() => {
      const disconnectOption = screen.getByText(/Disconnect/)
      fireEvent.click(disconnectOption)
    })

    expect(onDisconnectTab).toHaveBeenCalled()
  })

  it('calls onFocusToConnectedTab when "Focus to connected tab" is clicked', async () => {
    const onFocusToConnectedTab = vi.fn()
    renderWithProviders(
      <Navbar
        {...mockProps}
        connectedTabId={123}
        currentTabId={456}
        onFocusToConnectedTab={onFocusToConnectedTab}
      />
    )

    const connectButton = screen.getByTitle(/Connected \(different tab\)/)
    fireEvent.click(connectButton)

    await waitFor(() => {
      const focusOption = screen.getByText('Focus to connected tab')
      fireEvent.click(focusOption)
    })

    expect(onFocusToConnectedTab).toHaveBeenCalledWith(123)
  })

  it('applies pressed styling when mousedown on connect button', async () => {
    renderWithProviders(<Navbar {...mockProps} />)
    const connectButton = screen.getByTitle(/Not connected/)

    fireEvent.mouseDown(connectButton)

    await waitFor(() => {
      expect(connectButton.className).toContain('scale-95')
    })
  })

  it('removes pressed styling when mouseup on connect button', async () => {
    renderWithProviders(<Navbar {...mockProps} />)
    const connectButton = screen.getByTitle(/Not connected/)

    fireEvent.mouseDown(connectButton)
    await waitFor(() => {
      expect(connectButton.className).toContain('scale-95')
    })

    fireEvent.mouseUp(connectButton)
    await waitFor(() => {
      expect(connectButton.className).not.toContain('scale-95')
    })
  })

  it('shows darker background when current tab is connected', () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={123} />
    )
    const connectButton = screen.getByTitle(/Connected \(this tab\)/)
    expect(connectButton.className).toContain('bg-green-200/70')
  })

  it('shows lighter background when different tab is connected', () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={456} />
    )
    const connectButton = screen.getByTitle(/Connected \(different tab\)/)
    expect(connectButton.className).toContain('bg-green-100/30')
  })

  it('calls createNewChat when new chat button is clicked', () => {
    const createNewChat = vi.fn()
    renderWithProviders(<Navbar {...mockProps} createNewChat={createNewChat} />)

    const newChatButton = screen.getByTitle('New chat')
    fireEvent.click(newChatButton)

    expect(createNewChat).toHaveBeenCalled()
  })

  it('shows explanatory text when connected to current tab', async () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={123} />
    )

    const connectButton = screen.getByTitle(/Connected \(this tab\)/)
    fireEvent.click(connectButton)

    await waitFor(() => {
      const helpText = screen.getByText('MCP tools will operate on this tab')
      expect(helpText).toBeTruthy()
    })
  })

  it('shows explanatory text when connected to different tab', async () => {
    renderWithProviders(
      <Navbar {...mockProps} connectedTabId={123} currentTabId={456} />
    )

    const connectButton = screen.getByTitle(/Connected \(different tab\)/)
    fireEvent.click(connectButton)

    await waitFor(() => {
      const helpText = screen.getByText('MCP tools are using another tab')
      expect(helpText).toBeTruthy()
    })
  })
})
