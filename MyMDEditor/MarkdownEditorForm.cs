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
    public sealed partial class MarkdownEditorForm : Form
    {
        private readonly IMarkdownRenderingService _renderer = new MarkdownRenderingService();
        private readonly ISettingsService _settingsService = new SettingsService();
        private readonly RecoveryService _recovery = new();
        private readonly Debouncer _renderDebouncer = new(250);
        private readonly Debouncer _recoveryDebouncer = new(2000);
        private readonly System.Windows.Forms.Timer _caretTimer = new() { Interval = 120 };
        private readonly System.Windows.Forms.Timer _autoSaveTimer = new() { Interval = 30_000 };

        private readonly RibbonBar _ribbon = new() { Dock = DockStyle.Top };
        private readonly DocumentTabStrip _tabStrip = new() { Dock = DockStyle.Top };
        private readonly StatusStrip _statusStrip = new();
        private readonly ToolStripStatusLabel _statusPosition = new("Ln 1, Col 1");
        private readonly ToolStripStatusLabel _statusStats = new("0 words");
        private readonly ToolStripStatusLabel _statusEncoding = new("UTF-8");
        private readonly ToolStripStatusLabel _statusModified = new(string.Empty) { Spring = false };

        private readonly SplitContainer _outerSplit = new() { Orientation = Orientation.Vertical, FixedPanel = FixedPanel.Panel1, SplitterWidth = 1 };
        private readonly SplitContainer _innerSplit = new() { Orientation = Orientation.Vertical, SplitterWidth = 1 };

        private readonly TreeView _outlineTree = new()
        {
            Dock = DockStyle.Fill,
            HideSelection = false,
            BorderStyle = BorderStyle.None,
            ShowLines = false,
            FullRowSelect = true,
            ItemHeight = 26,
            Indent = 16,
            Font = new Font("Segoe UI", 9.5F),
        };
        private readonly Label _outlineHeader = new()
        {
            Dock = DockStyle.Top,
            Height = 34,
            Text = "OUTLINE",
            Font = new Font("Segoe UI Semibold", 8.5F),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(14, 0, 0, 0),
        };
        private readonly Panel _editorHost = new() { Dock = DockStyle.Fill, Padding = new Padding(24, 18, 12, 8) };
        private readonly List<DocumentTab> _documents = new();
        private DocumentTab _active = null!;
        private readonly FindBar _findBar = new() { Dock = DockStyle.Top, Visible = false };
        private readonly WebView2 _preview = new() { Dock = DockStyle.Fill };

        private AppSettings _settings = new();
        private ThemePalette _palette = ThemePalette.Dark;
        private IReadOnlyList<OutlineEntry> _outline = Array.Empty<OutlineEntry>();
        private string _outlineSignature = string.Empty;
        private SearchSession? _search;
        private bool _previewReady;
        private bool _suppressTextEvents;
        private bool _resyncPreviewAfterRender;
        private bool _closing;
        private int _lastCaretLine = -1;
        private CancellationTokenSource _renderCts = new();

        public MarkdownEditorForm(string? filePathToOpen)
        {
            AppLogger.Initialise();
            Text = "MyMDEditor";
            Width = 1280;
            Height = 820;
            MinimumSize = new Size(820, 520);
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;
            Icon = LoadAppIcon();

            _settings = _settingsService.Load();
            _palette = ThemePalette.Resolve(_settings.Theme);

            BuildRibbon();
            BuildStatusBar();
            BuildLayout();
            WireEvents();
            ApplyTheme();
            ApplyWindowPlacement();

            Load += async (_, _) => await OnFormLoadAsync(filePathToOpen).ConfigureAwait(true);
            FormClosing += OnFormClosing;
        }

        // ---------------------------------------------------------------- Layout

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
            _innerSplit.Orientation = _settings.VerticalSplit ? Orientation.Vertical : Orientation.Horizontal;

            // Docked controls are laid out from the last-added to the first-added, so the fill
            // control must be added first and the edge-docked controls after it.
            var editorPanel = new Panel { Dock = DockStyle.Fill };
            editorPanel.Controls.Add(_editorHost);
            editorPanel.Controls.Add(_findBar);

            _innerSplit.Panel1.Controls.Add(editorPanel);
            _innerSplit.Panel2.Controls.Add(_preview);

            _outlinePanel.Dock = DockStyle.Fill;
            _outlinePanel.Controls.Add(_outlineTree);
            _outlinePanel.Controls.Add(_outlineHeader);

            _outerSplit.Panel1.Controls.Add(_outlinePanel);
            _outerSplit.Panel2.Controls.Add(_innerSplit);
            _outerSplit.Panel1MinSize = 120;
            _outerSplit.SplitterDistance = Math.Max(120, _settings.OutlineWidth);
            _outerSplit.Panel1Collapsed = !_settings.ShowOutline;
            _outerSplit.Dock = DockStyle.Fill;

            Controls.Add(_outerSplit);
            Controls.Add(_tabStrip);
            Controls.Add(_ribbon);
            Controls.Add(_statusStrip);

            Shown += (_, _) =>
            {
                _innerSplit.Panel1MinSize = 240;
                _innerSplit.Panel2MinSize = 240;
                SetViewMode(_settings.ViewMode);
                ResetInnerSplit();
            };
        }

        private readonly Panel _outlinePanel = new();

        private void ResetInnerSplit()
        {
            if (!_innerSplit.IsHandleCreated)
            {
                return;
            }

            var extent = _innerSplit.Orientation == Orientation.Vertical ? _innerSplit.Width : _innerSplit.Height;
            var min = _innerSplit.Panel1MinSize;
            var max = extent - _innerSplit.Panel2MinSize - _innerSplit.SplitterWidth;
            if (max >= min)
            {
                _innerSplit.SplitterDistance = Math.Clamp(extent / 2, min, max);
            }
        }

        private void WireEvents()
        {
            _caretTimer.Tick += (_, _) => UpdateCaretStatus();
            _caretTimer.Start();
            _autoSaveTimer.Tick += async (_, _) => await OnAutoSaveTickAsync();

            _tabStrip.SelectedIndexChanged += (_, _) =>
            {
                if (_tabStrip.SelectedIndex >= 0 && _tabStrip.SelectedIndex < _documents.Count)
                {
                    ActivateDocument(_documents[_tabStrip.SelectedIndex]);
                }
            };
            _tabStrip.CloseRequested += async (_, index) =>
            {
                if (index >= 0 && index < _documents.Count)
                {
                    await CloseDocumentAsync(_documents[index]);
                }
            };
            _tabStrip.NewRequested += (_, _) => _ = NewDocumentAsync();
            _tabStrip.TabMoved += (_, move) =>
            {
                var moved = _documents[move.From];
                _documents.RemoveAt(move.From);
                _documents.Insert(move.To, moved);
            };
            _tabStrip.ContextRequested += (_, request) => ShowTabContextMenu(request.Index, request.ScreenLocation);

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

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            switch (keyData)
            {
                case Keys.Control | Keys.T:
                    _ = NewDocumentAsync();
                    return true;
                case Keys.Control | Keys.W:
                    _ = CloseDocumentAsync(_active);
                    return true;
                case Keys.Control | Keys.Tab:
                    CycleTabs(1);
                    return true;
                case Keys.Control | Keys.Shift | Keys.Tab:
                    CycleTabs(-1);
                    return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void CycleTabs(int direction)
        {
            if (_documents.Count < 2)
            {
                return;
            }

            var next = (_documents.IndexOf(_active) + direction + _documents.Count) % _documents.Count;
            ActivateDocument(_documents[next]);
        }

        // ---------------------------------------------------------------- Startup / shutdown

        private async Task OnFormLoadAsync(string? filePathToOpen)
        {
            // Created here rather than in the constructor so the editor gets a window handle straight away;
            // a RichTextBox that gets its handle later can report itself as modified.
            ActivateDocument(AddDocument(new DocumentTab(CreateEditor())));
            try
            {
                var orphans = _recovery.FindOrphans();
                if (filePathToOpen is not null)
                {
                    await OpenPathAsync(filePathToOpen);
                }
                else if (_settings.RestoreSession)
                {
                    var files = _settings.OpenFiles.Count > 0
                        ? _settings.OpenFiles
                        : _settings.LastFile is { Length: > 0 } last ? new List<string> { last } : new List<string>();
                    foreach (var file in files.Where(File.Exists))
                    {
                        await OpenPathAsync(file);
                    }

                    var previous = _settings.LastFile;
                    var restoreActive = previous is null
                        ? null
                        : _documents.FirstOrDefault(d => string.Equals(d.FilePath, previous, StringComparison.OrdinalIgnoreCase));
                    if (restoreActive is not null)
                    {
                        ActivateDocument(restoreActive);
                        _editor.SelectionStart = Math.Min(_settings.LastCaret, _editor.TextLength);
                        _editor.ScrollToCaret();
                    }
                }

                await RestoreRecoveredAsync(orphans);

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

        private async Task RestoreRecoveredAsync(IReadOnlyList<RecoverySnapshot> orphans)
        {
            var candidates = orphans.Where(o => o.Text.Length > 0).ToList();
            if (candidates.Count == 0)
            {
                return;
            }

            var choice = MessageBox.Show(this,
                $"MyMDEditor found unsaved work ({candidates.Count} document{(candidates.Count == 1 ? string.Empty : "s")}) from a previous session that did not close normally. Restore it?",
                "Recover unsaved work", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (choice != DialogResult.Yes)
            {
                return;
            }

            foreach (var snapshot in candidates)
            {
                DocumentTab? doc = null;
                if (!string.IsNullOrEmpty(snapshot.OriginalPath) && File.Exists(snapshot.OriginalPath))
                {
                    doc = await OpenPathAsync(snapshot.OriginalPath);
                }

                if (doc is null)
                {
                    doc = _active.IsPristine ? _active : AddDocument(new DocumentTab(CreateEditor()));
                    ActivateDocument(doc);
                }

                SetText(doc, snapshot.Text);
                doc.Editor.Modified = true;
                RefreshTab(doc);
            }
        }

        private async void OnFormClosing(object? sender, FormClosingEventArgs e)
        {
            if (_closing)
            {
                return;
            }

            if (_documents.Any(d => d.IsModified))
            {
                e.Cancel = true;
                if (!await ConfirmCloseAllAsync())
                {
                    return;
                }

                PersistSession();
                _closing = true;
                Close();
                return;
            }

            PersistSession();
            _closing = true;
        }

        private async Task<bool> ConfirmCloseAllAsync()
        {
            foreach (var doc in _documents.Where(d => d.IsModified).ToList())
            {
                ActivateDocument(doc);
                var choice = MessageBox.Show(this, $"Save changes to {doc.Title} before closing?", "MyMDEditor",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
                if (choice == DialogResult.Cancel)
                {
                    return false;
                }

                if (choice == DialogResult.Yes && !await SaveDocumentAsync(doc))
                {
                    return false;
                }
            }

            return true;
        }

        private void PersistSession()
        {
            _recovery.Clear();
            _settings.OpenFiles = _documents.Select(d => d.FilePath).OfType<string>().ToList();
            _settings.LastFile = _active.FilePath;
            _settings.LastCaret = _editor.SelectionStart;
            if (!_outerSplit.Panel1Collapsed)
            {
                _settings.OutlineWidth = _outerSplit.SplitterDistance;
            }

            _settings.Window = CapturePlacement();
            _settingsService.Save(_settings);
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
                var bounds = new Rectangle(window.X, window.Y, window.Width, window.Height);
                if (IsTitleBarReachable(bounds))
                {
                    StartPosition = FormStartPosition.Manual;
                    Location = bounds.Location;
                    Size = bounds.Size;
                }

                if (window.Maximized)
                {
                    WindowState = FormWindowState.Maximized;
                }
            }
        }

        /// <summary>
        /// Guards against restoring onto a monitor that is no longer connected: the title bar
        /// strip must overlap a current screen's working area by a usable amount.
        /// </summary>
        private static bool IsTitleBarReachable(Rectangle bounds)
        {
            var titleBar = new Rectangle(bounds.X, bounds.Y, bounds.Width, 40);
            foreach (var screen in Screen.AllScreens)
            {
                var overlap = Rectangle.Intersect(titleBar, screen.WorkingArea);
                if (overlap.Width >= 100 && overlap.Height >= 20)
                {
                    return true;
                }
            }

            return false;
        }

        // ---------------------------------------------------------------- File operations

        private Task NewDocumentAsync()
        {
            ActivateDocument(AddDocument(new DocumentTab(CreateEditor())));
            return Task.CompletedTask;
        }

        private async Task OpenDocumentAsync()
        {
            using var dialog = new OpenFileDialog
            {
                Filter = "Markdown files (*.md;*.markdown)|*.md;*.markdown|All files (*.*)|*.*",
                Multiselect = true,
            };
            if (dialog.ShowDialog(this) == DialogResult.OK)
            {
                foreach (var file in dialog.FileNames)
                {
                    await OpenPathAsync(file);
                }
            }
        }

        /// <summary>Opens <paramref name="path"/> in a tab, switching to it if it is already open.</summary>
        private async Task<DocumentTab?> OpenPathAsync(string path)
        {
            try
            {
                var fullPath = Path.GetFullPath(path);
                var existing = _documents.FirstOrDefault(d =>
                    d.FilePath is { } p && string.Equals(Path.GetFullPath(p), fullPath, StringComparison.OrdinalIgnoreCase));
                if (existing is not null)
                {
                    ActivateDocument(existing);
                    return existing;
                }

                var service = new FileManagementService();
                var text = await service.OpenFileAsync(path);

                var replaceable = _active is { IsPristine: true } ? _active : null;
                var doc = AddDocument(new DocumentTab(CreateEditor(), service));
                SetText(doc, text);
                ActivateDocument(doc);
                if (replaceable is not null)
                {
                    RemoveDocument(replaceable);
                }

                RefreshTab(doc);
                _settings.AddRecent(path);
                RebuildRecentMenu();
                return doc;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
            {
                AppLogger.Error($"Failed to open '{path}'.", ex);
                MessageBox.Show(this, $"Could not open the file:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return null;
            }
        }

        private async Task<bool> SaveDocumentAsync(DocumentTab? doc = null)
        {
            doc ??= _active;
            var path = doc.FilePath;
            if (path is null)
            {
                return await SaveDocumentAsAsync(doc);
            }

            return await SaveToAsync(doc, path);
        }

        private async Task<bool> SaveDocumentAsAsync(DocumentTab? doc = null)
        {
            doc ??= _active;
            using var dialog = new SaveFileDialog
            {
                Filter = "Markdown files (*.md)|*.md|All files (*.*)|*.*",
                FileName = doc.FilePath is { } current ? Path.GetFileName(current) : "Untitled.md",
            };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return false;
            }

            return await SaveToAsync(doc, dialog.FileName);
        }

        private async Task<bool> SaveToAsync(DocumentTab doc, string path)
        {
            try
            {
                await doc.File.SaveFileAsync(path, doc.Editor.Text);
                doc.Editor.Modified = false;
                _settings.AddRecent(path);
                RebuildRecentMenu();
                _recovery.Clear(doc.Id);
                RefreshTab(doc);
                if (ReferenceEquals(doc, _active))
                {
                    UpdateEncodingStatus();
                }

                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
            {
                AppLogger.Error($"Failed to save '{path}'.", ex);
                MessageBox.Show(this, $"Could not save the file:\n{ex.Message}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        private async Task OnAutoSaveTickAsync()
        {
            foreach (var doc in _documents.Where(d => d.FilePath is not null && d.IsModified).ToList())
            {
                await SaveToAsync(doc, doc.FilePath!);
            }
        }

        private void RebuildRecentMenu()
        {
            _recentMenu.Items.Clear();
            if (_settings.RecentFiles.Count == 0)
            {
                _recentMenu.Items.Add(new ToolStripMenuItem("(No recent files)") { Enabled = false });
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

                    await OpenPathAsync(path);
                };
                _recentMenu.Items.Add(item);
            }

            ThemeApplier.ApplyToolStrip(_recentMenu, _palette);
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

        private void SetEditorText(string text) => SetText(_active, text);

        private void SetText(DocumentTab doc, string text)
        {
            _suppressTextEvents = true;
            doc.Editor.Text = text;
            doc.Editor.ClearUndo();
            doc.Editor.Modified = false;
            _suppressTextEvents = false;
        }

        private void OnEditorTextChanged(object? sender, EventArgs e)
        {
            if (!ReferenceEquals(sender, _active?.Editor))
            {
                return;
            }

            UpdateModifiedStatus();
            if (_suppressTextEvents)
            {
                return;
            }

            ScheduleRender();
            _recoveryDebouncer.Debounce(() =>
            {
                SaveRecoverySnapshots();
                return Task.CompletedTask;
            });

            if (_findBar.Visible)
            {
                RunSearch(selectCurrent: false);
            }
        }

        private void SaveRecoverySnapshots()
        {
            foreach (var doc in _documents)
            {
                if (doc.IsModified)
                {
                    _recovery.Save(doc.FilePath, doc.Editor.Text, doc.Id);
                }
                else
                {
                    _recovery.Clear(doc.Id);
                }
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
                case Keys.Control | Keys.V:
                    if (Clipboard.ContainsText())
                    {
                        ((RichTextBox)sender!).SelectedText = Clipboard.GetText(TextDataFormat.UnicodeText);
                        e.Handled = true;
                        e.SuppressKeyPress = true;
                    }
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
                case Keys.Control | Keys.Oemplus:
                case Keys.Control | Keys.Add:
                    Zoom(10);
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.OemMinus:
                case Keys.Control | Keys.Subtract:
                    Zoom(-10);
                    e.Handled = true;
                    break;
                case Keys.Control | Keys.D0:
                    Zoom(0, reset: true);
                    e.Handled = true;
                    break;
                case Keys.F1:
                    ShowHelp("Getting started");
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
            foreach (var doc in _documents)
            {
                var wasModified = doc.Editor.Modified;
                doc.Editor.Font = CreateEditorFont();
                doc.Editor.Modified = wasModified;
            }
        }

        private void SetOutlineVisible(bool visible)
        {
            _settings.ShowOutline = visible;
            _outerSplit.Panel1Collapsed = !visible;
            UpdateRibbonState();
        }

        private void SetWordWrap(bool wrap)
        {
            _settings.WordWrap = wrap;
            foreach (var doc in _documents)
            {
                doc.Editor.WordWrap = wrap;
            }

            UpdateRibbonState();
        }

        private void SetViewMode(string mode)
        {
            _settings.ViewMode = mode;
            _innerSplit.Panel1Collapsed = mode == "preview";
            _innerSplit.Panel2Collapsed = mode == "editor";
            if (mode == "split")
            {
                ResetInnerSplit();
            }

            UpdateRibbonState();
            if (mode != "editor")
            {
                ScheduleRender();
            }
        }

        private void SetSplitOrientation(bool sideBySide)
        {
            _settings.VerticalSplit = sideBySide;
            _innerSplit.Orientation = sideBySide ? Orientation.Vertical : Orientation.Horizontal;
            ResetInnerSplit();
            UpdateRibbonState();
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
            _ribbon.ApplyTheme(_palette);
            _tabStrip.ApplyTheme(_palette);
            ThemeApplier.ApplyToolStrip(_statusStrip, _palette);

            _editorHost.BackColor = _palette.EditorBack;
            foreach (var doc in _documents)
            {
                var wasModified = doc.Editor.Modified;
                doc.Editor.BackColor = _palette.EditorBack;
                doc.Editor.ForeColor = _palette.EditorText;
                doc.Editor.Modified = wasModified;
                ThemeApplier.ApplyScrollbars(doc.Editor, _palette);
            }

            _outlinePanel.BackColor = _palette.Surface;
            _outlineHeader.BackColor = _palette.Surface;
            _outlineHeader.ForeColor = _palette.MutedText;
            _outlineTree.BackColor = _palette.Surface;
            _outlineTree.ForeColor = _palette.Text;
            ThemeApplier.ApplyScrollbars(_outlineTree, _palette);
            _outerSplit.BackColor = _palette.Border;
            _innerSplit.BackColor = _palette.Border;

            _findBar.ApplyTheme(_palette);
            RebuildRecentMenu();
            if (_previewReady)
            {
                PostToPreview(new { type = "theme", theme = _palette.PreviewTheme });
            }

            UpdateRibbonState();
        }

        private void UpdateModifiedStatus()
        {
            _statusModified.Text = _editor.Modified ? "\u25CF Unsaved changes" : "Saved";
        }

        private void UpdateEncodingStatus()
        {
            var format = _fileService.CurrentFormat;
            _statusEncoding.Text = $"{format.EncodingName} \u00B7 {format.LineEndingName}";
        }

        private void UpdateCaretStatus()
        {
            if (_active is null)
            {
                return;
            }

            var text = _editor.Text;
            var index = new LineIndex(text);
            var caret = _editor.SelectionStart;
            var line = index.GetLineFromOffset(caret);
            var column = index.GetColumnFromOffset(caret);
            _statusPosition.Text = $"Ln {line + 1}, Col {column + 1}";

            var stats = TextStatistics.Compute(text);
            _statusStats.Text = $"{stats.Words:N0} words \u00B7 {stats.Characters:N0} chars \u00B7 {stats.ReadingMinutes} min read";

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
                new PaletteItem("New Tab", "Ctrl+T", () => _ = NewDocumentAsync()),
                new PaletteItem("Open File...", "Ctrl+O", () => _ = OpenDocumentAsync()),
                new PaletteItem("Close Tab", "Ctrl+W", () => _ = CloseDocumentAsync(_active)),
                new PaletteItem("Next Tab", "Ctrl+Tab", () => CycleTabs(1)),
                new PaletteItem("Previous Tab", "Ctrl+Shift+Tab", () => CycleTabs(-1)),
                new PaletteItem("Save", "Ctrl+S", () => _ = SaveDocumentAsync()),
                new PaletteItem("Save As...", "Ctrl+Shift+S", () => _ = SaveDocumentAsAsync()),
                new PaletteItem("Export as HTML...", string.Empty, () => _ = ExportHtmlAsync()),
                new PaletteItem("Export as Word Document...", string.Empty, () => _ = ExportDocxAsync()),
                new PaletteItem("Export as PDF...", string.Empty, () => _ = ExportPdfAsync()),
                new PaletteItem("Toggle Document Outline", string.Empty, () => SetOutlineVisible(!_settings.ShowOutline)),
                new PaletteItem("Toggle Word Wrap", string.Empty, () => SetWordWrap(!_settings.WordWrap)),
                new PaletteItem("Show Editor Only", string.Empty, () => SetViewMode("editor")),
                new PaletteItem("Show Preview Only", string.Empty, () => SetViewMode("preview")),
                new PaletteItem("Show Editor and Preview", string.Empty, () => SetViewMode("split")),
                new PaletteItem("Switch to Dark Theme", string.Empty, () => SetTheme("dark")),
                new PaletteItem("Switch to Light Theme", string.Empty, () => SetTheme("light")),
                new PaletteItem("Help: User Guide", "F1", () => ShowHelp("Getting started")),
                new PaletteItem("Help: Keyboard Shortcuts", string.Empty, () => ShowHelp("Keyboard shortcuts")),
                new PaletteItem("Help: About MyMDEditor", string.Empty, () => ShowHelp("About")),
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
                    if (_resyncPreviewAfterRender)
                    {
                        _resyncPreviewAfterRender = false;
                        var caretLine = new LineIndex(markdown).GetLineFromOffset(Math.Min(_editor.SelectionStart, markdown.Length));
                        SyncPreviewToLine(caretLine, scroll: true, flash: false);
                    }
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
                _ribbon.Dispose();
                _tabStrip.Dispose();
                foreach (var doc in _documents)
                {
                    doc.Dispose();
                }
            }

            base.Dispose(disposing);
        }
    }
}
