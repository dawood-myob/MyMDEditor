using MyMDEditor.Infrastructure;
using MyMDEditor.Services;
using MyMDEditor.Services.Editing;
using MyMDEditor.UI;

namespace MyMDEditor
{
    public sealed partial class MarkdownEditorForm
    {
        private static readonly string[] HeadingPrefixes = { "# ", "## ", "### ", "#### ", "##### ", "###### " };

        private RibbonButton? _viewEditorButton;
        private RibbonButton? _viewSplitButton;
        private RibbonButton? _viewPreviewButton;
        private RibbonButton? _outlineButton;
        private RibbonButton? _wrapButton;
        private RibbonButton? _themeDarkButton;
        private RibbonButton? _themeLightButton;
        private RibbonButton? _themeSystemButton;
        private readonly PaneSwitcher _paneSwitcher = new();

        // ---------------------------------------------------------------- Ribbon

        private RibbonButton AddCommand(RibbonGroup group, string caption, string glyph, bool large, Action action,
            string? tooltip = null, GlyphKind kind = GlyphKind.Icon, bool refocusEditor = true)
        {
            var button = new RibbonButton(caption, glyph, large, kind);
            button.Click += (_, _) =>
            {
                action();
                if (refocusEditor && _active is not null)
                {
                    _active.Editor.Focus();
                }
            };
            return _ribbon.AddButton(group, button, tooltip ?? caption);
        }

