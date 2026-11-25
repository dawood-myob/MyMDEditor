using System.Drawing.Drawing2D;

namespace MyMDEditor.UI
{
    /// <summary>
    /// A segmented control of independent show/hide toggles (Outline, Editor, Preview). Each segment shows an icon and a
    /// label; a segment can be disabled with an explanatory tooltip when hiding it would leave nothing to look at.
    /// </summary>
    public sealed class PaneSwitcher : Control
    {
        private sealed class Segment
        {
            public string Glyph = string.Empty;
            public string Text = string.Empty;
            public string Tooltip = string.Empty;
            public string DisabledTooltip = string.Empty;
            public bool Checked;
            public bool Enabled = true;
        }

        private readonly List<Segment> _segments = new();
        private readonly Font _glyphFont = new("Segoe MDL2 Assets", 10F);
        private readonly Font _textFont = new("Segoe UI", 9F);
        private readonly ToolTip _tooltip = new() { InitialDelay = 400 };
        private ThemePalette _palette = ThemePalette.Dark;
        private int _hover = -1;
        private int _down = -1;

        public PaneSwitcher()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            AccessibleName = "Pane visibility";
            AccessibleRole = AccessibleRole.Grouping;
            Cursor = Cursors.Hand;
        }

        /// <summary>Raised with the segment index when an enabled segment is clicked.</summary>
        public event Action<int>? SegmentClicked;

        public int Add(string glyph, string text, string tooltip, string disabledTooltip)
        {
            _segments.Add(new Segment { Glyph = glyph, Text = text, Tooltip = tooltip, DisabledTooltip = disabledTooltip });
            Size = GetPreferredSize(Size.Empty);
            Invalidate();
            return _segments.Count - 1;
        }

        public void SetState(int index, bool isChecked, bool enabled)
        {
            var segment = _segments[index];
            if (segment.Checked == isChecked && segment.Enabled == enabled)
            {
                return;
            }

            segment.Checked = isChecked;
            segment.Enabled = enabled;
            Invalidate();
        }

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            Invalidate();
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private int SegmentWidth(int index) =>
            TextRenderer.MeasureText(_segments[index].Text, _textFont, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding).Width
            + Dp(52);

        public override Size GetPreferredSize(Size proposedSize)
        {
            var width = 0;
            for (var i = 0; i < _segments.Count; i++)
            {
                width += SegmentWidth(i);
            }

            return new Size(width + 2, Dp(26));
        }

        private Rectangle SegmentRect(int index)
        {
            var x = 1;
            for (var i = 0; i < index; i++)
            {
                x += SegmentWidth(i);
            }

            return new Rectangle(x, 1, SegmentWidth(index), Height - 3);
        }

        private int HitTest(Point p)
        {
            for (var i = 0; i < _segments.Count; i++)
            {
                if (SegmentRect(i).Contains(p))
                {
                    return i;
                }
            }

            return -1;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(_palette.Window);
            if (_segments.Count == 0)
            {
                return;
            }

            var outer = new Rectangle(1, 1, Width - 3, Height - 3);
            using var shell = RoundedRect(outer, Dp(5));
            using (var fill = new SolidBrush(_palette.Surface))
            {
                g.FillPath(fill, shell);
            }

            var clip = g.Save();
            g.SetClip(shell, CombineMode.Intersect);
            for (var i = 0; i < _segments.Count; i++)
            {
                var segment = _segments[i];
                var rect = SegmentRect(i);
                if (segment.Checked)
                {
                    using var on = new SolidBrush(_palette.SurfaceAlt);
                    g.FillRectangle(on, rect);
                    using var accent = new SolidBrush(_palette.Accent);
                    g.FillRectangle(accent, rect.Left, rect.Bottom - Dp(2), rect.Width, Dp(2));
                }
                else if (segment.Enabled && (i == _down || i == _hover))
                {
                    using var hover = new SolidBrush(i == _down ? _palette.Border : _palette.SurfaceAlt);
                    g.FillRectangle(hover, rect);
                }

                if (i > 0)
                {
                    using var divider = new Pen(_palette.Border);
                    g.DrawLine(divider, rect.Left, rect.Top + Dp(5), rect.Left, rect.Bottom - Dp(5));
                }
            }

            g.Restore(clip);
            using (var border = new Pen(_palette.Border))
            {
                g.DrawPath(border, shell);
            }

            const TextFormatFlags centered = TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.NoClipping;
            for (var i = 0; i < _segments.Count; i++)
            {
                var segment = _segments[i];
                var rect = SegmentRect(i);
                var color = !segment.Enabled
                    ? Color.FromArgb(110, _palette.MutedText)
                    : segment.Checked ? _palette.Accent : _palette.MutedText;
                var textColor = !segment.Enabled
                    ? Color.FromArgb(110, _palette.MutedText)
                    : segment.Checked ? _palette.Text : _palette.MutedText;

                TextRenderer.DrawText(g, segment.Glyph, _glyphFont, new Rectangle(rect.Left + Dp(10), rect.Top, Dp(20), rect.Height),
                    color, centered | TextFormatFlags.HorizontalCenter);
                TextRenderer.DrawText(g, segment.Text, _textFont, new Rectangle(rect.Left + Dp(34), rect.Top, rect.Width - Dp(38), rect.Height),
                    textColor, centered | TextFormatFlags.Left);
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            var index = HitTest(e.Location);
            if (index == _hover)
            {
                return;
            }

            _hover = index;
            if (index >= 0)
            {
                var segment = _segments[index];
                _tooltip.SetToolTip(this, segment.Enabled ? segment.Tooltip : segment.DisabledTooltip);
                Cursor = segment.Enabled ? Cursors.Hand : Cursors.Default;
            }

            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            _hover = -1;
            _down = -1;
            Invalidate();
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left)
            {
                _down = HitTest(e.Location);
                Invalidate();
            }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            var pressed = _down;
            _down = -1;
            Invalidate();
            if (e.Button == MouseButtons.Left && pressed >= 0 && pressed == HitTest(e.Location) && _segments[pressed].Enabled)
            {
                SegmentClicked?.Invoke(pressed);
            }
        }

        protected override void OnDpiChangedAfterParent(EventArgs e)
        {
            base.OnDpiChangedAfterParent(e);
            Size = GetPreferredSize(Size.Empty);
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
                _tooltip.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
