# ADR-001: Why React was chosen for the UI

## Status

Accepted

## Context

The UI for the Jan Browser, which includes the side panel and options page, needs to be dynamic and responsive to user input. The choice of a UI framework is a key decision that impacts development speed, performance, and maintainability.

## Decision

We chose to use **React** for building the user interface of the extension.

## Consequences

### Positive

- **Component-Based Architecture:** React's component-based architecture allows us to build encapsulated components that manage their own state, making the UI easier to develop, test, and maintain. This is evident in the project structure, with components like `Button`, `Input`, and `Textarea` in `ui/components`.
- **Rich Ecosystem:** React has a large and mature ecosystem of libraries and tools, which we are leveraging for UI components (Shadcn UI), state management, and other features.
- **Developer Experience:** The use of Vite with React provides a fast and efficient development environment with features like Hot Module Replacement (HMR).
- **Declarative UI:** React's declarative nature simplifies the process of creating interactive UIs. We describe what the UI should look like for any given state, and React will efficiently update and render just the right components when the data changes.

### Negative

- **Bundle Size:** While Vite does a good job of optimizing the build, React adds to the overall bundle size of the extension. However, for a feature-rich extension like this, the benefits of using React outweigh the cost of the increased bundle size.
- **Learning Curve:** For developers not familiar with React, there is a learning curve. However, given the popularity of React, it's a valuable skill for the team to have.
