# Fix MenuDetailIsland SSR `window is not defined` Error

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `window is not defined` SSR error in the menu detail page by preventing server-side rendering of the MenuDetailIsland component.

**Architecture:** `detail.astro` uses `prerender = true` + `client:load`, which causes Astro to run the React component on the server during static generation. Since `MenuDetailIsland` reads `window.location.search` directly in its render body (line 24), it crashes on the server. Switching to `client:only="react"` skips SSR for the island entirely.

**Tech Stack:** Astro, React, TypeScript

---

### Task 1: Switch `client:load` to `client:only="react"` in detail.astro

**Files:**
- Modify: `apps/ui/src/pages/dash/menus/detail.astro:8`

- [ ] **Step 1: Verify current state**

  Open `apps/ui/src/pages/dash/menus/detail.astro` and confirm line 8 reads:
  ```astro
  <MenuDetailIsland client:load />
  ```

- [ ] **Step 2: Apply the fix**

  Change line 8 to:
  ```astro
  <MenuDetailIsland client:only="react" />
  ```

  Full file after change:
  ```astro
  ---
  export const prerender = true;
  import DashboardLayout from '../../../layouts/DashboardLayout.astro';
  import MenuDetailIsland from '../../../components/dash/menus/MenuDetailIsland';
  ---

  <DashboardLayout>
    <MenuDetailIsland client:only="react" />
  </DashboardLayout>
  ```

- [ ] **Step 3: Verify the dev server no longer errors**

  Run from repo root:
  ```bash
  pnpm dev
  ```
  Navigate to `http://localhost:4321/dash/menus/detail?id=<any-valid-menu-id>`.

  Expected: No `window is not defined` error in the terminal. Menu detail page renders correctly.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/ui/src/pages/dash/menus/detail.astro
  git commit -m "fix(ui): use client:only to prevent SSR of MenuDetailIsland"
  ```