        private void BuildRibbon()
        {
            var home = _ribbon.AddPage("Home");
            var file = home.AddGroup("File");
            AddCommand(file, "New", "\uE710", true, () => _ = NewDocumentAsync(), "New tab (Ctrl+T)", refocusEditor: false);
            AddCommand(file, "Open", "\uE8E5", true, () => _ = OpenDocumentAsync(), "Open file (Ctrl+O)", refocusEditor: false);
            AddCommand(file, "Save", "\uE74E", true, () => _ = SaveDocumentAsync(), "Save (Ctrl+S)", refocusEditor: false);
            AddCommand(file, "Save As", "\uE792", false, () => _ = SaveDocumentAsAsync(), "Save As (Ctrl+Shift+S)", refocusEditor: false);
            _ribbon.AddButton(file, new RibbonButton("Recent", "\uE81C", false) { DropDown = _recentMenu }, "Recent files");
            AddCommand(file, "Close Tab", "\uE711", false, () => _ = CloseDocumentAsync(_active), "Close tab (Ctrl+W)", refocusEditor: false);

            var edit = home.AddGroup("Edit");
            AddCommand(edit, "Undo", "\uE7A7", false, () => _editor.Undo(), "Undo (Ctrl+Z)");
            AddCommand(edit, "Redo", "\uE7A6", false, () => _editor.Redo(), "Redo (Ctrl+Y)");
            AddCommand(edit, "Select All", "\uE8B3", false, () => _editor.SelectAll(), "Select all (Ctrl+A)");

            var format = home.AddGroup("Format");
            AddCommand(format, "Bold", "B", false, () => WrapSelection("**"), "Bold (Ctrl+B)", GlyphKind.Bold);
            AddCommand(format, "Italic", "I", false, () => WrapSelection("_"), "Italic (Ctrl+I)", GlyphKind.Italic);
            AddCommand(format, "Strike", "S", false, () => WrapSelection("~~"), "Strikethrough", GlyphKind.Strike);
            AddCommand(format, "Code", "</>", false, () => WrapSelection("`"), "Inline code", GlyphKind.Mono);
            AddCommand(format, "Link", "\uE71B", false, InsertLink, "Insert link (Ctrl+K)");

            var paragraph = home.AddGroup("Paragraph");
            AddCommand(paragraph, "Heading 1", "H1", false, () => ApplyHeading(1), "Heading 1", GlyphKind.Text);
            AddCommand(paragraph, "Heading 2", "H2", false, () => ApplyHeading(2), "Heading 2", GlyphKind.Text);
            AddCommand(paragraph, "Heading 3", "H3", false, () => ApplyHeading(3), "Heading 3", GlyphKind.Text);
            AddCommand(paragraph, "Bullets", "\u2022", false, () => ApplyLinePrefix("- ", "* ", "+ ", "- [ ] "), "Bulleted list", GlyphKind.Text);
            AddCommand(paragraph, "Numbered", "1.", false, ApplyNumbering, "Numbered list", GlyphKind.Text);
            AddCommand(paragraph, "Tasks", "\uE739", false, () => ApplyLinePrefix("- [ ] ", "- ", "* ", "+ "), "Task list");
            AddCommand(paragraph, "Quote", "\u201D", false, () => ApplyLinePrefix("> "), "Block quote", GlyphKind.Text);
            AddCommand(paragraph, "Indent", "\u2192", false, () => ApplyIndent(outdent: false), "Indent (Tab)", GlyphKind.Text);
            AddCommand(paragraph, "Outdent", "\u2190", false, () => ApplyIndent(outdent: true), "Outdent (Shift+Tab)", GlyphKind.Text);

            var find = home.AddGroup("Find");
            AddCommand(find, "Find", "\uE721", true, () => ShowFind(withReplace: false), "Find (Ctrl+F)", refocusEditor: false);
            AddCommand(find, "Replace", "\uE8EF", true, () => ShowFind(withReplace: true), "Replace (Ctrl+H)", refocusEditor: false);

            var insert = _ribbon.AddPage("Insert");
            var elements = insert.AddGroup("Elements");
            AddCommand(elements, "Link", "\uE71B", true, InsertLink, "Insert link (Ctrl+K)");
            AddCommand(elements, "Image", "\uE91B", true, InsertImage, "Insert image");
            AddCommand(elements, "Table", "\uE80A", true, InsertTable, "Insert table");
            AddCommand(elements, "Code Block", "\uE943", true, InsertCodeBlock, "Insert fenced code block");
            AddCommand(elements, "Divider", "\u2014", true, () => InsertSnippet("\n\n---\n\n"), "Insert horizontal rule", GlyphKind.Text);

            var view = _ribbon.AddPage("View");
            var layout = view.AddGroup("Layout");
            _viewEditorButton = AddCommand(layout, "Editor", "\uE70F", true, () => SetViewMode("editor"), "Editor only", refocusEditor: false);
            _viewSplitButton = AddCommand(layout, "Split", "\u25E7", true, () => SetViewMode("split"), "Editor and preview", GlyphKind.Text, refocusEditor: false);
            _viewPreviewButton = AddCommand(layout, "Preview", "\uE7B3", true, () => SetViewMode("preview"), "Preview only", refocusEditor: false);
            AddCommand(layout, "Rotate", "\uE8AB", true, () => SetSplitOrientation(!_layout.EditorPreviewSideBySide), "Switch between side-by-side and stacked", refocusEditor: false);

            BuildRibbonPaneMenus();
            var panes = view.AddGroup("Panes");
            _ribbon.AddButton(panes, new RibbonButton("Dock", "\uE70D", true) { DropDown = _ribbonDockMenu }, "Dock a pane to the left, right, top or bottom");
            _ribbon.AddButton(panes, new RibbonButton("Minimise", "\uE921", false) { DropDown = _minimiseMenu }, "Minimise a pane to a rail (Ctrl+Shift+M)");
            _ribbon.AddButton(panes, new RibbonButton("Maximise", "\uE922", false) { DropDown = _maximiseMenu }, "Maximise or restore a pane (Ctrl+Shift+Enter)");
            AddCommand(panes, "Swap", "\uE8AB", false, () => ExecuteLayout(l => l.Swap(PaneId.Editor, PaneId.Preview)), "Swap the Editor and Preview panes", refocusEditor: false);
            AddCommand(panes, "Reset Layout", "\uE777", false, ResetLayout, "Restore the default pane layout (Ctrl+Alt+0)", refocusEditor: false);

            var show = view.AddGroup("Show");
            _outlineButton = AddCommand(show, "Outline", "\uE700", true, () => TogglePane(PaneId.Outline), "Toggle document outline (Ctrl+Alt+1)", refocusEditor: false);
            _wrapButton = AddCommand(show, "Word Wrap", "\u21B5", true, () => SetWordWrap(!_settings.WordWrap), "Toggle word wrap", GlyphKind.Text);

            var zoom = view.AddGroup("Zoom");
            AddCommand(zoom, "Zoom In", "\uE8A3", false, () => Zoom(10), "Zoom in (Ctrl++)");
            AddCommand(zoom, "Zoom Out", "\uE71F", false, () => Zoom(-10), "Zoom out (Ctrl+-)");
            AddCommand(zoom, "Reset", "100", false, () => Zoom(0, reset: true), "Reset zoom (Ctrl+0)", GlyphKind.Text);

            var theme = view.AddGroup("Theme");
            _themeDarkButton = AddCommand(theme, "Dark", "\uE708", false, () => SetTheme("dark"), "Dark theme", refocusEditor: false);
            _themeLightButton = AddCommand(theme, "Light", "\uE706", false, () => SetTheme("light"), "Light theme", refocusEditor: false);
            _themeSystemButton = AddCommand(theme, "System", "\uE770", false, () => SetTheme("system"), "Follow system theme", refocusEditor: false);

            var navigate = view.AddGroup("Navigate");
            AddCommand(navigate, "Headings", "#", true, () => ShowQuickJump(commandMode: false), "Go to heading (Ctrl+P)", GlyphKind.Text, refocusEditor: false);
            AddCommand(navigate, "Commands", "\uE756", true, () => ShowQuickJump(commandMode: true), "Command palette (Ctrl+Shift+P)", refocusEditor: false);

            var export = _ribbon.AddPage("Export");
            var formats = export.AddGroup("Export As");
            AddCommand(formats, "HTML", "HTML", true, () => _ = ExportHtmlAsync(), "Export as HTML", GlyphKind.Text, refocusEditor: false);
            AddCommand(formats, "Word", "DOCX", true, () => _ = ExportDocxAsync(), "Export as Word document", GlyphKind.Text, refocusEditor: false);
            AddCommand(formats, "PDF", "PDF", true, () => _ = ExportPdfAsync(), "Export as PDF", GlyphKind.Text, refocusEditor: false);

            var help = _ribbon.AddPage("Help");
            var guide = help.AddGroup("Guide");
            AddCommand(guide, "User Guide", "\uE897", true, () => ShowHelp("Getting started"), "How to use MyMDEditor (F1)", refocusEditor: false);
            AddCommand(guide, "Shortcuts", "\uE765", true, () => ShowHelp("Keyboard shortcuts"), "Keyboard shortcuts", refocusEditor: false);
            AddCommand(guide, "Tabs & Layout", "\uE8A1", true, () => ShowHelp("Tabs and files"), "Working with tabs and panes", refocusEditor: false);
            var about = help.AddGroup("About");
            AddCommand(about, "About", "\uE946", true, () => ShowHelp("About"), "About MyMDEditor and its developer", refocusEditor: false);
            AddCommand(about, "Developer", "\uE774", true, OpenDeveloperWebsite, $"{HelpDialog.DeveloperName} \u2013 {HelpDialog.DeveloperSite}", refocusEditor: false);

            const string lastPane = "Keep at least one pane visible";
            _paneSwitcher.Add("\uE700", "Outline", "Show or hide the document outline (Ctrl+Alt+1)", lastPane);
            _paneSwitcher.Add("\uE70F", "Editor", "Show or hide the Markdown editor (Ctrl+Alt+2)", lastPane);
            _paneSwitcher.Add("\uE7B3", "Preview", "Show or hide the live preview (Ctrl+Alt+3)", lastPane);
            _paneSwitcher.SegmentClicked += index =>
            {
                if (Enum.IsDefined(typeof(PaneId), index))
                {
                    TogglePane((PaneId)index);
                }
            };
            _ribbon.SetHeaderSwitcher(_paneSwitcher);

            _ribbon.Finish();
        }

