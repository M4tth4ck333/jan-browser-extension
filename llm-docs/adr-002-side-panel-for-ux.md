# ADR-002: Why the Side Panel was used for the UX

## Status

Accepted

## Context

The Jan Browser needs a user interface to display the summary of the current page and to provide controls for the user to interact with the extension. The choice of how to present this UI is critical for the user experience.

## Decision

We chose to use the **Side Panel** feature of Chrome Extensions (Manifest V3) as the primary user interface for the app.

## Consequences

### Positive

- **Persistent UI:** Unlike popups, the side panel remains open while the user interacts with the page. This allows the user to read the summary while also viewing the original content, which is a core feature of the extension.
- **Improved User Experience:** The side panel provides a larger and more flexible space for displaying content compared to a popup. This is ideal for displaying potentially long summaries and for providing a more complex UI with settings and other controls.
- **Modern and Integrated Feel:** The side panel is a modern feature of Chrome extensions that provides a more integrated feel with the browser, as opposed to a popup that can feel like a separate window.
- **Easy Access:** The extension can be pinned to the toolbar, and the side panel can be opened with a single click.

### Negative

- **Browser Support:** The Side Panel API is a relatively new feature and may not be supported in all Chromium-based browsers. However, it is supported in Google Chrome, which is our primary target.
- **Less Discoverable than Popups:** Some users might be more familiar with popups and might not immediately discover the side panel. However, this can be mitigated with good onboarding and a clear icon.
