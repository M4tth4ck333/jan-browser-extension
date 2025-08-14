# ADR-003: Why Chrome Storage was used for settings

## Status

Accepted

## Context

The Jan Browser Extension requires storing user-specific settings, such as the API base URL, API key, and model preferences. This information needs to be persisted across browser sessions and, ideally, across different devices.

## Decision

We chose to use **`chrome.storage.sync`** to store the user's settings.

## Consequences

### Positive

- **Cross-Device Syncing:** `chrome.storage.sync` automatically syncs the user's settings across all their devices where they are logged into their Google account and have the extension installed. This provides a seamless user experience, as the user only needs to configure the extension once.
- **Secure Storage:** While not encrypted, `chrome.storage.sync` is a secure way to store user settings within the browser's managed storage. It is more secure than using `localStorage`, which is accessible to content scripts and can be vulnerable to XSS attacks.
- **Asynchronous API:** The `chrome.storage` API is asynchronous, which means it does not block the main thread of the extension, ensuring a responsive UI.
- **Easy to Use:** The API is simple and easy to use, with `get` and `set` methods for reading and writing data.

### Negative

- **Storage Limits:** `chrome.storage.sync` has storage limits (100KB total, 8KB per item). However, these limits are more than sufficient for storing the settings of this extension.
- **No Encryption:** The data is not encrypted at rest. While this is a limitation, the data we are storing (API keys and settings) is not considered highly sensitive in the context of a local-first AI assistant, and the `README.md` advises users to be cautious. For a production-grade application with more sensitive data, a more secure storage mechanism would be required.
