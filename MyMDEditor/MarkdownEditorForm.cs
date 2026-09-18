using MyMDEditor.Services;

namespace MyMDEditor
{
    /// <summary>
    /// Markdown Editor with Live Preview.
    /// Developed by Dawood Ali for personal use — helps prepare Markdown content
    /// with a familiar, Word-like formatting experience and a GitHub-style preview.
    /// </summary>
    public partial class MarkdownEditorForm : Form
    {
        private readonly IMarkdownRenderingService _renderingService;
        private readonly IFileManagementService _fileService;
        private readonly Debouncer _debouncer;

        private const int DebounceDelayMilliseconds = 400;
        private const string AppTitle = "MyMDEditor - Markdown Editor with Live Preview";
        private readonly string? _initialFilePath;
        private bool _isDirty;
        private bool _webViewReady;
        private CancellationTokenSource? _renderCts;

        public MarkdownEditorForm() : this(null, new MarkdownRenderingService(), new FileManagementService())
        {
        }

        public MarkdownEditorForm(string? filePathToOpen) : this(filePathToOpen, new MarkdownRenderingService(), new FileManagementService())
        {
        }

        public MarkdownEditorForm(string? filePathToOpen, IMarkdownRenderingService renderingService, IFileManagementService fileService)
        {
            _initialFilePath = filePathToOpen;
            _renderingService = renderingService ?? throw new ArgumentNullException(nameof(renderingService));
            _fileService = fileService ?? throw new ArgumentNullException(nameof(fileService));
            _debouncer = new Debouncer(DebounceDelayMilliseconds);

            InitializeComponent();
        }

        private async void MarkdownEditorForm_Load(object? sender, EventArgs e)
        {
            try
            {
                await webView2Preview.EnsureCoreWebView2Async();
                _webViewReady = true;

                if (!string.IsNullOrEmpty(_initialFilePath))
                {
                    await LoadFileAsync(_initialFilePath);
                }

                await RenderPreviewAsync();
            }
            catch (Exception ex)
            {
                ShowError("Failed to initialize the preview control.", ex);
            }
        }

        private void MarkdownEditorForm_FormClosing(object? sender, FormClosingEventArgs e)
        {
            if (!_isDirty)
            {
                return;
            }

            var result = MessageBox.Show(
                "You have unsaved changes. Do you want to save before closing?",
                "Unsaved Changes",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Warning);

            if (result == DialogResult.Cancel)
            {
                e.Cancel = true;
            }
            else if (result == DialogResult.Yes)
            {
                e.Cancel = true;
                _ = SaveAsync(promptForPath: string.IsNullOrEmpty(_fileService.CurrentFilePath));
            }
        }

        private void RichTextBoxEditor_TextChanged(object? sender, EventArgs e)
        {
            _isDirty = true;
            UpdateStatus("Editing...");
            UpdateEditMenuState();
            _debouncer.Debounce(RenderPreviewAsync);
        }

        private void RichTextBoxEditor_SelectionChanged(object? sender, EventArgs e)
        {
            UpdateEditMenuState();
        }

        private async Task RenderPreviewAsync()
        {
            if (!_webViewReady)
            {
                return;
            }

            _renderCts?.Cancel();
            var cts = new CancellationTokenSource();
            _renderCts = cts;

            try
            {
                var markdown = richTextBoxEditor.Text;
                var html = await _renderingService.RenderToHtmlAsync(markdown, cts.Token);

                if (cts.Token.IsCancellationRequested)
                {
                    return;
                }

                webView2Preview.NavigateToString(html);
                UpdateStatus("Preview updated.");
            }
            catch (OperationCanceledException)
            {
                // Superseded by a newer render request; ignore.
            }
            catch (Exception ex)
            {
                ShowError("Failed to render Markdown preview.", ex);
            }
        }

        private async void OpenToolStripMenuItem_Click(object? sender, EventArgs e)
        {
            if (openFileDialog1.ShowDialog(this) != DialogResult.OK)
            {
                return;
            }

            await LoadFileAsync(openFileDialog1.FileName);
        }

