using System.Drawing.Text;
using MyMDEditor.Services;

namespace MyMDEditor.UI
{
    /// <summary>
    /// The slim strip tab a minimised pane collapses to: its icon and caption (rotated on left and right edges).
    /// Hovering highlights it and clicking, Enter or Space restores the pane.
    /// </summary>
    public sealed class PaneRail : Control
    {
        private readonly string _caption;
        private readonly string _glyph;
        private readonly Font _glyphFont = new("Segoe MDL2 Assets", 10F);
        private readonly Font _captionFont = new("Segoe UI", 9F);
        private readonly ToolTip _tooltip = new() { InitialDelay = 400 };
        private ThemePalette _palette = ThemePalette.Dark;
        private DockPosition _edge = DockPosition.Left;
        private bool _hover;
        private bool _down;

        public PaneRail(PaneId pane, string caption, string glyph)
        {
            Pane = pane;
            _caption = caption;
            _glyph = glyph;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
            TabStop = true;
            Cursor = Cursors.Hand;
            AccessibleName = $"{caption} (minimised)";
            AccessibleDescription = $"Click to restore the {caption} pane";
            AccessibleRole = AccessibleRole.PushButton;
            _tooltip.SetToolTip(this, $"Restore {caption}");
        }

        public PaneId Pane { get; }

        /// <summary>The window edge the rail is attached to.</summary>
        public DockPosition Edge
        {
            get => _edge;
            set
            {
                if (_edge != value)
                {
                    _edge = value;
                    Invalidate();
                }
            }
        }

        /// <summary>Raised when the user asks to bring the pane back.</summary>
        public event EventHandler? RestoreRequested;

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            Invalidate();
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private bool IsVertical => PaneLayoutState.IsHorizontalEdge(_edge);

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(_palette.Window);

            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            var fill = _down ? _palette.Border : _hover || Focused ? _palette.SurfaceAlt : _palette.Surface;
            using (var back = new SolidBrush(fill))
            {
                g.FillRectangle(back, bounds);
            }

            using (var border = new Pen(_palette.Border))
            {
                g.DrawRectangle(border, bounds);
            }

            // Accent line on the side facing the content area.
            var accentThickness = Dp(2);
            var accent = _edge switch
            {
                DockPosition.Left => new Rectangle(Width - accentThickness - 1, 0, accentThickness, Height),
                DockPosition.Right => new Rectangle(1, 0, accentThickness, Height),
                DockPosition.Top => new Rectangle(0, Height - accentThickness - 1, Width, accentThickness),
                _ => new Rectangle(0, 1, Width, accentThickness),
            };
            using (var accentBrush = new SolidBrush(_hover ? _palette.Accent : Color.FromArgb(140, _palette.Accent)))
            {
                g.FillRectangle(accentBrush, accent);
            }

            var textColour = _hover ? _palette.Text : _palette.MutedText;
            const TextFormatFlags flags = TextFormatFlags.NoPadding | TextFormatFlags.NoClipping;
            if (IsVertical)
            {
                var iconRect = new Rectangle(0, Dp(4), Width, Dp(20));
                TextRenderer.DrawText(g, _glyph, _glyphFont, iconRect, _hover ? _palette.Accent : textColour,
                    flags | TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

                var textTop = Dp(30);
                var textLength = Math.Max(0, Height - textTop - Dp(6));
                var saved = g.Save();
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.TranslateTransform(Width / 2f, textTop);
                g.RotateTransform(90);
                using var brush = new SolidBrush(textColour);
                using var format = new StringFormat(StringFormatFlags.NoWrap)
                {
                    LineAlignment = StringAlignment.Center,
                    Alignment = StringAlignment.Near,
                    Trimming = StringTrimming.EllipsisCharacter,
                };
                var lineHeight = _captionFont.GetHeight(g) + 2;
                g.DrawString(_caption, _captionFont, brush, new RectangleF(0, -lineHeight / 2, textLength, lineHeight), format);
                g.Restore(saved);
            }
            else
            {
                var iconRect = new Rectangle(Dp(4), 0, Dp(20), Height);
                TextRenderer.DrawText(g, _glyph, _glyphFont, iconRect, _hover ? _palette.Accent : textColour,
                    flags | TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                var textRect = new Rectangle(Dp(28), 0, Math.Max(0, Width - Dp(32)), Height);
                TextRenderer.DrawText(g, _caption, _captionFont, textRect, textColour,
                    flags | TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }

            if (Focused && ShowFocusCues)
            {
                ControlPaint.DrawFocusRectangle(g, new Rectangle(2, 2, Width - 5, Height - 5), _palette.Text, fill);
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
            var wasDown = _down;
            _down = false;
            Invalidate();
            if (wasDown && e.Button == MouseButtons.Left && ClientRectangle.Contains(e.Location))
            {
                RestoreRequested?.Invoke(this, EventArgs.Empty);
            }
        }

        protected override bool IsInputKey(Keys keyData) => keyData is Keys.Enter or Keys.Space || base.IsInputKey(keyData);

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (e.KeyCode is Keys.Enter or Keys.Space)
            {
                RestoreRequested?.Invoke(this, EventArgs.Empty);
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

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _glyphFont.Dispose();
                _captionFont.Dispose();
                _tooltip.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
