using System.Drawing.Drawing2D;

namespace MyMDEditor.UI
{
    public enum GlyphKind
    {
        /// <summary>Segoe MDL2 Assets icon font code point.</summary>
        Icon,
        Text,
        Bold,
        Italic,
        Strike,
        Mono,
    }

    /// <summary>A ribbon command: a large (icon above caption) or small (icon beside caption) button.</summary>
    public sealed class RibbonButton : Control
    {
        private readonly bool _large;
        private readonly string _glyph;
        private readonly Font _glyphFont;
        private readonly Font _textFont = new("Segoe UI", 9F);
        private ThemePalette _palette = ThemePalette.Dark;
        private bool _hover;
        private bool _down;
        private bool _checked;

        public RibbonButton(string caption, string glyph, bool large, GlyphKind kind = GlyphKind.Icon)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
            Text = caption;
            _large = large;
            _glyph = glyph;
            _glyphFont = CreateGlyphFont(kind, glyph, large);
            AccessibleName = caption;
            AccessibleRole = AccessibleRole.PushButton;
            Cursor = Cursors.Hand;
            TabStop = true;
        }

        public bool Large => _large;

        /// <summary>When set, clicking shows this menu below the button instead of raising <see cref="Control.Click"/>.</summary>
        public ContextMenuStrip? DropDown { get; set; }

        public bool Checked
        {
            get => _checked;
            set
            {
                if (_checked != value)
                {
                    _checked = value;
                    Invalidate();
                }
            }
        }

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            Invalidate();
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private string DisplayText => DropDown is null ? Text : Text + " \u25BE";

        public override Size GetPreferredSize(Size proposedSize)
        {
            var textWidth = TextRenderer.MeasureText(DisplayText, _textFont, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding).Width;
            return _large
                ? new Size(Math.Max(Dp(52), textWidth + Dp(18)), Dp(64))
                : new Size(Dp(30) + textWidth + Dp(8), Dp(22));
        }

