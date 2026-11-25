using System.Drawing.Drawing2D;

namespace MyMDEditor.UI
{
    /// <summary>
    /// Chrome-style document tab strip: owner-drawn tabs with a close button, an unsaved-changes dot,
    /// middle-click to close, drag to reorder and a "+" button for a new tab.
    /// </summary>
    public sealed class DocumentTabStrip : Control
    {
        private sealed class Item
        {
            public string Title = string.Empty;
            public string Tooltip = string.Empty;
            public bool Modified;
        }

        private readonly List<Item> _items = new();
        private readonly ToolTip _tooltip = new() { InitialDelay = 600 };
        private readonly Font _font = new("Segoe UI", 9F);
        private ThemePalette _palette = ThemePalette.Dark;
        private int _selected = -1;
        private int _hoverTab = -1;
        private bool _hoverClose;
        private bool _hoverNew;
        private int _dragIndex = -1;
        private Point _dragStart;
        private bool _dragging;
        private string _lastTooltip = string.Empty;

        public event EventHandler? SelectedIndexChanged;
        public event EventHandler<int>? CloseRequested;
        public event EventHandler? NewRequested;
        public event EventHandler<(int From, int To)>? TabMoved;
        public event EventHandler<(int Index, Point ScreenLocation)>? ContextRequested;

        public DocumentTabStrip()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            AccessibleName = "Open documents";
            AccessibleRole = AccessibleRole.PageTabList;
            Height = PreferredStripHeight;
        }

        public int PreferredStripHeight => Dp(38);

        public int Count => _items.Count;