        private void ShowHelp(string topic)
        {
            using var dialog = new HelpDialog(_palette, topic) { Icon = Icon };
            dialog.ShowDialog(this);
            _active?.Editor.Focus();
        }

        private static void OpenDeveloperWebsite()
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(HelpDialog.DeveloperUrl) { UseShellExecute = true });
            }
            catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
            {
                AppLogger.Error("Could not open developer website", ex);
            }
        }

        private void UpdateRibbonState()
        {
            if (_viewEditorButton is null)
            {
                return;
            }

            foreach (var pane in PaneLayoutState.AllPanes)
            {
                var shown = _layout.IsShown(pane);
                _paneSwitcher.SetState((int)pane, shown, enabled: !shown || _layout.CanHide(pane));
            }

            var viewMode = _layout.LegacyViewMode;
            _viewEditorButton.Checked = viewMode == "editor";
            _viewSplitButton!.Checked = viewMode == "split";
            _viewPreviewButton!.Checked = viewMode == "preview";
            _outlineButton!.Checked = _layout.IsShown(PaneId.Outline);
            _wrapButton!.Checked = _settings.WordWrap;
            _themeDarkButton!.Checked = _settings.Theme == "dark";
            _themeLightButton!.Checked = _settings.Theme == "light";
            _themeSystemButton!.Checked = _settings.Theme is not ("dark" or "light");
        }

        // ---------------------------------------------------------------- Formatting commands

        private void ApplyLinePrefix(string prefix, params string[] exclusivePrefixes)
        {
            var edit = LineOperations.PrefixLines(_editor.Text, _editor.SelectionStart, _editor.SelectionLength, prefix,
                exclusivePrefixes.Length == 0 ? null : exclusivePrefixes);
            ApplyEdit(edit, selectWholeEdit: true);
        }

        private void ApplyHeading(int level) => ApplyLinePrefix(new string('#', level) + " ", HeadingPrefixes);

        private void ApplyNumbering()
        {
            var edit = LineOperations.NumberLines(_editor.Text, _editor.SelectionStart, _editor.SelectionLength);
            ApplyEdit(edit, selectWholeEdit: true);
        }

        /// <summary>Replaces the selection with <paramref name="text"/> and optionally selects part of it.</summary>
        private void InsertSnippet(string text, int selectOffset = -1, int selectLength = 0)
        {
            var start = _editor.SelectionStart;
            _editor.SelectedText = text;
            if (selectOffset >= 0)
            {
                _editor.SelectionStart = start + selectOffset;
                _editor.SelectionLength = selectLength;
            }
            else
            {
                _editor.SelectionStart = start + text.Length;
                _editor.SelectionLength = 0;
            }
        }

        private void InsertImage()
        {
            var alt = string.IsNullOrEmpty(_editor.SelectedText) ? "alt text" : _editor.SelectedText;
            const string placeholder = "path/to/image.png";
            InsertSnippet($"![{alt}]({placeholder})", alt.Length + 4, placeholder.Length);
        }

        private void InsertTable() =>
            InsertSnippet("| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n");

        private void InsertCodeBlock()
        {
            var selected = _editor.SelectedText;
            InsertSnippet($"```\n{selected}\n```\n", 4, selected.Length);
        }
    }
}
