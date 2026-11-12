using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using MyMDEditor.Infrastructure;
using MyMDEditor.Services;
using MyMDEditor.Services.Editing;
using MyMDEditor.Services.Export;
using MyMDEditor.Services.Search;
using MyMDEditor.UI;

namespace MyMDEditor
{
    /// <summary>
    /// Main editor window: a Markdown source editor with a live, synchronised preview,
    /// full-text search, a document outline and professional editing conveniences.
    /// </summary>
    public sealed class MarkdownEditorForm : Form
    {
        private readonly IFileManagementService _fileService = new FileManagementService();
        private readonly IMarkdownRenderingService _renderer = new MarkdownRenderingService();
        private readonly ISettingsService _settingsService = new SettingsService();
        private readonly RecoveryService _recovery = new();
        private readonly Debouncer _renderDebouncer = new(250);
        private readonly Debouncer _recoveryDebouncer = new(2000);
        private readonly System.Windows.Forms.Timer _caretTimer = new() { Interval = 120 };
        private readonly System.Windows.Forms.Timer _autoSaveTimer = new() { Interval = 30_000 };

        private readonly MenuStrip _menu = new();
        private readonly ToolStrip _toolbar = new();
        private readonly StatusStrip _statusStrip = new();
        private readonly ToolStripStatusLabel _statusPosition = new("Ln 1, Col 1");
        private readonly ToolStripStatusLabel _statusStats = new("0 words");
        private readonly ToolStripStatusLabel _statusEncoding = new("UTF-8");
        private readonly ToolStripStatusLabel _statusModified = new(string.Empty) { Spring = false };

        private readonly SplitContainer _outerSplit = new() { Orientation = Orientation.Vertical, FixedPanel = FixedPanel.Panel1 };
        private readonly SplitContainer _innerSplit = new() { Orientation = Orientation.Vertical };

        private readonly TreeView _outlineTree = new() { Dock = DockStyle.Fill, HideSelection = false, BorderStyle = BorderStyle.None };
        private readonly RichTextBox _editor = new()
        {
            Dock = DockStyle.Fill,
            Font = new Font("Consolas", 11F),
            BorderStyle = BorderStyle.None,
            AcceptsTab = true,
            HideSelection = false,
            WordWrap = true,
        };
        private readonly FindBar _findBar = new() { Dock = DockStyle.Top, Visible = false };
        private readonly WebView2 _preview = new() { Dock = DockStyle.Fill };

        private AppSettings _settings = new();
        private ThemePalette _palette = ThemePalette.Dark;
        private IReadOnlyList<OutlineEntry> _outline = Array.Empty<OutlineEntry>();
        private string _outlineSignature = string.Empty;
        private SearchSession? _search;
        private bool _previewReady;
        private bool _suppressTextEvents;
        private bool _closing;
        private int _lastCaretLine = -1;
        private CancellationTokenSource _renderCts = new();

        public MarkdownEditorForm(string? filePathToOpen)
        {
            AppLogger.Initialise();
            Text = "MyMDEditor";
            Width = 1200;
            Height = 800;
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;

            _settings = _settingsService.Load();
            _palette = ThemePalette.Resolve(_settings.Theme);

            BuildMenu();
            BuildToolbar();
            BuildStatusBar();
            BuildLayout();
            WireEvents();
            ApplyTheme();
            ApplyWindowPlacement();

            Load += async (_, _) => await OnFormLoadAsync(filePathToOpen).ConfigureAwait(true);
            FormClosing += OnFormClosing;
        }

        // ---------------------------------------------------------------- Layout

