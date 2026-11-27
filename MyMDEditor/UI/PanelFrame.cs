using MyMDEditor.Services;

namespace MyMDEditor.UI
{
    /// <summary>
    /// IDE-style window chrome for one pane: a slim title bar (icon, caption and small flat buttons for the dock menu,
    /// minimise, maximise/restore and close) above a content area. Double-clicking the title toggles maximise.
    /// </summary>
    public sealed class PanelFrame : Panel
    {
        private const string GlyphFontName = "Segoe MDL2 Assets";

        private readonly string _caption;
        private readonly string _glyph;
        private readonly Font _glyphFont = new(GlyphFontName, 9.5F);
        private readonly Font _captionFont = new("Segoe UI Semibold", 9F);
        private readonly ToolTip _tooltip = new() { InitialDelay = 450 };
        private readonly FrameButton _dockButton;
        private readonly FrameButton _minimiseButton;
        private readonly FrameButton _maximiseButton;
        private readonly FrameButton _closeButton;
        private ThemePalette _palette = ThemePalette.Dark;
        private bool _active;
        private bool _maximised;
        private bool _canMinimise = true;
        private bool _canClose = true;

        public PanelFrame(PaneId pane, string caption, string glyph)
        {
            Pane = pane;
            _caption = caption;
            _glyph = glyph;

            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            AccessibleName = $"{caption} pane";
            AccessibleRole = AccessibleRole.Pane;

            Content = new Panel { Name = caption + "Content" };
            _dockButton = new FrameButton("\uE70D", $"Dock {caption}");
            _minimiseButton = new FrameButton("\uE921", $"Minimise {caption}");
            _maximiseButton = new FrameButton("\uE922", $"Maximise {caption}");
            _closeButton = new FrameButton("\uE8BB", $"Hide {caption}");

            _dockButton.Click += (_, _) => ShowDockMenu(_dockButton);
            _minimiseButton.Click += (_, _) => MinimiseRequested?.Invoke(this, EventArgs.Empty);
            _maximiseButton.Click += (_, _) => MaximiseToggleRequested?.Invoke(this, EventArgs.Empty);
            _closeButton.Click += (_, _) => CloseRequested?.Invoke(this, EventArgs.Empty);

            Controls.Add(Content);
            Controls.AddRange(new Control[] { _dockButton, _minimiseButton, _maximiseButton, _closeButton });
            UpdateButtons();
        }

        public PaneId Pane { get; }

        /// <summary>Host for the pane's real content; it fills the area under the title bar.</summary>
        public Panel Content { get; }

        /// <summary>Menu shown by the dock button (and by right-clicking the title bar).</summary>
        public ContextMenuStrip? DockMenu { get; set; }

        public int TitleHeight => Dp(28);

        public bool IsActive
        {
            get => _active;
            set
            {
                if (_active != value)
                {
                    _active = value;
                    UpdateButtons();
                    Invalidate(TitleBounds);
                }
            }
        }

        public bool IsMaximised
        {
            get => _maximised;
            set
            {
                if (_maximised != value)
                {
                    _maximised = value;
                    UpdateButtons();
                }
            }
        }

        public bool CanMinimise
        {
            get => _canMinimise;
            set
            {
                if (_canMinimise != value)
                {
                    _canMinimise = value;
                    UpdateButtons();
                }
            }
        }

        public bool CanClose
        {
            get => _canClose;
            set
            {
                if (_canClose != value)
                {
                    _canClose = value;
                    UpdateButtons();
                }
            }
        }

        public event EventHandler? MinimiseRequested;

        public event EventHandler? MaximiseToggleRequested;

        public event EventHandler? CloseRequested;

        /// <summary>Raised when the user clicks the title bar, so the form can make this the active pane.</summary>
        public event EventHandler? Activated;

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            BackColor = palette.Surface;
            Content.BackColor = palette.Surface;
            UpdateButtons();
            Invalidate();
        }

        private Rectangle TitleBounds => new(0, 0, Width, TitleHeight);

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private Color TitleBack => _active ? _palette.Accent : _palette.SurfaceAlt;

        private Color TitleFore => _active ? _palette.AccentText : _palette.Text;

        private void UpdateButtons()
        {
            var back = TitleBack;
            var fore = TitleFore;
            foreach (var button in new[] { _dockButton, _minimiseButton, _maximiseButton, _closeButton })
            {
                button.SetColours(back, fore, _palette.Text);
            }

            _maximiseButton.SetGlyph(_maximised ? "\uE923" : "\uE922");
            var maximiseName = _maximised ? $"Restore {_caption}" : $"Maximise {_caption}";
            _maximiseButton.AccessibleName = maximiseName;
            _maximiseButton.Text = maximiseName;
            _tooltip.SetToolTip(_maximiseButton, _maximised ? "Restore (Ctrl+Shift+Enter)" : "Maximise (Ctrl+Shift+Enter)");
            _tooltip.SetToolTip(_dockButton, "Dock position and arrangement");
            _tooltip.SetToolTip(_minimiseButton, "Minimise to a rail (Ctrl+Shift+M)");
            _tooltip.SetToolTip(_closeButton, "Hide pane");
            _minimiseButton.Enabled = _canMinimise;
            _closeButton.Enabled = _canClose;
        }

