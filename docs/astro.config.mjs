// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightThemeRapide from "starlight-theme-rapide";
import starlightSidebarTopics from "starlight-sidebar-topics";
import react from "@astrojs/react";

import mermaid from "astro-mermaid";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://astro.build/config
export default defineConfig({
  // Deploy to the new v2 subdomain
  site: "https://docs.jan.ai/browser",
  integrations: [
    react(),
    mermaid({
      theme: "default",
      autoTheme: true,
    }),
    starlight({
      title: "👋 Jan",
      favicon: "favicon.ico",
      customCss: ["./src/styles/global.css"],
      head: [
        {
          tag: "script",
          attrs: { src: "/scripts/inject-navigation.js", defer: true },
        },
        {
          tag: "link",
          attrs: { rel: "stylesheet", href: "/styles/navigation.css" },
        },
      ],
      plugins: [
        starlightThemeRapide(),
        starlightSidebarTopics(
          [
            {
              label: "Jan",
              link: "https://docs.jan.ai",
              icon: "rocket",
            },
            {
              label: "Jan Desktop",
              link: "https://docs.jan.ai/jan/quickstart",
              icon: "rocket",
            },
            {
              label: "Browser Extension",
              link: "/browser/",
              badge: { text: "Alpha", variant: "tip" },
              icon: "puzzle",
              items: [
                { label: "Overview", slug: "browser" },
                { label: "Installation", slug: "browser/installation" },
                { label: "Usage Examples", slug: "browser/examples" },
                { label: "Configuration", slug: "browser/configuration" },
                { label: "MCP Bridge", slug: "browser/mcp-bridge" },
              ],
            },
            {
              label: "Jan Mobile",
              link: "/mobile/",
              badge: { text: "Soon", variant: "caution" },
              icon: "phone",
              items: [{ label: "Overview", slug: "mobile" }],
            },
            {
              label: "Jan Server",
              link: "/server/",
              badge: { text: "Soon", variant: "caution" },
              icon: "forward-slash",
              items: [{ label: "Overview", slug: "server" }],
            },
          ],
          {
            exclude: ["/api-reference", "/api-reference/**/*"],
          },
        ),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/menloresearch/jan",
        },
        {
          icon: "x.com",
          label: "X",
          href: "https://twitter.com/jandotai",
        },
        {
          icon: "discord",
          label: "Discord",
          href: "https://discord.com/invite/FTk2MvZwJH",
        },
      ],
    }),
  ],
});
