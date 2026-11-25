using MyMDEditor.Services;
using MyMDEditor.UI;

namespace MyMDEditor
{
    public sealed partial class MarkdownEditorForm
    {
        private static string? _editorFontFamily;

        private readonly ContextMenuStrip _recentMenu = new();

        private RichTextBox _editor => _active.Editor;

        private FileManagementService _fileService => _active.File;

        // ---------------------------------------------------------------- Editor controls

        private RichTextBox CreateEditor()
        {
            var editor = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BorderStyle = BorderStyle.None,
                AcceptsTab = true,
                HideSelection = false,
                DetectUrls = false,
                EnableAutoDragDrop = false,
                AutoWordSelection = false,
                ScrollBars = RichTextBoxScrollBars.Both,
                WordWrap = _settings.WordWrap,
                Font = CreateEditorFont(),
                BackColor = _palette.EditorBack,
                ForeColor = _palette.EditorText,
                Visible = false,
            };

            editor.TextChanged += OnEditorTextChanged;
            editor.KeyDown += OnEditorKeyDown;
            editor.ModifiedChanged += (sender, _) =>
            {
                var doc = _documents.FirstOrDefault(d => ReferenceEquals(d.Editor, sender));
                if (doc is null)
                {
                    return;
                }

                RefreshTab(doc);
                if (ReferenceEquals(doc, _active))
                {
                    UpdateModifiedStatus();
                }
            };
            return editor;
        }

        /// <summary>The title-bar icon: the embedded AppIcon.ico, falling back to the executable's own icon.</summary>
        private static Icon? LoadAppIcon()
        {
            try
            {
                var assembly = typeof(MarkdownEditorForm).Assembly;
                var name = assembly.GetManifestResourceNames().FirstOrDefault(n => n.EndsWith("AppIcon.ico", StringComparison.OrdinalIgnoreCase));
                if (name is not null)
                {
                    using var stream = assembly.GetManifestResourceStream(name);
                    if (stream is not null)
                    {
                        return new Icon(stream);
                    }
                }

                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch (Exception ex) when (ex is IOException or ArgumentException or InvalidOperationException)
            {
                return null;
            }
        }

        private Font CreateEditorFont()
        {
            _editorFontFamily ??= new[] { "Cascadia Code", "Cascadia Mono", "Consolas" }
                .FirstOrDefault(name => FontFamily.Families.Any(f => string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase)))
                ?? "Consolas";
            return new Font(_editorFontFamily, 11.5F * _settings.ZoomPercent / 100F);
        }

        // ---------------------------------------------------------------- Document lifecycle

        private DocumentTab AddDocument(DocumentTab doc)
        {
            _documents.Add(doc);
            _editorHost.Controls.Add(doc.Editor);
            if (_editorHost.IsHandleCreated)
            {
                _ = doc.Editor.Handle;
            }

            // Applying the font and colours marks a RichTextBox as modified; a new tab starts clean.
            doc.Editor.Modified = false;

            _tabStrip.AddTab(doc.Title, doc.Tooltip, doc.IsModified);
            return doc;
        }

        private void RemoveDocument(DocumentTab doc)
        {
            var index = _documents.IndexOf(doc);
            if (index < 0)
            {
                return;
            }

            _documents.RemoveAt(index);
            _tabStrip.RemoveTabAt(index);
            _editorHost.Controls.Remove(doc.Editor);
            _recovery.Clear(doc.Id);
            if (ReferenceEquals(doc, _active))
            {
                _active = null!;
                _search = null;
            }

            doc.Dispose();
        }

