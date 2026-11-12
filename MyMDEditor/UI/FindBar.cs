using MyMDEditor.Services.Search;

namespace MyMDEditor.UI
{
    /// <summary>VS Code-style find/replace bar shown above the editor.</summary>
    public sealed class FindBar : UserControl
    {
        private readonly TextBox _query = new();
        private readonly TextBox _replace = new();
        private readonly CheckBox _case = MakeToggle("Aa", "Match case (Alt+C)");
        private readonly CheckBox _word = MakeToggle("ab|", "Match whole word (Alt+W)");
        private readonly CheckBox _regex = MakeToggle(".*", "Use regular expression (Alt+R)");
        private readonly Label _status = new() { AutoSize = false, Width = 150, TextAlign = ContentAlignment.MiddleLeft };
        private readonly Button _prev = MakeButton("\u2191", "Previous match (Shift+F3)");
        private readonly Button _next = MakeButton("\u2193", "Next match (F3)");
        private readonly Button _close = MakeButton("\u2715", "Close (Escape)");
        private readonly Button _replaceOne = MakeButton("Replace", "Replace (Enter in replace box)");
        private readonly Button _replaceAll = MakeButton("All", "Replace all (Ctrl+Alt+Enter)");
        private readonly CheckBox _toggleReplace = MakeToggle("\u203A", "Toggle replace (Ctrl+H)");
        private readonly FlowLayoutPanel _replaceRow;
        private readonly ToolTip _tips = new();

        public event EventHandler? QueryChanged;
        public event EventHandler? NextRequested;
        public event EventHandler? PreviousRequested;
        public event EventHandler? ReplaceRequested;
        public event EventHandler? ReplaceAllRequested;
        public event EventHandler? CloseRequested;

        public FindBar()
        {
            AccessibleName = "Find and replace";
            AccessibleRole = AccessibleRole.Grouping;
            Padding = new Padding(6, 4, 6, 4);
            Height = 36;

            _query.Width = 260;
            _query.AccessibleName = "Find";
            _query.PlaceholderText = "Find";
            _replace.Width = 260;
            _replace.AccessibleName = "Replace with";
            _replace.PlaceholderText = "Replace";
            _status.AccessibleName = "Match count";
            _status.AccessibleRole = AccessibleRole.StaticText;

            var findRow = Row();
            findRow.Controls.AddRange(new Control[] { _toggleReplace, _query, _case, _word, _regex, _status, _prev, _next, _close });
            _replaceRow = Row();
            _replaceRow.Padding = new Padding(_toggleReplace.Width + 3, 0, 0, 0);
            _replaceRow.Controls.AddRange(new Control[] { _replace, _replaceOne, _replaceAll });
            _replaceRow.Visible = false;

            var stack = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, AutoSize = true };
            stack.Controls.Add(findRow, 0, 0);
            stack.Controls.Add(_replaceRow, 0, 1);
            Controls.Add(stack);

            foreach (Control c in new Control[] { _case, _word, _regex, _prev, _next, _close, _replaceOne, _replaceAll, _toggleReplace })
            {
                _tips.SetToolTip(c, c.AccessibleDescription);
            }

            _query.TextChanged += (_, _) => QueryChanged?.Invoke(this, EventArgs.Empty);
            _case.CheckedChanged += (_, _) => QueryChanged?.Invoke(this, EventArgs.Empty);
            _word.CheckedChanged += (_, _) => QueryChanged?.Invoke(this, EventArgs.Empty);
            _regex.CheckedChanged += (_, _) => QueryChanged?.Invoke(this, EventArgs.Empty);
            _prev.Click += (_, _) => PreviousRequested?.Invoke(this, EventArgs.Empty);
            _next.Click += (_, _) => NextRequested?.Invoke(this, EventArgs.Empty);
            _close.Click += (_, _) => CloseRequested?.Invoke(this, EventArgs.Empty);
            _replaceOne.Click += (_, _) => ReplaceRequested?.Invoke(this, EventArgs.Empty);
            _replaceAll.Click += (_, _) => ReplaceAllRequested?.Invoke(this, EventArgs.Empty);
            _toggleReplace.CheckedChanged += (_, _) => SetReplaceVisible(_toggleReplace.Checked);

