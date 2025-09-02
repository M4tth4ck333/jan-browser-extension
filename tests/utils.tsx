import React from 'react'
import { render } from '@testing-library/react'
import * as Tooltip from '@radix-ui/react-tooltip'

export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      {ui}
    </Tooltip.Provider>
  )
}

