# MyMDEditor

A lightweight Windows Forms desktop application for writing and previewing Markdown (`.md`) files, with a live, GitHub-style HTML preview — similar to editing in Word, but for Markdown.

> **Tool developed for personal use only, for the preparation of Markdown content.**
> Developed by **Dawood Ali**.

---

## Features

- **Split-view editor**: raw Markdown on the left, rendered HTML preview on the right, resizable via a drag splitter.
- **Live preview**: the preview updates automatically as you type, with debounced (400ms) asynchronous rendering so the UI never freezes, even on large documents.
- **GitHub-style rendering**: powered by [Markdig](https://github.com/xoofx/markdig) with advanced extensions (tables, task lists, emoji, etc.) and CSS styled to closely resemble GitHub's Markdown rendering.
- **Word-style formatting toolbar** — no need to remember Markdown syntax:
  - Bold, Italic, Strikethrough
  - Heading 1 / 2 / 3
  - Bulleted list, Numbered list, Blockquote
  - Inline code, Code block
  - Link insertion
  - Horizontal rule
  - Table skeleton
- **Standard editing shortcuts** that just work: `Ctrl+Z` / `Ctrl+Y` (Undo/Redo), `Ctrl+X` / `Ctrl+C` / `Ctrl+V` (Cut/Copy/Paste), `Ctrl+A` (Select All), `Ctrl+B` / `Ctrl+I` (Bold/Italic), `Ctrl+K` (Insert Link).
- **Plain-text paste**: pasted content is normalized to plain Unicode text with consistent line endings, avoiding the "garbled symbol" issue common when pasting rich content into a `RichTextBox`.
- **File management**: Open, Save, and Save As for `.md` files, with unsaved-changes prompting on close.
- **Modern dark theme**: VS Code-inspired color palette across the menu, toolbar, and editor pane.

## Screenshots

*(Add screenshots of the editor + live preview here.)*

## Getting Started

### Prerequisites

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (pre-installed on most modern Windows systems)

### Build & Run

```powershell
git clone https://github.com/dawood-myob/MyMDEditor.git
cd MyMDEditor/MyMDEditor
dotnet build
dotnet run
```

Or open `MyMDEditor.sln` / the project in Visual Studio 2022+ and press **F5**.

## Project Structure

```
MyMDEditor/
??? MarkdownEditorForm.cs            # Main form: editor UI, event wiring, formatting logic
??? MarkdownEditorForm.Designer.cs   # Designer-generated layout, theme, and controls
??? MarkdownEditorForm.resx          # Form resources
??? Program.cs                       # Application entry point
??? Services/
    ??? IMarkdownRenderingService.cs   # Markdown ? HTML rendering contract
    ??? MarkdownRenderingService.cs    # Markdig-based renderer with GitHub-style CSS
    ??? IFileManagementService.cs      # File open/save contract
    ??? FileManagementService.cs       # Async file I/O implementation
    ??? Debouncer.cs                   # Timer-based debounce helper for live preview
```

## How It Works

1. Typing in the editor (`RichTextBox`) raises a `TextChanged` event.
2. A `Debouncer` delays rendering until 400ms of inactivity, avoiding excessive re-renders while typing.
3. `MarkdownRenderingService` converts the current Markdown text to HTML on a background thread using Markdig, wrapped with GitHub-style CSS.
4. The rendered HTML is pushed into a `WebView2` control via `NavigateToString`, updating the preview pane without blocking the UI thread.
5. Any in-flight render is cancelled via `CancellationToken` if newer keystrokes arrive, ensuring only the latest content is rendered.

## Key Packages

| Package | Purpose |
|---|---|
| [`Markdig`](https://www.nuget.org/packages/Markdig) | Markdown parsing and HTML rendering |
| [`Microsoft.Web.WebView2`](https://www.nuget.org/packages/Microsoft.Web.WebView2) | Embedded Chromium-based HTML preview rendering |

## License / Usage

This tool was built for **personal use** to speed up the preparation of Markdown content (documentation, notes, conversation logs, etc.). Feel free to fork and adapt for your own personal use.
