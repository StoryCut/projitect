import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import mdx from "@astrojs/mdx"

export default defineConfig({
  site: "https://projitect.dev",
  integrations: [
    starlight({
      title: "projitect",
      description:
        "Project scaffolding that stays in sync. Like Terraform, for your frontend repo.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/kapilkale/projitect" }],
      sidebar: [
        {
          label: "Start here",
          autogenerate: { directory: "docs", collapsed: false },
        },
        {
          label: "Examples",
          autogenerate: { directory: "examples" },
        },
        {
          label: "Errors",
          autogenerate: { directory: "errors" },
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
    mdx(),
  ],
})