        private async Task LoadFileAsync(string filePath)
        {
            try
            {
                UpdateStatus("Opening file...");
                var content = await _fileService.OpenFileAsync(filePath);
                richTextBoxEditor.Text = NormalizeLineEndings(content);
                richTextBoxEditor.ClearUndo();
                _isDirty = false;
                Text = $"{AppTitle} - [{Path.GetFileName(filePath)}]";
                UpdateStatus("File opened.");
                await RenderPreviewAsync();
            }
            catch (Exception ex)
            {
                ShowError("Failed to open the file.", ex);
            }
        }

        private async void SaveToolStripMenuItem_Click(object? sender, EventArgs e)
        {
            await SaveAsync(promptForPath: string.IsNullOrEmpty(_fileService.CurrentFilePath));
        }

        private async void SaveAsToolStripMenuItem_Click(object? sender, EventArgs e)
        {
            await SaveAsync(promptForPath: true);
        }

        private async Task SaveAsync(bool promptForPath)
        {
            var targetPath = _fileService.CurrentFilePath;

            if (promptForPath || string.IsNullOrEmpty(targetPath))
            {
                if (saveFileDialog1.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                targetPath = saveFileDialog1.FileName;
            }

            try
            {
                UpdateStatus("Saving file...");
                var contentToSave = richTextBoxEditor.Text.Replace("\r\n", "\n");
                await _fileService.SaveFileAsync(targetPath!, contentToSave);
                _isDirty = false;
                Text = $"{AppTitle} - [{Path.GetFileName(targetPath)}]";
                UpdateStatus("File saved.");
            }
            catch (Exception ex)
            {
                ShowError("Failed to save the file.", ex);
            }
        }

        private void ExitToolStripMenuItem_Click(object? sender, EventArgs e) => Close();

        private void UndoToolStripMenuItem_Click(object? sender, EventArgs e) => PerformUndo();

        private void RedoToolStripMenuItem_Click(object? sender, EventArgs e) => PerformRedo();

        private void CutToolStripMenuItem_Click(object? sender, EventArgs e) => PerformCut();

        private void CopyToolStripMenuItem_Click(object? sender, EventArgs e) => PerformCopy();

        private void PasteToolStripMenuItem_Click(object? sender, EventArgs e) => PastePlainText();

        private void SelectAllToolStripMenuItem_Click(object? sender, EventArgs e) => PerformSelectAll();

        private void PerformUndo()
        {
            if (richTextBoxEditor.CanUndo)
            {
                richTextBoxEditor.Undo();
            }
        }

        private void PerformRedo()
        {
            if (richTextBoxEditor.CanRedo)
            {
                richTextBoxEditor.Redo();
            }
        }

        private void PerformCut()
        {
            if (richTextBoxEditor.SelectionLength > 0)
            {
                richTextBoxEditor.Cut();
            }
        }

        private void PerformCopy()
        {
            if (richTextBoxEditor.SelectionLength > 0)
            {
                richTextBoxEditor.Copy();
            }
        }

        private void PerformSelectAll()
        {
            richTextBoxEditor.Focus();
            richTextBoxEditor.SelectAll();
        }

        private void UpdateEditMenuState()
        {
            undoToolStripMenuItem.Enabled = richTextBoxEditor.CanUndo;
            redoToolStripMenuItem.Enabled = richTextBoxEditor.CanRedo;
            cutToolStripMenuItem.Enabled = richTextBoxEditor.SelectionLength > 0;
            copyToolStripMenuItem.Enabled = richTextBoxEditor.SelectionLength > 0;
        }

        private void RichTextBoxEditor_KeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Control && !e.Alt && !e.Shift)
            {
                switch (e.KeyCode)
                {
                    case Keys.V:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        PastePlainText();
                        return;
                    case Keys.Z:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        PerformUndo();
                        return;
                    case Keys.Y:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        PerformRedo();
                        return;
                    case Keys.X:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        PerformCut();
                        return;
                    case Keys.C:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        PerformCopy();
                        return;
                    case Keys.A:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        PerformSelectAll();
                        return;
                    case Keys.B:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        ToggleInlineWrap("**");
                        return;
                    case Keys.I:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        ToggleInlineWrap("*");
                        return;
                    case Keys.K:
                        e.SuppressKeyPress = true;
                        e.Handled = true;
                        InsertLink();
                        return;
                }
            }
        }