        private void BuildMenu()
        {
            var file = new ToolStripMenuItem("&File");
            file.DropDownItems.Add("&New", null, async (_, _) => await NewDocumentAsync());
            file.DropDownItems.Add("&Open...", null, async (_, _) => await OpenDocumentAsync());
            _recentMenu = new ToolStripMenuItem("Open &Recent");
            file.DropDownItems.Add(_recentMenu);
            file.DropDownItems.Add(new ToolStripSeparator());
            file.DropDownItems.Add("&Save", null, async (_, _) => await SaveDocumentAsync());
            file.DropDownItems.Add("Save &As...", null, async (_, _) => await SaveDocumentAsAsync());
            file.DropDownItems.Add(new ToolStripSeparator());
            var export = new ToolStripMenuItem("&Export");
            export.DropDownItems.Add("As &HTML...", null, async (_, _) => await ExportHtmlAsync());
            export.DropDownItems.Add("As &Word Document (.docx)...", null, async (_, _) => await ExportDocxAsync());
            export.DropDownItems.Add("As &PDF...", null, async (_, _) => await ExportPdfAsync());
            file.DropDownItems.Add(export);
            file.DropDownItems.Add(new ToolStripSeparator());
            file.DropDownItems.Add("E&xit", null, (_, _) => Close());

            var edit = new ToolStripMenuItem("&Edit");
            edit.DropDownItems.Add("&Undo", null, (_, _) => { if (_editor.CanUndo) _editor.Undo(); });
            edit.DropDownItems.Add("&Redo", null, (_, _) => { if (_editor.CanRedo) _editor.Redo(); });
            edit.DropDownItems.Add(new ToolStripSeparator());
            edit.DropDownItems.Add("&Find...", null, (_, _) => ShowFind(withReplace: false));
            edit.DropDownItems.Add("&Replace...", null, (_, _) => ShowFind(withReplace: true));
            edit.DropDownItems.Add("Find &Next", null, (_, _) => FindNext());
            edit.DropDownItems.Add("Find &Previous", null, (_, _) => FindPrevious());
            edit.DropDownItems.Add(new ToolStripSeparator());
            edit.DropDownItems.Add("Select &All", null, (_, _) => _editor.SelectAll());

            var view = new ToolStripMenuItem("&View");
            _outlineToggle = new ToolStripMenuItem("Document &Outline") { CheckOnClick = true, Checked = _settings.ShowOutline };
            _outlineToggle.CheckedChanged += (_, _) => SetOutlineVisible(_outlineToggle.Checked);
            view.DropDownItems.Add(_outlineToggle);
            _wordWrapToggle = new ToolStripMenuItem("&Word Wrap") { CheckOnClick = true, Checked = _settings.WordWrap };
            _wordWrapToggle.CheckedChanged += (_, _) => { _editor.WordWrap = _wordWrapToggle.Checked; _settings.WordWrap = _wordWrapToggle.Checked; };
            view.DropDownItems.Add(_wordWrapToggle);
            view.DropDownItems.Add(new ToolStripSeparator());
            var theme = new ToolStripMenuItem("&Theme");
            _themeDarkMenuItem = new ToolStripMenuItem("&Dark") { CheckOnClick = false };
            _themeDarkMenuItem.Click += (_, _) => SetTheme("dark");
            _themeLightMenuItem = new ToolStripMenuItem("&Light") { CheckOnClick = false };
            _themeLightMenuItem.Click += (_, _) => SetTheme("light");
            _themeSystemMenuItem = new ToolStripMenuItem("&System") { CheckOnClick = false };
            _themeSystemMenuItem.Click += (_, _) => SetTheme("system");
            theme.DropDownItems.Add(_themeDarkMenuItem);
            theme.DropDownItems.Add(_themeLightMenuItem);
            theme.DropDownItems.Add(_themeSystemMenuItem);
            view.DropDownItems.Add(theme);
            view.DropDownItems.Add(new ToolStripSeparator());
            view.DropDownItems.Add("Zoom &In", null, (_, _) => Zoom(10));
            view.DropDownItems.Add("Zoom &Out", null, (_, _) => Zoom(-10));
            view.DropDownItems.Add("&Reset Zoom", null, (_, _) => Zoom(0, reset: true));

            var navigate = new ToolStripMenuItem("&Navigate");
            navigate.DropDownItems.Add("&Go to Heading...", null, (_, _) => ShowQuickJump(commandMode: false));
            navigate.DropDownItems.Add("&Command Palette...", null, (_, _) => ShowQuickJump(commandMode: true));

            var help = new ToolStripMenuItem("&Help");
            help.DropDownItems.Add("&About MyMDEditor", null, (_, _) =>
                MessageBox.Show(this, "MyMDEditor\nA lightweight, professional Markdown editor.", "About MyMDEditor",
                    MessageBoxButtons.OK, MessageBoxIcon.Information));

            _menu.Items.AddRange(new ToolStripItem[] { file, edit, view, navigate, help });
            MainMenuStrip = _menu;
            Controls.Add(_menu);
        }

        private ToolStripMenuItem _recentMenu = null!;
        private ToolStripMenuItem _outlineToggle = null!;
        private ToolStripMenuItem _wordWrapToggle = null!;
        private ToolStripButton _themeToggleButton = null!;
        private ToolStripMenuItem _themeDarkMenuItem = null!;
        private ToolStripMenuItem _themeLightMenuItem = null!;
        private ToolStripMenuItem _themeSystemMenuItem = null!;

