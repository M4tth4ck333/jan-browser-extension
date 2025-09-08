# Jan Browser Extension Documentation

This documentation site is built with [Starlight](https://starlight.astro.build) and mirrors the main [Jan documentation](https://docs.jan.ai) structure for consistency across the Jan ecosystem.

## 🎯 For Jan Browser Extension Developers

**Focus Area**: Work primarily in `./docs/src/content/docs/browser/` - this is where all Jan Browser Extension-specific documentation lives.

The navigation automatically routes to the main Jan docs:
- **"Docs"** → `https://docs.jan.ai`
- **"API Reference"** → `https://docs.jan.ai/api`

### Adding New Documentation

1. **Create files** in `./docs/src/content/docs/browser/`
2. **Update sidebar** in `astro.config.mjs` under the "Browser Extension" section:

```js
{
  label: "Browser Extension",
  items: [
    { label: "Overview", slug: "browser" },
    { label: "Your New Page", slug: "browser/your-new-page" }, // Add here
    // ... existing items
  ],
}
```

## 🧞 Commands

All commands run from the `./docs/` directory:

| Command               | Action                                    |
| :-------------------- | :---------------------------------------- |
| `bun install`         | Install dependencies                      |
| `bun dev`             | Start dev server at `localhost:4321`     |
| `bun build`           | Build production site to `./dist/`       |
| `bun preview`         | Preview build locally                     |

**⚠️ Important**: After running `bun dev`, manually navigate to `http://localhost:4321/browser/` since the main index page doesn't exist in this repo (it's in the main Jan repository).

## 📁 Structure

```
docs/
├── src/content/docs/
│   └── browser/          ← Your work goes here
├── astro.config.mjs      ← Update sidebar here
└── public/
    ├── scripts/
    └── styles/
```

## 🔗 Navigation

The site automatically includes navigation that links back to the main Jan documentation ecosystem. This ensures users can easily move between Jan Desktop docs, API Reference, and Jan Browser Extension docs.

## 📝 Writing Guidelines

- Use clear, concise language
- Include code examples where helpful
- Follow the existing documentation patterns from the main Jan docs
- Test your changes with `bun dev` before committing

For questions about the documentation structure or navigation, refer to the main [Jan documentation repository](https://github.com/menloresearch/jan).