        protected override void OnLayout(LayoutEventArgs levent)
        {
            base.OnLayout(levent);
            var title = TitleHeight;
            Content.SetBounds(0, title, Width, Math.Max(0, Height - title));

            var size = Dp(22);
            var top = (title - size) / 2;
            var gap = Dp(2);
            var x = Width - gap - Dp(2);
            foreach (var button in new[] { _closeButton, _maximiseButton, _minimiseButton, _dockButton })
            {
                x -= size;
                button.SetBounds(x, top, size, size);
                x -= gap;
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(_palette.Surface);
            var title = TitleBounds;
            using (var back = new SolidBrush(TitleBack))
            {
                g.FillRectangle(back, title);
            }

            using (var line = new Pen(_palette.Border))
            {
                g.DrawLine(line, 0, title.Bottom - 1, Width, title.Bottom - 1);
            }

            const TextFormatFlags flags = TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.NoClipping;
            var fore = TitleFore;
            TextRenderer.DrawText(g, _glyph, _glyphFont, new Rectangle(Dp(6), 0, Dp(20), title.Height), fore,
                flags | TextFormatFlags.HorizontalCenter);
            var captionLeft = Dp(30);
            var captionWidth = Math.Max(0, _dockButton.Left - captionLeft - Dp(4));
            TextRenderer.DrawText(g, _caption, _captionFont, new Rectangle(captionLeft, 0, captionWidth, title.Height), fore,
                flags | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Y >= TitleHeight)
            {
                return;
            }

            Activated?.Invoke(this, EventArgs.Empty);
            if (e.Button == MouseButtons.Right)
            {
                ShowDockMenu(this, e.Location);
            }
        }

        protected override void OnMouseDoubleClick(MouseEventArgs e)
        {
            base.OnMouseDoubleClick(e);
            if (e.Button == MouseButtons.Left && e.Y < TitleHeight)
            {
                MaximiseToggleRequested?.Invoke(this, EventArgs.Empty);
            }
        }

        private void ShowDockMenu(Control anchor, Point? at = null)
        {
            Activated?.Invoke(this, EventArgs.Empty);
            DockMenu?.Show(anchor, at ?? new Point(0, anchor.Height));
        }

        protected override void OnDpiChangedAfterParent(EventArgs e)
        {
            base.OnDpiChangedAfterParent(e);
            PerformLayout();
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

        /// <summary>A small flat title-bar button with hover and pressed states. It never takes focus from the editor.</summary>
        private sealed class FrameButton : Control
        {
            private readonly Font _font = new(GlyphFontName, 8F);
            private string _glyph;
            private Color _back = Color.Gray;
            private Color _fore = Color.White;
            private Color _blend = Color.White;
            private bool _hover;
            private bool _down;

            public FrameButton(string glyph, string accessibleName)
            {
                _glyph = glyph;
                SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                         ControlStyles.ResizeRedraw, true);
                SetStyle(ControlStyles.Selectable, false);
                TabStop = false;
                Text = accessibleName;
                AccessibleName = accessibleName;
                AccessibleRole = AccessibleRole.PushButton;
                Cursor = Cursors.Default;
            }

            public void SetColours(Color back, Color fore, Color blend)
            {
                _back = back;
                _fore = fore;
                _blend = blend;
                Invalidate();
            }

            public void SetGlyph(string glyph)
            {
                if (_glyph != glyph)
                {
                    _glyph = glyph;
                    Invalidate();
                }
            }

            protected override void OnEnabledChanged(EventArgs e)
            {
                base.OnEnabledChanged(e);
                _hover = false;
                _down = false;
                Invalidate();
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                var g = e.Graphics;
                var fill = !Enabled ? _back : _down ? Blend(_back, _blend, 0.32) : _hover ? Blend(_back, _blend, 0.16) : _back;
                g.Clear(fill);
                var colour = Enabled ? _fore : Color.FromArgb(100, _fore);
                TextRenderer.DrawText(g, _glyph, _font, ClientRectangle, colour,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.NoClipping);
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                base.OnMouseEnter(e);
                _hover = Enabled;
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
                if (e.Button == MouseButtons.Left && Enabled)
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
                if (Enabled)
                {
                    base.OnClick(e);
                }
            }

            private static Color Blend(Color from, Color to, double amount) => Color.FromArgb(
                from.R + (int)((to.R - from.R) * amount),
                from.G + (int)((to.G - from.G) * amount),
                from.B + (int)((to.B - from.B) * amount));

            protected override void Dispose(bool disposing)
            {
                if (disposing)
                {
                    _font.Dispose();
                }

                base.Dispose(disposing);
            }
        }
    }
}