        public int SelectedIndex
        {
            get => _selected;
            set
            {
                if (value == _selected || value < -1 || value >= _items.Count)
                {
                    return;
                }

                _selected = value;
                Invalidate();
                SelectedIndexChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            Invalidate();
        }

        public void AddTab(string title, string tooltip, bool modified)
        {
            _items.Add(new Item { Title = title, Tooltip = tooltip, Modified = modified });
            Invalidate();
        }

        public void RemoveTabAt(int index)
        {
            if (index < 0 || index >= _items.Count)
            {
                return;
            }

            _items.RemoveAt(index);
            if (_selected > index)
            {
                _selected--;
            }
            else if (_selected == index)
            {
                _selected = -1;
            }

            _hoverTab = -1;
            Invalidate();
        }

        public void UpdateTab(int index, string title, string tooltip, bool modified)
        {
            if (index < 0 || index >= _items.Count)
            {
                return;
            }

            var item = _items[index];
            if (item.Title == title && item.Tooltip == tooltip && item.Modified == modified)
            {
                return;
            }

            item.Title = title;
            item.Tooltip = tooltip;
            item.Modified = modified;
            Invalidate();
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private int TabWidth()
        {
            if (_items.Count == 0)
            {
                return Dp(200);
            }

            var available = Width - Dp(8) - Dp(40);
            return Math.Clamp(available / _items.Count, Dp(56), Dp(220));
        }

        private Rectangle TabRect(int index)
        {
            var width = TabWidth();
            return new Rectangle(Dp(8) + index * width, Dp(6), width - Dp(2), Height - Dp(6));
        }

        private Rectangle CloseRect(Rectangle tab)
        {
            var size = Dp(18);
            return new Rectangle(tab.Right - size - Dp(8), tab.Top + (tab.Height - size) / 2 + Dp(1), size, size);
        }

        private Rectangle NewRect()
        {
            var size = Dp(28);
            var x = Dp(8) + _items.Count * TabWidth() + Dp(4);
            return new Rectangle(Math.Min(x, Width - size - Dp(4)), Dp(6) + (Height - Dp(6) - size) / 2, size, size);
        }

        private int HitTab(Point p)
        {
            for (var i = 0; i < _items.Count; i++)
            {
                if (TabRect(i).Contains(p))
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

            using (var border = new Pen(_palette.Border))
            {
                g.DrawLine(border, 0, Height - 1, Width, Height - 1);
            }

            for (var i = 0; i < _items.Count; i++)
            {
                if (i != _selected)
                {
                    DrawTab(g, i);
                }
            }

            if (_selected >= 0 && _selected < _items.Count)
            {
                DrawTab(g, _selected);
            }

            var plus = NewRect();
            if (_hoverNew)
            {
                using var hoverBrush = new SolidBrush(_palette.SurfaceAlt);
                using var path = RoundedRect(plus, Dp(6));
                g.FillPath(hoverBrush, path);
            }

            using var plusPen = new Pen(_palette.Text, Math.Max(1.5f, Dp(1)));
            var cx = plus.Left + plus.Width / 2;
            var cy = plus.Top + plus.Height / 2;
            var arm = Dp(5);
            g.DrawLine(plusPen, cx - arm, cy, cx + arm, cy);
            g.DrawLine(plusPen, cx, cy - arm, cx, cy + arm);
        }

        private void DrawTab(Graphics g, int index)
        {
            var item = _items[index];
            var rect = TabRect(index);
            var selected = index == _selected;
            var hovered = index == _hoverTab;

            if (selected || hovered)
            {
                var fill = selected ? _palette.EditorBack : _palette.SurfaceAlt;
                using var brush = new SolidBrush(fill);
                using var path = TopRoundedRect(rect, Dp(8));
                g.FillPath(brush, path);

                if (selected)
                {
                    using var accent = new SolidBrush(_palette.Accent);
                    g.FillRectangle(accent, rect.Left + Dp(8), rect.Top, rect.Width - Dp(16), Dp(2));
                }
            }
            else if (index + 1 != _selected && index + 1 < _items.Count)
            {
                using var separator = new Pen(_palette.Border);
                g.DrawLine(separator, rect.Right + Dp(1), rect.Top + Dp(10), rect.Right + Dp(1), rect.Bottom - Dp(10));
            }

            var close = CloseRect(rect);
            var showClose = selected || hovered || rect.Width > Dp(120);
            var textRight = showClose || item.Modified ? close.Left - Dp(2) : rect.Right - Dp(10);
            var textRect = new Rectangle(rect.Left + Dp(12), rect.Top + Dp(2), Math.Max(0, textRight - rect.Left - Dp(12)), rect.Height - Dp(2));
            TextRenderer.DrawText(g, item.Title, _font, textRect, selected ? _palette.Text : _palette.MutedText,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);

            var closeHot = hovered && _hoverClose;
            if (closeHot)
            {
                using var hot = new SolidBrush(_palette.Border);
                g.FillEllipse(hot, close);
            }

            if (item.Modified && !closeHot)
            {
                var dot = Dp(8);
                using var dotBrush = new SolidBrush(_palette.Accent);
                g.FillEllipse(dotBrush, close.Left + (close.Width - dot) / 2, close.Top + (close.Height - dot) / 2, dot, dot);
            }
            else if (showClose)
            {
                using var pen = new Pen(selected || closeHot ? _palette.Text : _palette.MutedText, Math.Max(1.4f, Dp(1)));
                var arm = Dp(4);
                var cx = close.Left + close.Width / 2;
                var cy = close.Top + close.Height / 2;
                g.DrawLine(pen, cx - arm, cy - arm, cx + arm, cy + arm);
                g.DrawLine(pen, cx - arm, cy + arm, cx + arm, cy - arm);
            }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            var index = HitTab(e.Location);

            if (e.Button == MouseButtons.Middle && index >= 0)
            {
                CloseRequested?.Invoke(this, index);
                return;
            }

            if (e.Button == MouseButtons.Right && index >= 0)
            {
                SelectedIndex = index;
                ContextRequested?.Invoke(this, (index, PointToScreen(e.Location)));
                return;
            }

            if (e.Button != MouseButtons.Left)
            {
                return;
            }

            if (index >= 0)
            {
                if (CloseRect(TabRect(index)).Contains(e.Location))
                {
                    CloseRequested?.Invoke(this, index);
                    return;
                }

                SelectedIndex = index;
                _dragIndex = index;
                _dragStart = e.Location;
                _dragging = false;
            }
            else if (NewRect().Contains(e.Location))
            {
                NewRequested?.Invoke(this, EventArgs.Empty);
            }
        }

        protected override void OnMouseDoubleClick(MouseEventArgs e)
        {
            base.OnMouseDoubleClick(e);
            if (e.Button == MouseButtons.Left && HitTab(e.Location) < 0 && !NewRect().Contains(e.Location))
            {
                NewRequested?.Invoke(this, EventArgs.Empty);
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);

            if (_dragIndex >= 0 && e.Button == MouseButtons.Left)
            {
                if (!_dragging && Math.Abs(e.X - _dragStart.X) > Dp(6))
                {
                    _dragging = true;
                }

                if (_dragging)
                {
                    var target = Math.Clamp((e.X - Dp(8)) / TabWidth(), 0, _items.Count - 1);
                    if (target != _dragIndex)
                    {
                        var moved = _items[_dragIndex];
                        _items.RemoveAt(_dragIndex);
                        _items.Insert(target, moved);
                        var from = _dragIndex;
                        _dragIndex = target;
                        _selected = target;
                        TabMoved?.Invoke(this, (from, target));
                        Invalidate();
                    }
                }

                return;
            }

            var tab = HitTab(e.Location);
            var close = tab >= 0 && CloseRect(TabRect(tab)).Contains(e.Location);
            var plus = tab < 0 && NewRect().Contains(e.Location);
            if (tab != _hoverTab || close != _hoverClose || plus != _hoverNew)
            {
                _hoverTab = tab;
                _hoverClose = close;
                _hoverNew = plus;
                Invalidate();
            }

            var tip = tab >= 0 ? _items[tab].Tooltip : plus ? "New tab (Ctrl+T)" : string.Empty;
            if (tip != _lastTooltip)
            {
                _lastTooltip = tip;
                _tooltip.SetToolTip(this, tip);
            }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            _dragIndex = -1;
            _dragging = false;
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            _hoverTab = -1;
            _hoverClose = false;
            _hoverNew = false;
            Invalidate();
        }

        protected override void OnDpiChangedAfterParent(EventArgs e)
        {
            base.OnDpiChangedAfterParent(e);
            Height = PreferredStripHeight;
        }

        private static GraphicsPath TopRoundedRect(Rectangle r, int radius)
        {
            var d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(r.Left, r.Top, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Top, d, d, 270, 90);
            path.AddLine(r.Right, r.Bottom, r.Left, r.Bottom);
            path.CloseFigure();
            return path;
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
                _tooltip.Dispose();
                _font.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
