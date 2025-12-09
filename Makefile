# Jan Browser MCP - Build System
# ================================

.PHONY: all build-all build-extension build-server build-web build-shared clean help install

# Default target
all: build-all

# Help
help:
	@echo "Jan Browser MCP Build System"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  build-all        Build everything (extension + server + shared + web client)"
	@echo "  build-extension  Build the browser extension"
	@echo "  build-server     Build the MCP server"
	@echo "  build-shared     Build the shared types package"
	@echo "  build-web        Build the web client library (depends on shared)"
	@echo "  clean            Clean all build artifacts"
	@echo "  install          Install all dependencies"
	@echo ""

# Install all dependencies
install:
	@echo "Installing root dependencies..."
	npm install
	@echo "Installing MCP shared dependencies..."
	cd packages/mcp-shared && npm install
	@echo "Installing MCP server dependencies..."
	cd packages/mcp-server && npm install
	@echo "Installing MCP web client dependencies..."
	cd packages/mcp-web-client && npm install
	@echo "Done!"

# Build everything (shared must be built before server and web)
build-all: build-shared build-extension build-server build-web
	@echo "All builds complete!"

# Build shared types (must be built before server and web client)
build-shared:
	@echo "Building MCP shared types..."
	cd packages/mcp-shared && npm install && npm run build
	@echo "  Shared types built to packages/mcp-shared/dist/"

# Build browser extension
build-extension:
	@echo "Building browser extension..."
	@echo "  Installing dependencies..."
	npm install
	@echo "  Building popup UI with Vite..."
	npx vite build
	@echo "  Packaging extension..."
	@node -e "\
		const { cpSync, mkdirSync, rmSync, existsSync } = require('fs'); \
		const { resolve } = require('path'); \
		const targetDir = resolve(process.cwd(), 'dist'); \
		const uiBuildDir = resolve(process.cwd(), 'build/popup'); \
		if (!existsSync(uiBuildDir)) { throw new Error('Popup UI build not found'); } \
		if (existsSync(targetDir)) { rmSync(targetDir, { recursive: true, force: true }); } \
		mkdirSync(targetDir, { recursive: true }); \
		cpSync(resolve(process.cwd(), 'manifest.json'), resolve(targetDir, 'manifest.json')); \
		cpSync(resolve(process.cwd(), 'icons'), resolve(targetDir, 'icons'), { recursive: true }); \
		const copies = [ \
			['src/background', 'background'], \
			['src/content', 'content'], \
			['src/constants.js', 'constants.js'], \
			['src/lib', 'lib'], \
			['src/mcp-bridge.js', 'mcp-bridge.js'], \
			['src/mcp-tools', 'mcp-tools'], \
			['src/search', 'search'], \
		]; \
		for (const [from, to] of copies) { \
			cpSync(resolve(process.cwd(), from), resolve(targetDir, to), { recursive: true }); \
		} \
		cpSync(uiBuildDir, resolve(targetDir, 'popup'), { recursive: true }); \
		console.log('  Extension built to dist/'); \
	"

# Build browser extension for Firefox
build-extension-firefox:
	@echo "Building browser extension for Firefox..."
	@echo "  Installing dependencies..."
	npm install
	@echo "  Building popup UI with Vite..."
	npx vite build
	@echo "  Packaging extension..."
	@node -e "\
		const { cpSync, mkdirSync, rmSync, existsSync } = require('fs'); \
		const { resolve } = require('path'); \
		const targetDir = resolve(process.cwd(), 'dist-firefox'); \
		const uiBuildDir = resolve(process.cwd(), 'build/popup'); \
		if (!existsSync(uiBuildDir)) { throw new Error('Popup UI build not found'); } \
		if (existsSync(targetDir)) { rmSync(targetDir, { recursive: true, force: true }); } \
		mkdirSync(targetDir, { recursive: true }); \
		cpSync(resolve(process.cwd(), 'manifest.firefox.json'), resolve(targetDir, 'manifest.json')); \
		cpSync(resolve(process.cwd(), 'icons'), resolve(targetDir, 'icons'), { recursive: true }); \
		const copies = [ \
			['src/background', 'background'], \
			['src/content', 'content'], \
			['src/constants.js', 'constants.js'], \
			['src/lib', 'lib'], \
			['src/mcp-bridge.js', 'mcp-bridge.js'], \
			['src/mcp-tools', 'mcp-tools'], \
			['src/search', 'search'], \
		]; \
		for (const [from, to] of copies) { \
			cpSync(resolve(process.cwd(), from), resolve(targetDir, to), { recursive: true }); \
		} \
		cpSync(uiBuildDir, resolve(targetDir, 'popup'), { recursive: true }); \
		console.log('  Extension built to dist-firefox/'); \
	"

# Build MCP server (depends on shared)
build-server: build-shared
	@echo "Building MCP server..."
	cd packages/mcp-server && npm install && npm run build
	@echo "  MCP server built to packages/mcp-server/dist/"

# Build web client library (depends on shared)
build-web: build-shared
	@echo "Building MCP web client..."
	cd packages/mcp-web-client && npm install && npm run build
	@echo "  Web client built to packages/mcp-web-client/dist/"

# Clean all build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist dist-firefox build
	rm -rf packages/mcp-shared/dist
	rm -rf packages/mcp-server/dist
	rm -rf packages/mcp-web-client/dist
	@echo "Done!"