        private static Font CreateGlyphFont(GlyphKind kind, string glyph, bool large)
        {
            var size = large ? 17F : 10.5F;
            if (kind != GlyphKind.Icon && glyph.Length >= 3)
            {
                size *= 0.72F;
            }

            return kind switch
            {
                GlyphKind.Icon => new Font("Segoe MDL2 Assets", size),
                GlyphKind.Bold => new Font("Segoe UI", size, FontStyle.Bold),
                GlyphKind.Italic => new Font("Segoe UI", size, FontStyle.Italic),
                GlyphKind.Strike => new Font("Segoe UI", size, FontStyle.Strikeout),
                GlyphKind.Mono => new Font("Consolas", size, FontStyle.Bold),
                _ => new Font("Segoe UI Semibold", size),
            };
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(_palette.Surface);

            var bounds = new Rectangle(1, 1, Width - 3, Height - 3);
            if (_checked || _hover || _down)
            {
                var fill = _down ? _palette.Border : _checked ? _palette.SurfaceAlt : _palette.SurfaceAlt;
                using var path = RoundedRect(bounds, Dp(4));
                using var brush = new SolidBrush(fill);
                g.FillPath(brush, path);
                if (_checked)
                {
                    using var pen = new Pen(_palette.Accent, Math.Max(1.5F, Dp(1)));
                    g.DrawPath(pen, path);
                }
            }

            var glyphColor = _checked ? _palette.Accent : _palette.Text;
            const TextFormatFlags center = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter |
                                           TextFormatFlags.NoPadding | TextFormatFlags.NoClipping;
            if (_large)
            {
                var glyphRect = new Rectangle(0, Dp(4), Width, Dp(34));
                TextRenderer.DrawText(g, _glyph, _glyphFont, glyphRect, glyphColor, center);
                var textRect = new Rectangle(0, Dp(40), Width, Height - Dp(42));
                TextRenderer.DrawText(g, DisplayText, _textFont, textRect, _palette.Text, center | TextFormatFlags.EndEllipsis);
            }
            else
            {
                var glyphRect = new Rectangle(Dp(2), 0, Dp(26), Height);
                TextRenderer.DrawText(g, _glyph, _glyphFont, glyphRect, glyphColor, center);
                var textRect = new Rectangle(Dp(30), 0, Width - Dp(30), Height);
                TextRenderer.DrawText(g, DisplayText, _textFont, textRect, _palette.Text,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.EndEllipsis);
            }

            if (Focused && ShowFocusCues)
            {
                ControlPaint.DrawFocusRectangle(g, new Rectangle(2, 2, Width - 5, Height - 5), _palette.Text, _palette.Surface);
            }
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            _hover = true;
            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            _hover = false;
            _down = false;
            Invalidate();
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left)
            {
                _down = true;
                Invalidate();
            }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            _down = false;
            Invalidate();
        }

        protected override void OnClick(EventArgs e)
        {
            if (DropDown is not null)
            {
                DropDown.Show(this, new Point(0, Height));
                return;
            }

            base.OnClick(e);
        }

        protected override bool IsInputKey(Keys keyData) => keyData is Keys.Enter or Keys.Space || base.IsInputKey(keyData);

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (e.KeyCode is Keys.Enter or Keys.Space)
            {
                OnClick(EventArgs.Empty);
                e.Handled = true;
            }
        }

        protected override void OnGotFocus(EventArgs e)
        {
            base.OnGotFocus(e);
            Invalidate();
        }

        protected override void OnLostFocus(EventArgs e)
        {
            base.OnLostFocus(e);
            Invalidate();
        }

        private static GraphicsPath RoundedRect(Rectangle r, int radius)
        {
            var d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(r.Left, r.Top, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Top, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            path.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _glyphFont.Dispose();
                _textFont.Dispose();
            }

            base.Dispose(disposing);
        }
    }

    /// <summary>A captioned cluster of ribbon buttons. Large buttons take a full column; small ones stack three high.</summary>
    public sealed class RibbonGroup : Control
    {
        private readonly List<RibbonButton> _buttons = new();
        private readonly Font _captionFont = new("Segoe UI", 8.25F);
        private ThemePalette _palette = ThemePalette.Dark;

        public RibbonGroup(string caption)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            Caption = caption;
            AccessibleName = caption;
            AccessibleRole = AccessibleRole.Grouping;
        }

        public string Caption { get; }

        public IReadOnlyList<RibbonButton> Buttons => _buttons;

        public RibbonButton Add(RibbonButton button)
        {
            _buttons.Add(button);
            Controls.Add(button);
            return button;
        }

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            foreach (var button in _buttons)
            {
                button.ApplyTheme(palette);
            }

            Invalidate();
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        public void Relayout(int height)
        {
            var columns = new List<List<RibbonButton>>();
            foreach (var button in _buttons)
            {
                if (button.Large || columns.Count == 0 || columns[^1][0].Large || columns[^1].Count >= 3)
                {
                    columns.Add(new List<RibbonButton>());
                }

                columns[^1].Add(button);
            }

            var widths = columns.Select(c => c.Max(b => b.GetPreferredSize(Size.Empty).Width)).ToList();
            var contentWidth = widths.Sum() + Math.Max(0, columns.Count - 1) * Dp(2);
            var captionWidth = TextRenderer.MeasureText(Caption, _captionFont, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding).Width;
            var width = Math.Max(contentWidth + Dp(12), captionWidth + Dp(20));

            var x = (width - contentWidth) / 2;
            for (var i = 0; i < columns.Count; i++)
            {
                var y = Dp(4);
                foreach (var button in columns[i])
                {
                    var preferred = button.GetPreferredSize(Size.Empty);
                    button.SetBounds(x, y, widths[i], preferred.Height);
                    y += preferred.Height;
                }

                x += widths[i] + Dp(2);
            }

            Size = new Size(width + Dp(1), height);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(_palette.Surface);
            var captionRect = new Rectangle(0, Height - Dp(20), Width - Dp(1), Dp(18));
            TextRenderer.DrawText(g, Caption, _captionFont, captionRect, _palette.MutedText,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            using var pen = new Pen(_palette.Border);
            g.DrawLine(pen, Width - 1, Dp(6), Width - 1, Height - Dp(8));
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _captionFont.Dispose();
            }

            base.Dispose(disposing);
        }
    }

    /// <summary>One ribbon tab's body: groups laid out left to right.</summary>
    public sealed class RibbonPage : Control
    {
        private readonly List<RibbonGroup> _groups = new();

        public RibbonPage(string title)
        {
            Title = title;
            AccessibleName = title;
            AccessibleRole = AccessibleRole.PropertyPage;
        }

        public string Title { get; }

        public RibbonGroup AddGroup(string caption)
        {
            var group = new RibbonGroup(caption);
            _groups.Add(group);
            Controls.Add(group);
            return group;
        }

        public void ApplyTheme(ThemePalette palette)
        {
            BackColor = palette.Surface;
            foreach (var group in _groups)
            {
                group.ApplyTheme(palette);
            }
        }

        public void Relayout()
        {
            var x = (int)Math.Round(4 * DeviceDpi / 96.0);
            foreach (var group in _groups)
            {
                group.Relayout(Height);
                group.Location = new Point(x, 0);
                x += group.Width;
            }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            Relayout();
        }
    }

    /// <summary>Office-style ribbon: a strip of page tabs above a body that shows the selected page's groups.</summary>
    public sealed class RibbonBar : Control
    {
        private readonly List<RibbonPage> _pages = new();
        private readonly Font _tabFont = new("Segoe UI", 9.5F);
        private readonly ToolTip _tooltip = new() { InitialDelay = 500 };
        private ThemePalette _palette = ThemePalette.Dark;
        private PaneSwitcher? _switcher;
        private int _selected;
        private int _hover = -1;

        public RibbonBar()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            AccessibleName = "Ribbon";
            AccessibleRole = AccessibleRole.ToolBar;
            UpdateHeight();
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private int HeaderHeight => Dp(30);

        private int BodyHeight => Dp(90);

        private void UpdateHeight() => Height = HeaderHeight + BodyHeight + Dp(1);

        public RibbonPage AddPage(string title)
        {
            var page = new RibbonPage(title) { Dock = DockStyle.Bottom, Height = BodyHeight, Visible = _pages.Count == 0 };
            _pages.Add(page);
            Controls.Add(page);
            return page;
        }

        public RibbonButton AddButton(RibbonGroup group, RibbonButton button, string? tooltip = null)
        {
            group.Add(button);
            _tooltip.SetToolTip(button, tooltip ?? button.Text);
            return button;
        }

        /// <summary>Places <paramref name="switcher"/> at the right end of the page-tab row.</summary>
        public void SetHeaderSwitcher(PaneSwitcher switcher)
        {
            _switcher = switcher;
            Controls.Add(switcher);
            LayoutHeader();
        }

        private void LayoutHeader()
        {
            if (_switcher is null)
            {
                return;
            }

            _switcher.Location = new Point(Math.Max(Dp(10), Width - _switcher.Width - Dp(14)), Math.Max(0, (HeaderHeight - _switcher.Height) / 2));
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            LayoutHeader();
        }

        public void Finish()
        {
            foreach (var page in _pages)
            {
                page.Relayout();
            }

            LayoutHeader();
        }

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            BackColor = palette.Window;
            _switcher?.ApplyTheme(palette);
            foreach (var page in _pages)
            {
                page.ApplyTheme(palette);
            }

            Invalidate();
        }

        public int SelectedIndex
        {
            get => _selected;
            set
            {
                if (value < 0 || value >= _pages.Count || value == _selected)
                {
                    return;
                }

                _selected = value;
                for (var i = 0; i < _pages.Count; i++)
                {
                    _pages[i].Visible = i == _selected;
                }

                Invalidate();
            }
        }

        private Rectangle TabRect(int index)
        {
            var x = Dp(10);
            for (var i = 0; i < index; i++)
            {
                x += TabWidth(i);
            }

            return new Rectangle(x, 0, TabWidth(index), HeaderHeight);
        }

        private int TabWidth(int index) =>
            TextRenderer.MeasureText(_pages[index].Title, _tabFont, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding).Width + Dp(28);

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(_palette.Window);

            using (var body = new SolidBrush(_palette.Surface))
            {
                g.FillRectangle(body, 0, HeaderHeight, Width, Height - HeaderHeight);
            }

            using (var border = new Pen(_palette.Border))
            {
                g.DrawLine(border, 0, HeaderHeight, Width, HeaderHeight);
                g.DrawLine(border, 0, Height - 1, Width, Height - 1);
            }

            for (var i = 0; i < _pages.Count; i++)
            {
                var rect = TabRect(i);
                var selected = i == _selected;
                if (selected)
                {
                    using var brush = new SolidBrush(_palette.Surface);
                    g.FillRectangle(brush, rect.Left, rect.Top + Dp(3), rect.Width, rect.Height - Dp(3));
                    using var accent = new SolidBrush(_palette.Accent);
                    g.FillRectangle(accent, rect.Left + Dp(8), HeaderHeight - Dp(3), rect.Width - Dp(16), Dp(3));
                    using var border = new Pen(_palette.Border);
                    g.DrawLine(border, rect.Left, rect.Top + Dp(3), rect.Left, rect.Bottom);
                    g.DrawLine(border, rect.Right - 1, rect.Top + Dp(3), rect.Right - 1, rect.Bottom);
                    g.DrawLine(border, rect.Left, rect.Top + Dp(3), rect.Right - 1, rect.Top + Dp(3));
                    using var cover = new Pen(_palette.Surface);
                    g.DrawLine(cover, rect.Left + 1, HeaderHeight, rect.Right - 2, HeaderHeight);
                }
                else if (i == _hover)
                {
                    using var brush = new SolidBrush(_palette.SurfaceAlt);
                    g.FillRectangle(brush, rect.Left, rect.Top + Dp(4), rect.Width, rect.Height - Dp(4));
                }

                TextRenderer.DrawText(g, _pages[i].Title, _tabFont, rect, selected ? _palette.Accent : _palette.Text,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
            }
        }

        private int HitTab(Point p)
        {
            if (p.Y > HeaderHeight)
            {
                return -1;
            }

            for (var i = 0; i < _pages.Count; i++)
            {
                if (TabRect(i).Contains(p))
                {
                    return i;
                }
            }

            return -1;
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            var index = HitTab(e.Location);
            if (e.Button == MouseButtons.Left && index >= 0)
            {
                SelectedIndex = index;
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            var index = HitTab(e.Location);
            if (index != _hover)
            {
                _hover = index;
                Invalidate();
            }
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            _hover = -1;
            Invalidate();
        }

        protected override void OnDpiChangedAfterParent(EventArgs e)
        {
            base.OnDpiChangedAfterParent(e);
            UpdateHeight();
            foreach (var page in _pages)
            {
                page.Height = BodyHeight;
            }

            Finish();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _tabFont.Dispose();
                _tooltip.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