        private void BuildToolbar()
        {
            _toolbar.Items.Add(new ToolStripButton("New") { ToolTipText = "New (Ctrl+N)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripButton("Open") { ToolTipText = "Open (Ctrl+O)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripButton("Save") { ToolTipText = "Save (Ctrl+S)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripSeparator());
            _toolbar.Items.Add(new ToolStripButton("Bold") { ToolTipText = "Bold (Ctrl+B)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripButton("Italic") { ToolTipText = "Italic (Ctrl+I)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripButton("Link") { ToolTipText = "Insert link (Ctrl+K)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripSeparator());
            _toolbar.Items.Add(new ToolStripButton("Find") { ToolTipText = "Find (Ctrl+F)", DisplayStyle = ToolStripItemDisplayStyle.Text });
            _toolbar.Items.Add(new ToolStripSeparator());
            _themeToggleButton = new ToolStripButton(string.Empty) { ToolTipText = "Toggle dark/light theme", DisplayStyle = ToolStripItemDisplayStyle.Text };
            _toolbar.Items.Add(_themeToggleButton);

            foreach (ToolStripItem item in _toolbar.Items)
            {
                if (item is ToolStripButton button && button != _themeToggleButton)
                {
                    button.Click += (_, _) => OnToolbarClick(button.Text!);
                }
            }

            _themeToggleButton.Click += (_, _) => SetTheme(_palette.IsDark ? "light" : "dark");

            Controls.Add(_toolbar);
        }

        private async void OnToolbarClick(string name)
        {
            switch (name)
            {
                case "New": await NewDocumentAsync(); break;
                case "Open": await OpenDocumentAsync(); break;
                case "Save": await SaveDocumentAsync(); break;
                case "Bold": WrapSelection("**"); break;
                case "Italic": WrapSelection("_"); break;
                case "Link": InsertLink(); break;
                case "Find": ShowFind(withReplace: false); break;
            }
        }

        private void BuildStatusBar()
        {
            _statusStrip.Items.Add(_statusPosition);
            _statusStrip.Items.Add(new ToolStripStatusLabel { Spring = true });
            _statusStrip.Items.Add(_statusStats);
            _statusStrip.Items.Add(_statusEncoding);
            _statusStrip.Items.Add(_statusModified);
            Controls.Add(_statusStrip);
        }

        private void BuildLayout()
        {
            _preview.Dock = DockStyle.Fill;
            _innerSplit.Dock = DockStyle.Fill;

            var editorPanel = new Panel { Dock = DockStyle.Fill };
            editorPanel.Controls.Add(_editor);
            editorPanel.Controls.Add(_findBar);

            _innerSplit.Panel1.Controls.Add(editorPanel);
            _innerSplit.Panel2.Controls.Add(_preview);

            _outerSplit.Panel1.Controls.Add(_outlineTree);
            _outerSplit.Panel2.Controls.Add(_innerSplit);
            _outerSplit.Panel1MinSize = 120;
            _outerSplit.SplitterDistance = Math.Max(120, _settings.OutlineWidth);
            _outerSplit.Panel1Collapsed = !_settings.ShowOutline;

            _outerSplit.Dock = DockStyle.Fill;
            Controls.Add(_outerSplit);

            Shown += (_, _) => _innerSplit.SplitterDistance = Math.Max(200, Width / 2 - 100);
        }

        private void WireEvents()
        {
            _editor.TextChanged += OnEditorTextChanged;
            _editor.KeyDown += OnEditorKeyDown;
            _caretTimer.Tick += (_, _) => UpdateCaretStatus();
            _caretTimer.Start();
            _autoSaveTimer.Tick += async (_, _) => await OnAutoSaveTickAsync();

            _findBar.QueryChanged += (_, _) => RunSearch(selectCurrent: false);
            _findBar.NextRequested += (_, _) => FindNext();
            _findBar.PreviousRequested += (_, _) => FindPrevious();
            _findBar.ReplaceRequested += (_, _) => ReplaceCurrent();
            _findBar.ReplaceAllRequested += (_, _) => ReplaceAll();
            _findBar.CloseRequested += (_, _) => HideFind();

            _outlineTree.AfterSelect += (_, e) =>
            {
                if (e.Node?.Tag is int index && index >= 0 && index < _outline.Count)
                {
                    GoToLine(_outline[index].Line);
                }
            };

            _preview.HandleCreated += async (_, _) => await InitialisePreviewAsync();

            KeyDown += OnFormKeyDown;
        }

        // ---------------------------------------------------------------- Startup / shutdown

        private async Task OnFormLoadAsync(string? filePathToOpen)
        {
            try
            {
                var orphan = _recovery.FindOrphan();
                if (filePathToOpen is not null)
                {
                    await LoadFileAsync(filePathToOpen);
                }
                else if (orphan is not null && orphan.Text.Length > 0)
                {
                    var choice = MessageBox.Show(this,
                        "MyMDEditor found unsaved work from a previous session that did not close normally. Restore it?",
                        "Recover unsaved work", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                    if (choice == DialogResult.Yes)
                    {
                        SetEditorText(orphan.Text);
                        if (!string.IsNullOrEmpty(orphan.OriginalPath))
                        {
                            await LoadFileAsync(orphan.OriginalPath!, keepRecoveredText: true);
                        }
                    }
                }
                else if (_settings.RestoreSession && !string.IsNullOrEmpty(_settings.LastFile) && File.Exists(_settings.LastFile))
                {
                    await LoadFileAsync(_settings.LastFile!);
                    _editor.SelectionStart = Math.Min(_settings.LastCaret, _editor.TextLength);
                }

                if (_autoSaveTimer.Enabled = _settings.AutoSaveEnabled)
                {
                    _autoSaveTimer.Interval = Math.Max(5000, _settings.AutoSaveSeconds * 1000);
                }

                RebuildRecentMenu();
                UpdateCaretStatus();
                ScheduleRender();
            }
            catch (Exception ex)
            {
                AppLogger.Error("Failed during startup.", ex);
            }
        }

        private async void OnFormClosing(object? sender, FormClosingEventArgs e)
        {
            if (_closing)
            {
                return;
            }

            if (_editor.Modified)
            {
                var choice = MessageBox.Show(this, "Save changes before closing?", "MyMDEditor",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
                if (choice == DialogResult.Cancel)
                {
                    e.Cancel = true;
                    return;
                }

                if (choice == DialogResult.Yes)
                {
                    e.Cancel = true;
                    _closing = true;
                    var saved = await SaveDocumentAsync();
                    _closing = false;
                    if (!saved)
                    {
                        return;
                    }
                }
            }

            _recovery.Clear();
            _settings.LastFile = _fileService.CurrentFilePath;
            _settings.LastCaret = _editor.SelectionStart;
            _settings.OutlineWidth = _outerSplit.SplitterDistance;
            _settings.Window = CapturePlacement();
            _settingsService.Save(_settings);
            e.Cancel = false;
            _closing = true;
            Close();
        }

        private WindowPlacement CapturePlacement() => new()
        {
            X = WindowState == FormWindowState.Normal ? Location.X : RestoreBounds.X,
            Y = WindowState == FormWindowState.Normal ? Location.Y : RestoreBounds.Y,
            Width = WindowState == FormWindowState.Normal ? Width : RestoreBounds.Width,
            Height = WindowState == FormWindowState.Normal ? Height : RestoreBounds.Height,
            Maximized = WindowState == FormWindowState.Maximized,
        };

        private void ApplyWindowPlacement()
        {
            var window = _settings.Window;
            if (window is { Width: > 100, Height: > 100 })
            {
                StartPosition = FormStartPosition.Manual;
                Location = new Point(window.X, window.Y);
                Size = new Size(window.Width, window.Height);
                if (window.Maximized)
                {
                    WindowState = FormWindowState.Maximized;
                }
            }
        }

        // ---------------------------------------------------------------- File operations

        private async Task NewDocumentAsync()
        {
            if (!await ConfirmDiscardChangesAsync())
            {
                return;
            }

            _fileService.Reset();
            SetEditorText(string.Empty);
            _editor.Modified = false;
            Text = "Untitled - MyMDEditor";
            UpdateEncodingStatus();
            ScheduleRender();
        }

        private async Task OpenDocumentAsync()
        {
            if (!await ConfirmDiscardChangesAsync())
            {
                return;
            }

            using var dialog = new OpenFileDialog { Filter = "Markdown files (*.md;*.markdown)|*.md;*.markdown|All files (*.*)|*.*" };
            if (dialog.ShowDialog(this) == DialogResult.OK)
            {
                await LoadFileAsync(dialog.FileName);
            }
        }

        private async Task LoadFileAsync(string path, bool keepRecoveredText = false)
        {
            try
            {
                var text = await _fileService.OpenFileAsync(path);
                if (!keepRecoveredText)
                {
                    SetEditorText(text);
                }

                _editor.Modified = false;
                Text = $"{Path.GetFileName(path)} - MyMDEditor";
                _settings.AddRecent(path);
                RebuildRecentMenu();
                UpdateEncodingStatus();
                ScheduleRender();
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
            {
                AppLogger.Error($"Failed to open '{path}'.", ex);
                MessageBox.Show(this, $"Could not open the file:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task<bool> SaveDocumentAsync()
        {
            var path = _fileService.CurrentFilePath;
            if (path is null)
            {
                return await SaveDocumentAsAsync();
            }

            return await SaveToAsync(path);
        }

        private async Task<bool> SaveDocumentAsAsync()
        {
            using var dialog = new SaveFileDialog { Filter = "Markdown files (*.md)|*.md|All files (*.*)|*.*", FileName = "Untitled.md" };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return false;
            }

            return await SaveToAsync(dialog.FileName);
        }

        private async Task<bool> SaveToAsync(string path)
        {
            try
            {
                await _fileService.SaveFileAsync(path, _editor.Text);
                _editor.Modified = false;
                Text = $"{Path.GetFileName(path)} - MyMDEditor";
                _settings.AddRecent(path);
                RebuildRecentMenu();
                UpdateEncodingStatus();
                _recovery.Clear();
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
            {
                AppLogger.Error($"Failed to save '{path}'.", ex);
                MessageBox.Show(this, $"Could not save the file:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        private async Task<bool> ConfirmDiscardChangesAsync()
        {
            if (!_editor.Modified)
            {
                return true;
            }

            var choice = MessageBox.Show(this, "Save changes to the current document?", "MyMDEditor",
                MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
            return choice switch
            {
                DialogResult.Yes => await SaveDocumentAsync(),
                DialogResult.No => true,
                _ => false,
            };
        }

        private async Task OnAutoSaveTickAsync()
        {
            if (_fileService.CurrentFilePath is not null && _editor.Modified)
            {
                await SaveToAsync(_fileService.CurrentFilePath);
            }
        }

        private void RebuildRecentMenu()
        {
            _recentMenu.DropDownItems.Clear();
            if (_settings.RecentFiles.Count == 0)
            {
                _recentMenu.DropDownItems.Add(new ToolStripMenuItem("(No recent files)") { Enabled = false });
                return;
            }

            foreach (var path in _settings.RecentFiles)
            {
                var item = new ToolStripMenuItem(path);
                item.Click += async (_, _) =>
                {
                    if (!File.Exists(path))
                    {
                        MessageBox.Show(this, "This file can no longer be found.", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        _settings.RemoveRecent(path);
                        RebuildRecentMenu();
                        return;
                    }

                    if (await ConfirmDiscardChangesAsync())
                    {
                        await LoadFileAsync(path);
                    }
                };
                _recentMenu.DropDownItems.Add(item);
            }
        }

        // ---------------------------------------------------------------- Export

        private async Task ExportHtmlAsync()
        {
            using var dialog = new SaveFileDialog { Filter = "HTML files (*.html)|*.html", FileName = "Untitled.html" };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return;
            }

            try
            {
                var title = Path.GetFileNameWithoutExtension(_fileService.CurrentFilePath) ?? "Document";
                var html = await _renderer.RenderToHtmlAsync(_editor.Text, title);
                await File.WriteAllTextAsync(dialog.FileName, html);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Error("HTML export failed.", ex);
                MessageBox.Show(this, $"Export failed:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task ExportDocxAsync()
        {
            using var dialog = new SaveFileDialog { Filter = "Word document (*.docx)|*.docx", FileName = "Untitled.docx" };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return;
            }

            try
            {
                var title = Path.GetFileNameWithoutExtension(_fileService.CurrentFilePath) ?? "Document";
                await DocxExporter.ExportAsync(_editor.Text, dialog.FileName, title);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Error("DOCX export failed.", ex);
                MessageBox.Show(this, $"Export failed:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task ExportPdfAsync()
        {
            if (!_previewReady || _preview.CoreWebView2 is null)
            {
                MessageBox.Show(this, "The preview is still loading; please try again in a moment.", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            using var dialog = new SaveFileDialog { Filter = "PDF document (*.pdf)|*.pdf", FileName = "Untitled.pdf" };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return;
            }

            try
            {
                await _preview.CoreWebView2.PrintToPdfAsync(dialog.FileName);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or COMException)
            {
                AppLogger.Error("PDF export failed.", ex);
                MessageBox.Show(this, $"Export failed:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ---------------------------------------------------------------- Editor conveniences

        private void SetEditorText(string text)
        {
            _suppressTextEvents = true;
            _editor.Text = text;
            _suppressTextEvents = false;
        }

        private void OnEditorTextChanged(object? sender, EventArgs e)
        {
            UpdateModifiedStatus();
            if (_suppressTextEvents)
            {
                return;
            }

            ScheduleRender();
            _recoveryDebouncer.Debounce(() =>
            {
                _recovery.Save(_fileService.CurrentFilePath, _editor.Text);
                return Task.CompletedTask;
            });

            if (_findBar.Visible)
            {
                RunSearch(selectCurrent: false);
            }
        }

        private void OnEditorKeyDown(object? sender, KeyEventArgs e)
        {
            switch (e.KeyData)
            {
                case Keys.Tab:
                    ApplyIndent(outdent: false);
                    e.Handled = true;
                    e.SuppressKeyPress = true;
                    return;
                case Keys.Shift | Keys.Tab:
                    ApplyIndent(outdent: true);
                    e.Handled = true;
                    e.SuppressKeyPress = true;
                    return;
                case Keys.Enter:
                    if (TryHandleSmartEnter())
                    {
                        e.Handled = true;
                        e.SuppressKeyPress = true;
                    }
                    return;
                case Keys.Control | Keys.B:
                    WrapSelection("**");
                    e.Handled = true;
                    e.SuppressKeyPress = true;
                    return;
                case Keys.Control | Keys.I:
                    WrapSelection("_");
                    e.Handled = true;
                    e.SuppressKeyPress = true;
                    return;
                case Keys.Control | Keys.K:
                    InsertLink();
                    e.Handled = true;
                    e.SuppressKeyPress = true;
                    return;
            }
        }

        private void OnFormKeyDown(object? sender, KeyEventArgs e)
        {
            switch (e.KeyData)
            {
                case Keys.Control | Keys.F:
                    ShowFind(withReplace: false);
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.H:
                    ShowFind(withReplace: true);
                    e.Handled = true;
                    break;
                case Keys.F3:
                    FindNext();
                    e.Handled = true;
                    break;
                case Keys.Shift | Keys.F3:
                    FindPrevious();
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.P:
                    ShowQuickJump(commandMode: false);
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.Shift | Keys.P:
                    ShowQuickJump(commandMode: true);
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.N:
                    _ = NewDocumentAsync();
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.O:
                    _ = OpenDocumentAsync();
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.S:
                    _ = SaveDocumentAsync();
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.Shift | Keys.S:
                    _ = SaveDocumentAsAsync();
                    e.Handled = true;
                    break;
            }
        }

        private void ApplyIndent(bool outdent)
        {
            Func<string, string> transform = outdent ? LineOperations.OutdentLine : LineOperations.IndentLine;
            var edit = LineOperations.TransformLines(_editor.Text, _editor.SelectionStart, _editor.SelectionLength,
                lines => lines.Select(transform).ToArray());
            ApplyEdit(edit, selectWholeEdit: true);
        }

        private bool TryHandleSmartEnter()
        {
            var text = _editor.Text;
            var index = new LineIndex(text);
            var caret = _editor.SelectionStart;
            var line = index.GetLineFromOffset(caret);
            var lineStart = index.GetLineStart(line);
            var lineEnd = index.GetLineEnd(line);
            var lineText = text.Substring(lineStart, lineEnd - lineStart);
            var column = caret - lineStart;

            var result = LineOperations.GetEnterEdit(lineText, column);
            if (result is null)
            {
                return false;
            }

            if (result.Value.ClearLine)
            {
                _editor.SelectionStart = lineStart;
                _editor.SelectionLength = lineEnd - lineStart;
                _editor.SelectedText = string.Empty;
                _editor.SelectionStart = lineStart;
            }
            else
            {
                _editor.SelectionStart = caret;
                _editor.SelectionLength = 0;
                _editor.SelectedText = result.Value.InsertText;
            }

            return true;
        }

        private void WrapSelection(string marker)
        {
            var start = _editor.SelectionStart;
            var length = _editor.SelectionLength;
            var selected = _editor.SelectedText;
            _editor.SelectedText = marker + selected + marker;
            _editor.SelectionStart = length == 0 ? start + marker.Length : start;
            _editor.SelectionLength = length == 0 ? 0 : length + marker.Length * 2;
        }

        private void InsertLink()
        {
            var selected = _editor.SelectedText;
            var start = _editor.SelectionStart;
            var text = string.IsNullOrEmpty(selected) ? "[text](url)" : $"[{selected}](url)";
            _editor.SelectedText = text;
            var urlStart = start + text.IndexOf("url", StringComparison.Ordinal);
            _editor.SelectionStart = urlStart;
            _editor.SelectionLength = 3;
        }

        private void ApplyEdit(TextEdit edit, bool selectWholeEdit)
        {
            var wasModified = _editor.Modified;
            _editor.SelectionStart = edit.Start;
            _editor.SelectionLength = edit.Length;
            _editor.SelectedText = edit.Text;
            if (selectWholeEdit)
            {
                _editor.SelectionStart = edit.Start;
                _editor.SelectionLength = edit.Text.Length;
            }
            else
            {
                _editor.SelectionStart = edit.Start + edit.Text.Length;
            }

            _editor.Modified = wasModified || edit.Text.Length != edit.Length;
        }

        private void GoToLine(int line)
        {
            var index = new LineIndex(_editor.Text);
            var start = index.GetLineStart(line);
            _editor.SelectionStart = start;
            _editor.SelectionLength = 0;
            _editor.ScrollToCaret();
            _editor.Focus();
            SyncPreviewToLine(line, scroll: true, flash: true);
        }

        private void Zoom(int deltaPercent, bool reset = false)
        {
            _settings.ZoomPercent = reset ? 100 : Math.Clamp(_settings.ZoomPercent + deltaPercent, 50, 300);
            _editor.Font = new Font(_editor.Font.FontFamily, 11F * _settings.ZoomPercent / 100F);
        }

        private void SetOutlineVisible(bool visible)
        {
            _settings.ShowOutline = visible;
            _outerSplit.Panel1Collapsed = !visible;
        }

        private void SetTheme(string theme)
        {
            _settings.Theme = theme;
            _palette = ThemePalette.Resolve(theme);
            ApplyTheme();
        }

        private void ApplyTheme()
        {
            BackColor = _palette.Window;
            ForeColor = _palette.Text;
            ThemeApplier.ApplyTitleBar(this, _palette);
            ThemeApplier.ApplyToolStrip(_menu, _palette);
            ThemeApplier.ApplyToolStrip(_toolbar, _palette);
            ThemeApplier.ApplyToolStrip(_statusStrip, _palette);

            var wasModified = _editor.Modified;
            _editor.BackColor = _palette.EditorBack;
            _editor.ForeColor = _palette.EditorText;
            _editor.Modified = wasModified;

            _outlineTree.BackColor = _palette.Surface;
            _outlineTree.ForeColor = _palette.Text;
            _outerSplit.BackColor = _palette.Border;
            _innerSplit.BackColor = _palette.Border;

            _findBar.ApplyTheme(_palette);
            if (_previewReady)
            {
                PostToPreview(new { type = "theme", theme = _palette.PreviewTheme });
            }

            _themeToggleButton.Text = _palette.IsDark ? "? Light" : "?? Dark";
            _themeToggleButton.ToolTipText = _palette.IsDark ? "Switch to light theme" : "Switch to dark theme";

            _themeDarkMenuItem.Checked = _settings.Theme == "dark";
            _themeLightMenuItem.Checked = _settings.Theme == "light";
            _themeSystemMenuItem.Checked = _settings.Theme == "system";
        }

        private void UpdateModifiedStatus()
        {
            _statusModified.Text = _editor.Modified ? "? Unsaved changes" : "Saved";
        }

        private void UpdateEncodingStatus()
        {
            var format = _fileService.CurrentFormat;
            _statusEncoding.Text = $"{format.EncodingName} · {format.LineEndingName}";
        }

        private void UpdateCaretStatus()
        {
            var index = new LineIndex(_editor.Text);
            var caret = _editor.SelectionStart;
            var line = index.GetLineFromOffset(caret);
            var column = index.GetColumnFromOffset(caret);
            _statusPosition.Text = $"Ln {line + 1}, Col {column + 1}";

            var stats = TextStatistics.Compute(_editor.Text);
            _statusStats.Text = $"{stats.Words:N0} words · {stats.Characters:N0} chars · {stats.ReadingMinutes} min read";

            if (line != _lastCaretLine)
            {
                _lastCaretLine = line;
                UpdateOutlineSelection(line);
                SyncPreviewToLine(line, scroll: true, flash: false);
            }
        }

        // ---------------------------------------------------------------- Search

        private void ShowFind(bool withReplace)
        {
            _findBar.ShowFind(_editor.SelectedText, withReplace);
            RunSearch(selectCurrent: true);
        }

        private void HideFind()
        {
            _findBar.Visible = false;
            ClearHighlights();
            _search = null;
            if (_previewReady)
            {
                PostToPreview(new { type = "find", spec = (object?)null });
            }

            _editor.Focus();
        }

        private void RunSearch(bool selectCurrent)
        {
            var options = _findBar.Options;
            var error = SearchEngine.Validate(options);
            if (error is not null)
            {
                _findBar.SetStatus(error, isError: true);
                ClearHighlights();
                return;
            }

            var result = SearchEngine.Find(_editor.Text, options);
            _search = new SearchSession(result);
            if (options.IsEmpty)
            {
                ClearHighlights();
                _findBar.SetStatus(string.Empty, isError: false);
                return;
            }

            if (selectCurrent)
            {
                _search.SelectNearestForward(_editor.SelectionStart);
            }

            ApplyHighlights();
            _findBar.SetStatus(_search.Describe(), isError: false);
            PostFindSpec(options);
            ReportCurrentMatch(scroll: selectCurrent);
        }

        private void FindNext()
        {
            if (_search is null || _search.Count == 0)
            {
                return;
            }

            _search.MoveNext();
            SelectCurrentMatch(scroll: true);
        }

        private void FindPrevious()
        {
            if (_search is null || _search.Count == 0)
            {
                return;
            }

            _search.MovePrevious();
            SelectCurrentMatch(scroll: true);
        }

        private void SelectCurrentMatch(bool scroll)
        {
            if (_search?.Current is not { } match)
            {
                return;
            }

            _editor.SelectionStart = match.Start;
            _editor.SelectionLength = match.Length;
            if (scroll)
            {
                _editor.ScrollToCaret();
            }

            _findBar.SetStatus(_search.Describe(), isError: false);
            ApplyHighlights();
            ReportCurrentMatch(scroll);
        }

        private void ReplaceCurrent()
        {
            if (_search?.Current is not { } match)
            {
                return;
            }

            var replacement = SearchEngine.GetReplacement(_editor.Text, match, _findBar.Options, _findBar.ReplacementText);
            _editor.SelectionStart = match.Start;
            _editor.SelectionLength = match.Length;
            _editor.SelectedText = replacement;
            RunSearch(selectCurrent: false);
            _search?.SelectNearestForward(match.Start + replacement.Length);
            SelectCurrentMatch(scroll: true);
        }

        private void ReplaceAll()
        {
            var (text, count) = SearchEngine.ReplaceAll(_editor.Text, _findBar.Options, _findBar.ReplacementText);
            if (count == 0)
            {
                return;
            }

            var selection = _editor.SelectionStart;
            SetEditorText(text);
            _editor.Modified = true;
            _editor.SelectionStart = Math.Min(selection, _editor.TextLength);
            ScheduleRender();
            RunSearch(selectCurrent: false);
        }

        private void ApplyHighlights()
        {
            ClearHighlights();
            if (_search is null || _search.Count == 0)
            {
                return;
            }

            var wasModified = _editor.Modified;
            const int maxHighlighted = 2000;
            for (var i = 0; i < _search.Matches.Count && i < maxHighlighted; i++)
            {
                var match = _search.Matches[i];
                _editor.SelectionStart = match.Start;
                _editor.SelectionLength = match.Length;
                _editor.SelectionBackColor = i == _search.CurrentIndex ? _palette.FindCurrent : _palette.FindMatch;
            }

            _editor.SelectionLength = 0;
            _editor.Modified = wasModified;
        }

        private void ClearHighlights()
        {
            var wasModified = _editor.Modified;
            var selectionStart = _editor.SelectionStart;
            var selectionLength = _editor.SelectionLength;
            _editor.SelectAll();
            _editor.SelectionBackColor = _palette.EditorBack;
            _editor.SelectionStart = selectionStart;
            _editor.SelectionLength = selectionLength;
            _editor.Modified = wasModified;
        }

        private void PostFindSpec(SearchOptions options)
        {
            if (!_previewReady)
            {
                return;
            }

            PostToPreview(new { type = "find", spec = new { pattern = options.ToRegexPattern(), caseSensitive = options.CaseSensitive } });
        }

        private void ReportCurrentMatch(bool scroll)
        {
            if (!_previewReady || _search?.Current is not { } match)
            {
                return;
            }

            var index = new LineIndex(_editor.Text);
            var line = index.GetLineFromOffset(match.Start);
            var ordinal = SourceLocator.GetOrdinalInParagraph(_editor.Text, _search.Matches, _search.CurrentIndex);
            PostToPreview(new { type = "current", line, ordinal, scroll });
        }

        // ---------------------------------------------------------------- Quick jump / outline

        private void ShowQuickJump(bool commandMode)
        {
            IReadOnlyList<PaletteItem> Headings() =>
                _outline.Select((entry, i) => new PaletteItem(
                    new string(' ', (entry.Level - 1) * 2) + entry.Title,
                    $"Ln {entry.Line + 1}",
                    () => GoToLine(entry.Line))).ToList();

            IReadOnlyList<PaletteItem> Commands() => new[]
            {
                new PaletteItem("New File", "Ctrl+N", () => _ = NewDocumentAsync()),
                new PaletteItem("Open File...", "Ctrl+O", () => _ = OpenDocumentAsync()),
                new PaletteItem("Save", "Ctrl+S", () => _ = SaveDocumentAsync()),
                new PaletteItem("Save As...", "Ctrl+Shift+S", () => _ = SaveDocumentAsAsync()),
                new PaletteItem("Export as HTML...", string.Empty, () => _ = ExportHtmlAsync()),
                new PaletteItem("Export as Word Document...", string.Empty, () => _ = ExportDocxAsync()),
                new PaletteItem("Export as PDF...", string.Empty, () => _ = ExportPdfAsync()),
                new PaletteItem("Toggle Document Outline", string.Empty, () => { _outlineToggle.Checked = !_outlineToggle.Checked; }),
                new PaletteItem("Toggle Word Wrap", string.Empty, () => { _wordWrapToggle.Checked = !_wordWrapToggle.Checked; }),
                new PaletteItem("Switch to Dark Theme", string.Empty, () => SetTheme("dark")),
                new PaletteItem("Switch to Light Theme", string.Empty, () => SetTheme("light")),
            };

            using var dialog = new QuickJumpDialog(_palette, Headings, Commands, GoToLine, commandMode);
            dialog.Width = Math.Min(640, Width - 80);
            dialog.Height = 360;
            dialog.Location = new Point(Location.X + (Width - dialog.Width) / 2, Location.Y + 100);
            dialog.ShowDialog(this);
        }

        private void RebuildOutline()
        {
            var signature = OutlineService.GetSignature(_outline);
            if (signature == _outlineSignature)
            {
                return;
            }

            _outlineSignature = signature;
            _outlineTree.BeginUpdate();
            _outlineTree.Nodes.Clear();
            foreach (var root in OutlineService.BuildTree(_outline))
            {
                _outlineTree.Nodes.Add(BuildOutlineNode(root));
            }

            _outlineTree.ExpandAll();
            _outlineTree.EndUpdate();
        }

        private static TreeNode BuildOutlineNode(OutlineNode node)
        {
            var treeNode = new TreeNode(node.Entry.Title) { Tag = node.Index };
            foreach (var child in node.Children)
            {
                treeNode.Nodes.Add(BuildOutlineNode(child));
            }

            return treeNode;
        }

        private void UpdateOutlineSelection(int line)
        {
            var current = OutlineService.FindCurrentIndex(_outline, line);
            if (current < 0)
            {
                return;
            }

            var node = FindNodeByIndex(_outlineTree.Nodes, current);
            if (node is not null)
            {
                _outlineTree.SelectedNode = node;
            }
        }

        private static TreeNode? FindNodeByIndex(TreeNodeCollection nodes, int index)
        {
            foreach (TreeNode node in nodes)
            {
                if (node.Tag is int i && i == index)
                {
                    return node;
                }

                var found = FindNodeByIndex(node.Nodes, index);
                if (found is not null)
                {
                    return found;
                }
            }

            return null;
        }

        // ---------------------------------------------------------------- Preview rendering & sync

        private void ScheduleRender()
        {
            _renderDebouncer.Debounce(RenderPreviewAsync);
        }

        private async Task RenderPreviewAsync()
        {
            _renderCts.Cancel();
            _renderCts = new CancellationTokenSource();
            var token = _renderCts.Token;
            var markdown = _editor.Text;

            try
            {
                var result = await _renderer.RenderAsync(markdown, includeSourceMap: true, token).ConfigureAwait(true);
                if (token.IsCancellationRequested)
                {
                    return;
                }

                _outline = result.Outline;
                RebuildOutline();

                if (_previewReady)
                {
                    var baseHref = _fileService.CurrentFilePath is { } path ? new Uri(Path.GetDirectoryName(Path.GetFullPath(path)) + Path.DirectorySeparatorChar).AbsoluteUri : "about:blank";
                    PostToPreview(new { type = "content", html = result.BodyHtml, baseHref });
                    if (_findBar.Visible)
                    {
                        PostFindSpec(_findBar.Options);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Superseded by a newer render request.
            }
            catch (Exception ex)
            {
                AppLogger.Error("Markdown rendering failed.", ex);
            }
        }

        private async Task InitialisePreviewAsync()
        {
            try
            {
                await _preview.EnsureCoreWebView2Async();
                _preview.CoreWebView2.WebMessageReceived += OnPreviewMessage;
                _preview.CoreWebView2.NavigateToString(PreviewAssets.BuildShellHtml(_palette.PreviewTheme));
                _preview.CoreWebView2.NavigationCompleted += (_, _) =>
                {
                    _previewReady = true;
                    ScheduleRender();
                };
            }
            catch (Exception ex)
            {
                AppLogger.Error("Failed to initialise the preview control.", ex);
            }
        }

        private void PostToPreview(object message)
        {
            if (_preview.CoreWebView2 is null)
            {
                return;
            }

            try
            {
                _preview.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message));
            }
            catch (Exception ex) when (ex is InvalidOperationException or COMException)
            {
                AppLogger.Warn("Could not post a message to the preview.", ex);
            }
        }

        private void SyncPreviewToLine(int line, bool scroll, bool flash)
        {
            if (_previewReady)
            {
                PostToPreview(new { type = "sync", line, scroll, flash });
            }
        }

        private void OnPreviewMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                using var document = JsonDocument.Parse(e.WebMessageAsJson);
                var root = document.RootElement;
                var type = root.TryGetProperty("type", out var typeProp) ? typeProp.GetString() : null;
                switch (type)
                {
                    case "select":
                        HandlePreviewSelection(root);
                        break;
                    case "link":
                        HandlePreviewLink(root);
                        break;
                    case "key":
                        HandlePreviewKey(root);
                        break;
                }
            }
            catch (JsonException ex)
            {
                AppLogger.Warn("Received malformed message from the preview.", ex);
            }
        }

        private void HandlePreviewSelection(JsonElement root)
        {
            var sl = root.GetProperty("sl").GetInt32();
            var ss = root.GetProperty("ss").GetInt32();
            var se = root.GetProperty("se").GetInt32();
            var text = root.TryGetProperty("text", out var t) ? t.GetString() : null;

            var match = SourceLocator.FindInBlock(_editor.Text, ss, se, text);
            var index = new LineIndex(_editor.Text);
            var start = match?.Start ?? index.GetLineStart(sl);
            var length = match?.Length ?? 0;

            _editor.SelectionStart = start;
            _editor.SelectionLength = length;
            _editor.ScrollToCaret();
            _editor.Focus();
        }

        private void HandlePreviewLink(JsonElement root)
        {
            var resolved = root.TryGetProperty("resolved", out var r) ? r.GetString() : null;
            if (string.IsNullOrEmpty(resolved))
            {
                return;
            }

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(resolved) { UseShellExecute = true });
            }
            catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
            {
                AppLogger.Warn($"Could not open link '{resolved}'.", ex);
            }
        }

        private void HandlePreviewKey(JsonElement root)
        {
            var combo = root.TryGetProperty("combo", out var c) ? c.GetString() : null;
            switch (combo)
            {
                case "ctrl+f": ShowFind(withReplace: false); break;
                case "ctrl+h": ShowFind(withReplace: true); break;
                case "f3": FindNext(); break;
                case "shift+f3": FindPrevious(); break;
                case "ctrl+p": ShowQuickJump(commandMode: false); break;
                case "ctrl+shift+p": ShowQuickJump(commandMode: true); break;
                case "ctrl+s": _ = SaveDocumentAsync(); break;
                case "ctrl+o": _ = OpenDocumentAsync(); break;
                case "ctrl+n": _ = NewDocumentAsync(); break;
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _renderDebouncer.Dispose();
                _recoveryDebouncer.Dispose();
                _caretTimer.Dispose();
                _autoSaveTimer.Dispose();
                _renderCts.Dispose();
                _preview.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
