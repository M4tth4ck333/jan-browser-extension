import path from 'path'
import os from 'os'
import fs from 'fs'
import { test, expect, chromium } from '@playwright/test'

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

test('loads options page', async () => {
  const extensionRoot = path.resolve('.')
  const { context, id } = await launchWithExtension(extensionRoot)
  const page = await context.newPage()
  await page.goto(`chrome-extension://${id}/dist/ui/options/index.html`)
  await expect(page.getByText('Jan Summarizer – Settings')).toBeVisible()
  await context.close()
})

test('loads side panel HTML directly', async () => {
  const extensionRoot = path.resolve('.')
  const { context, id } = await launchWithExtension(extensionRoot)
  const page = await context.newPage()
  await page.goto(`chrome-extension://${id}/dist/ui/sidepanel/index.html`)
  await expect(page.getByText(/What do you/i)).toBeVisible()
  await context.close()
})