        private void ToolStripButtonBold_Click(object? sender, EventArgs e) => ToggleInlineWrap("**");

        private void ToolStripButtonItalic_Click(object? sender, EventArgs e) => ToggleInlineWrap("*");

        private void ToolStripButtonStrikethrough_Click(object? sender, EventArgs e) => ToggleInlineWrap("~~");

        private void Heading1ToolStripMenuItem_Click(object? sender, EventArgs e) => PrefixSelectedLines("# ", exclusivePrefixes: HeadingPrefixes);

        private void Heading2ToolStripMenuItem_Click(object? sender, EventArgs e) => PrefixSelectedLines("## ", exclusivePrefixes: HeadingPrefixes);

        private void Heading3ToolStripMenuItem_Click(object? sender, EventArgs e) => PrefixSelectedLines("### ", exclusivePrefixes: HeadingPrefixes);

        private void ToolStripButtonBulletList_Click(object? sender, EventArgs e) => PrefixSelectedLines("- ");

        private void ToolStripButtonNumberedList_Click(object? sender, EventArgs e) => PrefixSelectedLinesNumbered();

        private void ToolStripButtonQuote_Click(object? sender, EventArgs e) => PrefixSelectedLines("> ");

        private void ToolStripButtonInlineCode_Click(object? sender, EventArgs e) => ToggleInlineWrap("`");

        private void ToolStripButtonCodeBlock_Click(object? sender, EventArgs e) => InsertCodeBlock();

        private void ToolStripButtonLink_Click(object? sender, EventArgs e) => InsertLink();

        private void ToolStripButtonHorizontalRule_Click(object? sender, EventArgs e) => InsertAtCursor("\r\n---\r\n");

        private void ToolStripButtonTable_Click(object? sender, EventArgs e) =>
            InsertAtCursor("\r\n| Column 1 | Column 2 |\r\n| --- | --- |\r\n| Value 1 | Value 2 |\r\n");

        private static readonly string[] HeadingPrefixes = { "# ", "## ", "### ", "#### ", "##### ", "###### " };

        private void ToggleInlineWrap(string wrapper)
        {
            richTextBoxEditor.Focus();
            var selectedText = richTextBoxEditor.SelectedText;

            if (selectedText.StartsWith(wrapper) && selectedText.EndsWith(wrapper) && selectedText.Length >= wrapper.Length * 2)
            {
                richTextBoxEditor.SelectedText = selectedText.Substring(wrapper.Length, selectedText.Length - wrapper.Length * 2);
            }
            else
            {
                var start = richTextBoxEditor.SelectionStart;
                var text = string.IsNullOrEmpty(selectedText) ? "text" : selectedText;
                richTextBoxEditor.SelectedText = $"{wrapper}{text}{wrapper}";
                richTextBoxEditor.Select(start + wrapper.Length, text.Length);
            }
        }

        /// <summary>
        /// Applies a line prefix (heading/list/quote) to the selected lines by
        /// replacing the selected span's text via SelectedText, which keeps the
        /// operation on the RichTextBox's undo stack (unlike assigning to Lines).
        /// </summary>
        private void PrefixSelectedLines(string prefix, string[]? exclusivePrefixes = null)
        {
            richTextBoxEditor.Focus();

            var firstLineIndex = richTextBoxEditor.GetLineFromCharIndex(richTextBoxEditor.SelectionStart);
            var lastLineIndex = richTextBoxEditor.GetLineFromCharIndex(richTextBoxEditor.SelectionStart + richTextBoxEditor.SelectionLength);

            var lines = richTextBoxEditor.Lines;
            var spanStart = richTextBoxEditor.GetFirstCharIndexFromLine(firstLineIndex);
            var spanEnd = lastLineIndex + 1 < lines.Length
                ? richTextBoxEditor.GetFirstCharIndexFromLine(lastLineIndex + 1) - Environment.NewLine.Length
                : richTextBoxEditor.TextLength;

            var newLines = new List<string>();
            for (var i = firstLineIndex; i <= lastLineIndex && i < lines.Length; i++)
            {
                var line = lines[i];

                if (exclusivePrefixes is not null)
                {
                    foreach (var existingPrefix in exclusivePrefixes)
                    {
                        if (line.StartsWith(existingPrefix))
                        {
                            line = line.Substring(existingPrefix.Length);
                            break;
                        }
                    }
                }

                newLines.Add(line.StartsWith(prefix) ? line.Substring(prefix.Length) : prefix + line);
            }

            var replacement = string.Join("\r\n", newLines);
            richTextBoxEditor.Select(spanStart, spanEnd - spanStart);
            richTextBoxEditor.SelectedText = replacement;
            richTextBoxEditor.Select(spanStart, replacement.Length);
        }

