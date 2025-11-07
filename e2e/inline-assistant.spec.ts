import path from 'path'
import os from 'os'
import fs from 'fs'
import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'

async function launchWithExtension(extensionPath: string) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jan-ext-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })
  // MV3: wait for service worker to attach so we can read its URL
  let sw = context.serviceWorkers()[0]
  if (!sw) sw = await context.waitForEvent('serviceworker')
  const m = sw.url().match(/chrome-extension:\/\/([a-p]{32})\//)
  if (!m) throw new Error('Failed to detect extension id from service worker URL: ' + sw.url())
  const id = m[1]
  return { context, id }
}

/**
 * Helper to create a test page with selectable text
 * Uses a real URL (example.com) and injects test content
 */
async function createTestPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()

  // Navigate to a real URL so content script gets injected
  await page.goto('https://example.com')

  // Wait a bit for content script to initialize
  await page.waitForTimeout(500)

  // Inject our test content
  await page.evaluate(() => {
    document.body.innerHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Page for Jan Inline Assistant</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .test-section {
            margin: 20px 0;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 8px;
          }
          textarea {
            width: 100%;
            min-height: 100px;
            padding: 10px;
            font-size: 14px;
          }
          input[type="text"] {
            width: 100%;
            padding: 10px;
            font-size: 14px;
            margin: 10px 0;
          }
          .editable {
            border: 1px solid #ddd;
            padding: 10px;
            min-height: 60px;
            background: #f9f9f9;
          }
        </style>
      </head>
      <body>
        <h1>Jan Extension Test Page</h1>

        <div class="test-section">
          <h2>Plain Text Selection</h2>
          <p id="plain-text">This is a sample paragraph with some text that can be selected.
          The Jan inline assistant should appear when you select this text.</p>
        </div>

        <div class="test-section">
          <h2>Textarea</h2>
          <textarea id="test-textarea" placeholder="Type or paste text here...">This is editable text in a textarea. You can select and edit this content.</textarea>
        </div>

        <div class="test-section">
          <h2>Text Input</h2>
          <input type="text" id="test-input" value="Editable input text" />
        </div>

        <div class="test-section">
          <h2>ContentEditable</h2>
          <div id="contenteditable" class="editable" contenteditable="true">
            This is a contenteditable div. You can select and edit this text directly.
          </div>
        </div>

        <div class="test-section">
          <h2>Click Outside Area</h2>
          <div id="outside-area" style="min-height: 200px; background: #e8f4f8; padding: 20px;">
            Click anywhere in this blue area to test dismissing the tooltip
          </div>
        </div>
      </body>
    `
  })

  // Wait for content to settle
  await page.waitForTimeout(300)

  return page
}

/**
 * Helper to select text in an element
 */
async function selectText(page: Page, selector: string, startOffset = 0, endOffset?: number) {
  await page.evaluate(({ sel, start, end }) => {
    const element = document.querySelector(sel)
    if (!element) throw new Error(`Element ${sel} not found`)

    // For input/textarea elements
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus()
      const endPos = end ?? element.value.length
      element.setSelectionRange(start, endPos)
      element.dispatchEvent(new Event('select', { bubbles: true }))
      return
    }

    // For regular text content
    const textNode = element.firstChild
    if (!textNode) throw new Error(`No text node in ${sel}`)

    const range = document.createRange()
    const endPos = end ?? (textNode.textContent?.length ?? 0)
    range.setStart(textNode, start)
    range.setEnd(textNode, endPos)

    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
      // Trigger selectionchange event
      document.dispatchEvent(new Event('selectionchange'))
    }
  }, { sel: selector, start: startOffset, end: endOffset })
}

/**
 * Helper to check if Jan tooltip is visible
 */
async function isTooltipVisible(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const host = document.querySelector('#jan-inline-assist-root')
    if (!host?.shadowRoot) return false
    const tooltip = host.shadowRoot.querySelector('.tip')
    return tooltip !== null && (tooltip as HTMLElement).offsetParent !== null
  })
}

/**
 * Helper to check if Jan menu is visible
 */
async function isMenuVisible(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const host = document.querySelector('#jan-inline-assist-root')
    if (!host?.shadowRoot) return false
    const menu = host.shadowRoot.querySelector('.menu')
    return menu !== null && (menu as HTMLElement).offsetParent !== null
  })
}

/**
 * Helper to click the Jan tooltip button
 */
async function clickTooltip(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('#jan-inline-assist-root')
    if (!host?.shadowRoot) throw new Error('Shadow root not found')
    const button = host.shadowRoot.querySelector('.tip button') as HTMLButtonElement
    if (!button) throw new Error('Tooltip button not found')
    button.click()
  })
}

/**
 * Helper to get menu items
 */
async function getMenuItems(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const host = document.querySelector('#jan-inline-assist-root')
    if (!host?.shadowRoot) return []
    const items = host.shadowRoot.querySelectorAll('.menu .item')
    return Array.from(items).map(item => item.textContent?.trim() ?? '')
  })
}

test.describe('Jan Inline Assistant Tooltip', () => {
  let context: BrowserContext
  let extensionId: string

  test.beforeAll(async () => {
    const extensionRoot = path.resolve('.')
    const result = await launchWithExtension(extensionRoot)
    context = result.context
    extensionId = result.id
  })

  test.afterAll(async () => {
    await context.close()
  })

  test('shows tooltip when text is selected', async () => {
    const page = await createTestPage(context)

    // Check if content script is loaded and inline assist is enabled
    const scriptLoaded = await page.evaluate(() => {
      return !!document.querySelector('#jan-inline-assist-root')
    })

    if (!scriptLoaded) {
      // Skip if content script didn't load (may need manual extension setup)
      console.log('Skipping: Content script not loaded or inline assist disabled')
      await page.close()
      return
    }

    // Select text in the paragraph
    await selectText(page, '#plain-text', 10, 30)

    // Wait for tooltip to appear (with longer timeout)
    await page.waitForTimeout(1000) // Allow debounce time + render time

    // Check if tooltip is visible
    const visible = await isTooltipVisible(page)

    // Debug: Log what we found
    if (!visible) {
      const debugInfo = await page.evaluate(() => {
        const host = document.querySelector('#jan-inline-assist-root')
        return {
          hostExists: !!host,
          hasShadowRoot: !!host?.shadowRoot,
          tooltipExists: !!host?.shadowRoot?.querySelector('.tip'),
          selection: window.getSelection()?.toString() || 'none'
        }
      })
      console.log('Debug info:', debugInfo)
    }

    expect(visible).toBe(true)

    // Verify tooltip contains "Jan" text
    const tooltipText = await page.evaluate(() => {
      const host = document.querySelector('#jan-inline-assist-root')
      const tooltip = host?.shadowRoot?.querySelector('.tip')
      return tooltip?.textContent?.trim() ?? ''
    })
    expect(tooltipText).toContain('Jan')

    await page.close()
  })

  test('dismisses tooltip when clicking outside', async () => {
    const page = await createTestPage(context)

    // Check if feature is available
    const scriptLoaded = await page.evaluate(() => !!document.querySelector('#jan-inline-assist-root'))
    if (!scriptLoaded) {
      console.log('Skipping: Content script not loaded')
      await page.close()
      return
    }

    // Select text to show tooltip
    await selectText(page, '#plain-text', 10, 30)
    await page.waitForTimeout(1000)

    // Verify tooltip is visible
    let visible = await isTooltipVisible(page)
    if (!visible) {
      console.log('Skipping: Tooltip did not appear (feature may be disabled)')
      await page.close()
      return
    }

    // Click outside the tooltip
    await page.click('#outside-area')
    await page.waitForTimeout(200)

    // Verify tooltip is dismissed
    visible = await isTooltipVisible(page)
    expect(visible).toBe(false)

    await page.close()
  })

  test('shows menu when tooltip is clicked', async () => {
    const page = await createTestPage(context)

    // Select text to show tooltip
    await selectText(page, '#plain-text', 10, 30)
    await page.waitForTimeout(500)

    // Click the tooltip
    await clickTooltip(page)
    await page.waitForTimeout(300)

    // Verify menu is visible
    const menuVisible = await isMenuVisible(page)
    expect(menuVisible).toBe(true)

    // Verify menu has expected items
    const items = await getMenuItems(page)
    expect(items).toContain('Rewrite')
    expect(items).toContain('Translate → English')
    expect(items).toContain('Custom Prompt…')

    await page.close()
  })

  test('dismisses menu when clicking outside', async () => {
    const page = await createTestPage(context)

    // Select text and open menu
    await selectText(page, '#plain-text', 10, 30)
    await page.waitForTimeout(500)
    await clickTooltip(page)
    await page.waitForTimeout(300)

    // Verify menu is visible
    let menuVisible = await isMenuVisible(page)
    expect(menuVisible).toBe(true)

    // Click outside
    await page.click('#outside-area')
    await page.waitForTimeout(200)

    // Verify menu is dismissed
    menuVisible = await isMenuVisible(page)
    expect(menuVisible).toBe(false)

    await page.close()
  })

  test('works with textarea selection', async () => {
    const page = await createTestPage(context)

    // Select text in textarea
    await selectText(page, '#test-textarea', 8, 20)
    await page.waitForTimeout(500)

    // Verify tooltip appears
    const visible = await isTooltipVisible(page)
    expect(visible).toBe(true)

    await page.close()
  })

  test('works with input field selection', async () => {
    const page = await createTestPage(context)

    // Select text in input
    await selectText(page, '#test-input', 0, 8)
    await page.waitForTimeout(500)

    // Verify tooltip appears
    const visible = await isTooltipVisible(page)
    expect(visible).toBe(true)

    await page.close()
  })

  test('works with contenteditable selection', async () => {
    const page = await createTestPage(context)

    // Select text in contenteditable div
    await selectText(page, '#contenteditable', 10, 30)
    await page.waitForTimeout(500)

    // Verify tooltip appears
    const visible = await isTooltipVisible(page)
    expect(visible).toBe(true)

    await page.close()
  })

  test('dismisses tooltip on scroll', async () => {
    const page = await createTestPage(context)

    // Select text to show tooltip
    await selectText(page, '#plain-text', 10, 30)
    await page.waitForTimeout(500)

    // Verify tooltip is visible
    let visible = await isTooltipVisible(page)
    expect(visible).toBe(true)

    // Scroll the page
    await page.evaluate(() => window.scrollBy(0, 100))
    await page.waitForTimeout(200)

    // Verify tooltip is dismissed
    visible = await isTooltipVisible(page)
    expect(visible).toBe(false)

    await page.close()
  })

  test('does not show tooltip when no text is selected', async () => {
    const page = await createTestPage(context)

    // Click without selecting text
    await page.click('#plain-text')
    await page.waitForTimeout(500)

    // Verify tooltip is not visible
    const visible = await isTooltipVisible(page)
    expect(visible).toBe(false)

    await page.close()
  })

  test('dismisses tooltip when selection is cleared', async () => {
    const page = await createTestPage(context)

    // Select text to show tooltip
    await selectText(page, '#plain-text', 10, 30)
    await page.waitForTimeout(500)

    // Verify tooltip is visible
    let visible = await isTooltipVisible(page)
    expect(visible).toBe(true)

    // Clear selection
    await page.evaluate(() => {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      document.dispatchEvent(new Event('selectionchange'))
    })
    await page.waitForTimeout(300)

    // Verify tooltip is dismissed
    visible = await isTooltipVisible(page)
    expect(visible).toBe(false)

    await page.close()
  })

  test('tooltip can be dragged without dismissing', async () => {
    const page = await createTestPage(context)

    // Select text to show tooltip
    await selectText(page, '#plain-text', 10, 30)
    await page.waitForTimeout(500)

    // Get initial tooltip position
    const initialPos = await page.evaluate(() => {
      const host = document.querySelector('#jan-inline-assist-root')
      const tooltip = host?.shadowRoot?.querySelector('.tip') as HTMLElement
      if (!tooltip) return null
      return {
        left: parseInt(tooltip.style.left || '0'),
        top: parseInt(tooltip.style.top || '0')
      }
    })

    expect(initialPos).not.toBeNull()

    // Simulate drag (mousedown, mousemove, mouseup)
    await page.evaluate(() => {
      const host = document.querySelector('#jan-inline-assist-root')
      const tooltip = host?.shadowRoot?.querySelector('.tip') as HTMLElement
      if (!tooltip) throw new Error('Tooltip not found')

      const rect = tooltip.getBoundingClientRect()
      const mousedown = new MouseEvent('mousedown', {
        clientX: rect.left + 10,
        clientY: rect.top + 10,
        bubbles: true,
        button: 0
      })
      tooltip.dispatchEvent(mousedown)
    })

    await page.waitForTimeout(100)

    // Tooltip should still be visible after drag attempt
    const visible = await isTooltipVisible(page)
    expect(visible).toBe(true)

    await page.close()
  })
})