            _query.KeyDown += OnQueryKeyDown;
            _replace.KeyDown += OnReplaceKeyDown;
        }

        public SearchOptions Options => new(_query.Text, _case.Checked, _word.Checked, _regex.Checked);

        public string ReplacementText => _replace.Text;

        public bool ReplaceVisible => _replaceRow.Visible;

        public void ShowFind(string? seed, bool withReplace)
        {
            if (!string.IsNullOrEmpty(seed) && !seed.Contains('\n'))
            {
                _query.Text = seed;
            }

            _toggleReplace.Checked = withReplace || _toggleReplace.Checked && ReplaceVisible;
            SetReplaceVisible(withReplace);
            Visible = true;
            _query.Focus();
            _query.SelectAll();
        }

        public void SetStatus(string text, bool isError)
        {
            _status.Text = text;
            _status.ForeColor = isError ? Color.IndianRed : ForeColor;
            _query.BackColor = isError ? Color.FromArgb(90, 29, 29) : _queryBack;
            _query.AccessibleDescription = text;
        }

        private Color _queryBack = SystemColors.Window;

        public void ApplyTheme(ThemePalette palette)
        {
            BackColor = palette.Surface;
            ForeColor = palette.Text;
            _queryBack = palette.EditorBack;
            foreach (var box in new[] { _query, _replace })
            {
                box.BackColor = palette.EditorBack;
                box.ForeColor = palette.EditorText;
                box.BorderStyle = BorderStyle.FixedSingle;
            }

            foreach (var c in new Control[] { _case, _word, _regex, _prev, _next, _close, _replaceOne, _replaceAll, _toggleReplace })
            {
                c.ForeColor = palette.Text;
                c.BackColor = palette.Surface;
                if (c is ButtonBase b)
                {
                    b.FlatAppearance.BorderColor = palette.Border;
                    b.FlatAppearance.CheckedBackColor = palette.Accent;
                    b.FlatAppearance.MouseOverBackColor = palette.SurfaceAlt;
                }
            }

            _status.ForeColor = palette.MutedText;
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            switch (keyData)
            {
                case Keys.Escape:
                    CloseRequested?.Invoke(this, EventArgs.Empty);
                    return true;
                case Keys.Alt | Keys.C:
                    _case.Checked = !_case.Checked;
                    return true;
                case Keys.Alt | Keys.W:
                    _word.Checked = !_word.Checked;
                    return true;
                case Keys.Alt | Keys.R:
                    _regex.Checked = !_regex.Checked;
                    return true;
                case Keys.Control | Keys.Alt | Keys.Enter:
                    ReplaceAllRequested?.Invoke(this, EventArgs.Empty);
                    return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void OnQueryKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                (e.Shift ? PreviousRequested : NextRequested)?.Invoke(this, EventArgs.Empty);
            }
        }

        private void OnReplaceKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                ReplaceRequested?.Invoke(this, EventArgs.Empty);
            }
        }

        private void SetReplaceVisible(bool visible)
        {
            _replaceRow.Visible = visible;
            _toggleReplace.Checked = visible;
            _toggleReplace.Text = visible ? "\u2304" : "\u203A";
            Height = visible ? 68 : 36;
        }

        private static FlowLayoutPanel Row() => new()
        {
            AutoSize = true,
            WrapContents = false,
            Dock = DockStyle.Top,
            Margin = Padding.Empty,
            FlowDirection = FlowDirection.LeftToRight,
        };

        private static CheckBox MakeToggle(string text, string description) => new()
        {
            Appearance = Appearance.Button,
            Text = text,
            AccessibleName = description.Split(" (")[0],
            AccessibleDescription = description,
            FlatStyle = FlatStyle.Flat,
            Width = 32,
            Height = 26,
            TextAlign = ContentAlignment.MiddleCenter,
            Margin = new Padding(2, 1, 2, 1),
        };

        private static Button MakeButton(string text, string description) => new()
        {
            Text = text,
            AccessibleName = description.Split(" (")[0],
            AccessibleDescription = description,
            FlatStyle = FlatStyle.Flat,
            AutoSize = text.Length > 1,
            Width = 30,
            Height = 26,
            Margin = new Padding(2, 1, 2, 1),
        };

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _tips.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