        private void ActivateDocument(DocumentTab doc)
        {
            var index = _documents.IndexOf(doc);
            if (index < 0)
            {
                return;
            }

            if (ReferenceEquals(doc, _active))
            {
                if (_tabStrip.SelectedIndex != index)
                {
                    _tabStrip.SelectedIndex = index;
                }

                return;
            }

            if (_active is not null && _search is not null)
            {
                ClearHighlights();
            }

            _search = null;
            var previous = _active;
            _active = doc;
            if (previous is not null)
            {
                previous.Editor.Visible = false;
            }

            // Showing the control creates its window handle, which can re-raise change events.
            var wasModified = doc.Editor.Modified;
            _suppressTextEvents = true;
            doc.Editor.Visible = true;
            doc.Editor.BringToFront();
            if (doc.Editor.Modified != wasModified)
            {
                doc.Editor.Modified = wasModified;
            }

            _suppressTextEvents = false;

            if (_tabStrip.SelectedIndex != index)
            {
                _tabStrip.SelectedIndex = index;
            }

            _lastCaretLine = -1;
            _outline = Array.Empty<OutlineEntry>();
            _outlineSignature = "\0";
            _resyncPreviewAfterRender = true;

            RefreshTab(doc);
            UpdateModifiedStatus();
            UpdateEncodingStatus();
            UpdateCaretStatus();
            if (_findBar.Visible)
            {
                RunSearch(selectCurrent: false);
            }

            _ = RenderPreviewAsync();
            doc.Editor.Focus();
        }

        private async Task<bool> CloseDocumentAsync(DocumentTab? doc)
        {
            if (doc is null || !_documents.Contains(doc))
            {
                return false;
            }

            if (_documents.Count == 1 && doc.IsPristine)
            {
                return true;
            }

            if (doc.IsModified)
            {
                ActivateDocument(doc);
                var choice = MessageBox.Show(this, $"Save changes to {doc.Title} before closing?", "MyMDEditor",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
                if (choice == DialogResult.Cancel || (choice == DialogResult.Yes && !await SaveDocumentAsync(doc)))
                {
                    return false;
                }
            }

            var index = _documents.IndexOf(doc);
            var wasActive = ReferenceEquals(doc, _active);
            RemoveDocument(doc);
            if (_documents.Count == 0)
            {
                ActivateDocument(AddDocument(new DocumentTab(CreateEditor())));
            }
            else if (wasActive)
            {
                ActivateDocument(_documents[Math.Min(index, _documents.Count - 1)]);
            }

            return true;
        }

        private void RefreshTab(DocumentTab doc)
        {
            var index = _documents.IndexOf(doc);
            if (index < 0)
            {
                return;
            }

            _tabStrip.UpdateTab(index, doc.Title, doc.Tooltip, doc.IsModified);
            if (ReferenceEquals(doc, _active))
            {
                Text = $"{(doc.IsModified ? "\u25CF " : string.Empty)}{doc.Title} - MyMDEditor";
            }
        }

        private void ShowTabContextMenu(int index, Point screenLocation)
        {
            if (index < 0 || index >= _documents.Count)
            {
                return;
            }

            var target = _documents[index];
            var menu = new ContextMenuStrip();

            ToolStripMenuItem Item(string text, Func<Task> action, bool enabled = true)
            {
                var item = new ToolStripMenuItem(text) { Enabled = enabled };
                item.Click += async (_, _) => await action();
                menu.Items.Add(item);
                return item;
            }

            async Task CloseAll(IEnumerable<DocumentTab> docs)
            {
                foreach (var doc in docs.ToList())
                {
                    if (!await CloseDocumentAsync(doc))
                    {
                        return;
                    }
                }

                if (_documents.Contains(target))
                {
                    ActivateDocument(target);
                }
            }

            Item("Close", () => CloseDocumentAsync(target));
            Item("Close Others", () => CloseAll(_documents.Where(d => !ReferenceEquals(d, target))), _documents.Count > 1);
            Item("Close Tabs to the Right", () => CloseAll(_documents.Skip(index + 1)), index < _documents.Count - 1);
            menu.Items.Add(new ToolStripSeparator());
            Item("Save", () => SaveDocumentAsync(target));
            menu.Items.Add(new ToolStripSeparator());
            Item("Copy Full Path", () =>
            {
                if (target.FilePath is { } path)
                {
                    Clipboard.SetText(path);
                }

                return Task.CompletedTask;
            }, target.FilePath is not null);
            Item("Show in File Explorer", () =>
            {
                if (target.FilePath is { } path && File.Exists(path))
                {
                    System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{path}\"");
                }

                return Task.CompletedTask;
            }, target.FilePath is not null);

            ThemeApplier.ApplyToolStrip(menu, _palette);
            menu.Closed += (_, _) => BeginInvoke(menu.Dispose);
            menu.Show(screenLocation);
        }
    }
}