        private void PrefixSelectedLinesNumbered()
        {
            richTextBoxEditor.Focus();

            var firstLineIndex = richTextBoxEditor.GetLineFromCharIndex(richTextBoxEditor.SelectionStart);
            var lastLineIndex = richTextBoxEditor.GetLineFromCharIndex(richTextBoxEditor.SelectionStart + richTextBoxEditor.SelectionLength);

            var lines = richTextBoxEditor.Lines;
            var spanStart = richTextBoxEditor.GetFirstCharIndexFromLine(firstLineIndex);
            var spanEnd = lastLineIndex + 1 < lines.Length
                ? richTextBoxEditor.GetFirstCharIndexFromLine(lastLineIndex + 1) - Environment.NewLine.Length
                : richTextBoxEditor.TextLength;

            var newLines = new List<string>();
            var number = 1;
            for (var i = firstLineIndex; i <= lastLineIndex && i < lines.Length; i++)
            {
                newLines.Add($"{number}. {lines[i]}");
                number++;
            }

            var replacement = string.Join("\r\n", newLines);
            richTextBoxEditor.Select(spanStart, spanEnd - spanStart);
            richTextBoxEditor.SelectedText = replacement;
            richTextBoxEditor.Select(spanStart, replacement.Length);
        }

        private void InsertCodeBlock()
        {
            richTextBoxEditor.Focus();
            var selectedText = richTextBoxEditor.SelectedText;
            var content = string.IsNullOrEmpty(selectedText) ? "code" : selectedText;
            richTextBoxEditor.SelectedText = $"```\r\n{content}\r\n```";
        }

        private void InsertLink()
        {
            richTextBoxEditor.Focus();
            var selectedText = richTextBoxEditor.SelectedText;
            var linkText = string.IsNullOrEmpty(selectedText) ? "link text" : selectedText;
            var start = richTextBoxEditor.SelectionStart;
            richTextBoxEditor.SelectedText = $"[{linkText}](url)";
            richTextBoxEditor.Select(start + linkText.Length + 3, 3);
        }

        private void InsertAtCursor(string text)
        {
            richTextBoxEditor.Focus();
            richTextBoxEditor.SelectedText = text;
        }

        private void PastePlainText()
        {
            if (!Clipboard.ContainsText())
            {
                return;
            }

            var plainText = NormalizeLineEndings(Clipboard.GetText(TextDataFormat.UnicodeText));
            richTextBoxEditor.SelectedText = plainText;
        }

        private static string NormalizeLineEndings(string text)
        {
            return text.Replace("\r\n", "\n").Replace("\n", "\r\n");
        }

        private void UpdateStatus(string message)
        {
            toolStripStatusLabelStatus.Text = message;
        }

        private void ShowError(string message, Exception ex)
        {
            UpdateStatus("Error.");
            MessageBox.Show(
                $"{message}{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "MyMDEditor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }

        private void AboutToolStripMenuItem_Click(object? sender, EventArgs e)
        {
            MessageBox.Show(
                "MyMDEditor\r\nMarkdown Editor with Live Preview\r\n\r\n" +
                "Developed by Dawood Ali\r\n" +
                "Tool developed for personal use only, for the preparation of Markdown content.",
                "About MyMDEditor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
    }
}
