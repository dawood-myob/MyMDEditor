using MyMDEditor.Services;

namespace MyMDEditor.UI
{
    /// <summary>An entry in the quick-jump / command palette.</summary>
    public sealed record PaletteItem(string Label, string Detail, Action Execute);

    /// <summary>
    /// Ctrl+P quick jump (headings; ":42" jumps to a line) and Ctrl+Shift+P command palette
    /// (or type "&gt;" in quick jump), modelled on VS Code.
    /// </summary>
    public sealed class QuickJumpDialog : Form
    {
        private readonly TextBox _input = new() { Dock = DockStyle.Top, BorderStyle = BorderStyle.FixedSingle };
        private readonly ListBox _list = new()
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            DrawMode = DrawMode.OwnerDrawFixed,
            IntegralHeight = false,
        };

        private readonly Func<IReadOnlyList<PaletteItem>> _headings;
        private readonly Func<IReadOnlyList<PaletteItem>> _commands;
        private readonly Action<int> _goToLine;
        private readonly ThemePalette _palette;
        private IReadOnlyList<PaletteItem> _visible = Array.Empty<PaletteItem>();

        public QuickJumpDialog(
            ThemePalette palette,
            Func<IReadOnlyList<PaletteItem>> headings,
            Func<IReadOnlyList<PaletteItem>> commands,
            Action<int> goToLine,
            bool commandMode)
        {
            _palette = palette;
            _headings = headings;
            _commands = commands;
            _goToLine = goToLine;

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            KeyPreview = true;
            Padding = new Padding(1);
            BackColor = palette.Border;
            Text = commandMode ? "Command palette" : "Go to heading";
            AccessibleName = Text;

            var inner = new Panel { Dock = DockStyle.Fill, BackColor = palette.Surface, Padding = new Padding(6) };
            _input.Font = new Font("Segoe UI", 11F);
            _input.BackColor = palette.EditorBack;
            _input.ForeColor = palette.EditorText;
            _input.AccessibleName = commandMode ? "Type a command" : "Type a heading, : for line or > for commands";
            _input.PlaceholderText = _input.AccessibleName;
            _list.Font = new Font("Segoe UI", 10F);
            _list.ItemHeight = 26;
            _list.BackColor = palette.Surface;
            _list.ForeColor = palette.Text;
            _list.AccessibleName = "Results";

            inner.Controls.Add(_list);
            inner.Controls.Add(new Panel { Dock = DockStyle.Top, Height = 6, BackColor = palette.Surface });
            inner.Controls.Add(_input);
            Controls.Add(inner);

            _input.Text = commandMode ? ">" : string.Empty;
            _input.TextChanged += (_, _) => Refilter();
            _list.DrawItem += DrawItem;
            _list.DoubleClick += (_, _) => Accept();
            Deactivate += (_, _) => Close();
            Refilter();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            _input.Focus();
            _input.SelectionStart = _input.TextLength;
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            switch (keyData)
            {
                case Keys.Escape:
                    Close();
                    return true;
                case Keys.Enter:
                    Accept();
                    return true;
                case Keys.Down:
                    Move(1);
                    return true;
                case Keys.Up:
                    Move(-1);
                    return true;
                case Keys.PageDown:
                    Move(10);
                    return true;
                case Keys.PageUp:
                    Move(-10);
                    return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void Move(int delta)
        {
            if (_list.Items.Count == 0)
            {
                return;
            }

            _list.SelectedIndex = Math.Clamp(_list.SelectedIndex + delta, 0, _list.Items.Count - 1);
        }

        private void Refilter()
        {
            var text = _input.Text;
            IReadOnlyList<PaletteItem> source;
            string query;

            if (text.StartsWith('>'))
            {
                source = _commands();
                query = text[1..];
            }
            else if (text.StartsWith(':'))
            {
                var ok = int.TryParse(text[1..].Trim(), out var line);
                source = ok
                    ? new[] { new PaletteItem($"Go to line {line}", string.Empty, () => _goToLine(line)) }
                    : new[] { new PaletteItem("Type a line number", string.Empty, () => { }) };
                query = string.Empty;
            }
            else
            {
                source = _headings();
                query = text;
                if (source.Count == 0)
                {
                    source = new[] { new PaletteItem("No headings in this document", "Type > for commands", () => { }) };
                }
            }

            _visible = FuzzyMatcher.Filter(source, query, i => i.Label);
            _list.BeginUpdate();
            _list.Items.Clear();
            foreach (var item in _visible)
            {
                _list.Items.Add(item.Label);
            }

            _list.EndUpdate();
            if (_list.Items.Count > 0)
            {
                _list.SelectedIndex = 0;
            }
        }

        private void Accept()
        {
            var index = _list.SelectedIndex;
            Close();
            if (index >= 0 && index < _visible.Count)
            {
                _visible[index].Execute();
            }
        }

        private void DrawItem(object? sender, DrawItemEventArgs e)
        {
            if (e.Index < 0 || e.Index >= _visible.Count)
            {
                return;
            }

            var selected = (e.State & DrawItemState.Selected) != 0;
            using var back = new SolidBrush(selected ? _palette.Accent : _palette.Surface);
            e.Graphics.FillRectangle(back, e.Bounds);

            var item = _visible[e.Index];
            var fore = selected ? _palette.AccentText : _palette.Text;
            var muted = selected ? _palette.AccentText : _palette.MutedText;
            var bounds = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, e.Bounds.Width - 16, e.Bounds.Height);
            TextRenderer.DrawText(e.Graphics, item.Label, e.Font, bounds, fore, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            TextRenderer.DrawText(e.Graphics, item.Detail, e.Font, bounds, muted, TextFormatFlags.VerticalCenter | TextFormatFlags.Right);
        }
    }
}
