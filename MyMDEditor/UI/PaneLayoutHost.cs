using MyMDEditor.Services;

namespace MyMDEditor.UI
{
    /// <summary>
    /// Arranges the three <see cref="PanelFrame"/>s, their rails and the draggable dividers according to a
    /// <see cref="PaneLayoutState"/>. Frames are always direct children of the host and are only moved, shown or hidden,
    /// so hosted controls such as the WebView2 preview are never re-parented.
    /// </summary>
    public sealed class PaneLayoutHost : Control
    {
        private readonly Dictionary<PaneId, PanelFrame> _frames = new();
        private readonly Dictionary<PaneId, PaneRail> _rails = new();
        private readonly List<SplitterBar> _splitters = new();
        private ThemePalette _palette = ThemePalette.Dark;

        public PaneLayoutHost()
        {
            SetStyle(ControlStyles.ResizeRedraw | ControlStyles.OptimizedDoubleBuffer, true);
            AccessibleName = "Panes";
            AccessibleRole = AccessibleRole.Grouping;
            for (var i = 0; i < 2; i++)
            {
                var bar = new SplitterBar(this) { Visible = false };
                _splitters.Add(bar);
                Controls.Add(bar);
            }
        }

        public PaneLayoutState State { get; set; } = new();

        /// <summary>Raised after a divider has been dragged and the new ratio stored in <see cref="State"/>.</summary>
        public event EventHandler? SplittersChanged;

        public PanelFrame GetFrame(PaneId pane) => _frames[pane];

        public PaneRail GetRail(PaneId pane) => _rails[pane];

        public PaneLayoutMetrics Metrics => PaneLayoutMetrics.ForDpi(DeviceDpi);

        public void AddPane(PanelFrame frame, PaneRail rail)
        {
            _frames[frame.Pane] = frame;
            _rails[frame.Pane] = rail;
            frame.Visible = false;
            rail.Visible = false;
            Controls.Add(frame);
            Controls.Add(rail);
        }

        public void ApplyTheme(ThemePalette palette)
        {
            _palette = palette;
            BackColor = palette.Window;
            foreach (var frame in _frames.Values)
            {
                frame.ApplyTheme(palette);
            }

            foreach (var rail in _rails.Values)
            {
                rail.ApplyTheme(palette);
            }

            foreach (var bar in _splitters)
            {
                bar.Invalidate();
            }
        }

        /// <summary>Positions every frame, rail and divider for the current <see cref="State"/> and size.</summary>
        public void ApplyLayout()
        {
            if (_frames.Count == 0)
            {
                return;
            }

            var plan = PaneLayoutEngine.Compute(State, ClientSize, Metrics);
            SuspendLayout();
            try
            {
                foreach (var (pane, frame) in _frames)
                {
                    if (plan.Panes.TryGetValue(pane, out var bounds))
                    {
                        frame.Bounds = bounds;
                        frame.Visible = true;
                    }
                    else
                    {
                        frame.Visible = false;
                    }
                }

                foreach (var (pane, rail) in _rails)
                {
                    var placement = plan.Rails.FirstOrDefault(r => r.Pane == pane);
                    if (placement is null)
                    {
                        rail.Visible = false;
                        continue;
                    }

                    rail.Edge = placement.Edge;
                    rail.Bounds = placement.Bounds;
                    rail.Visible = true;
                }

                for (var i = 0; i < _splitters.Count; i++)
                {
                    var bar = _splitters[i];
                    if (i < plan.Splitters.Count && plan.Splitters[i].Bounds is { Width: > 0, Height: > 0 } bounds)
                    {
                        bar.Placement = plan.Splitters[i];
                        bar.Bounds = bounds;
                        bar.Visible = true;
                    }
                    else
                    {
                        bar.Placement = null;
                        bar.Visible = false;
                    }
                }
            }
            finally
            {
                ResumeLayout(performLayout: false);
            }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            ApplyLayout();
        }

        protected override void OnDpiChangedAfterParent(EventArgs e)
        {
            base.OnDpiChangedAfterParent(e);
            ApplyLayout();
        }

        private void DragSplitter(SplitterBar bar, int leadingEdge)
        {
            if (bar.Placement is not { } placement)
            {
                return;
            }

            var ratio = PaneLayoutEngine.RatioFromSplitterEdge(placement, leadingEdge, Metrics);
            if (State.SetSizeRatio(placement.Pane, ratio))
            {
                ApplyLayout();
            }
        }

        private void EndDrag() => SplittersChanged?.Invoke(this, EventArgs.Empty);

        private sealed class SplitterBar : Control
        {
            private readonly PaneLayoutHost _host;
            private bool _hover;
            private bool _dragging;
            private int _grabOffset;

            public SplitterBar(PaneLayoutHost host)
            {
                _host = host;
                SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                         ControlStyles.ResizeRedraw, true);
                SetStyle(ControlStyles.Selectable, false);
                TabStop = false;
                AccessibleName = "Pane divider";
                AccessibleRole = AccessibleRole.Grip;
            }

            public SplitterPlacement? Placement { get; set; }

            private bool Horizontal => Placement is { } p && PaneLayoutState.IsHorizontalEdge(p.Edge);

            protected override void OnPaint(PaintEventArgs e)
            {
                var palette = _host._palette;
                e.Graphics.Clear(_hover || _dragging ? palette.Accent : palette.Window);
                if (!_hover && !_dragging)
                {
                    using var pen = new Pen(palette.Border);
                    if (Horizontal)
                    {
                        e.Graphics.DrawLine(pen, Width / 2, 0, Width / 2, Height);
                    }
                    else
                    {
                        e.Graphics.DrawLine(pen, 0, Height / 2, Width, Height / 2);
                    }
                }
            }

            protected override void OnMouseEnter(EventArgs e)
            {
                base.OnMouseEnter(e);
                _hover = true;
                Cursor = Horizontal ? Cursors.SizeWE : Cursors.SizeNS;
                Invalidate();
            }

            protected override void OnMouseLeave(EventArgs e)
            {
                base.OnMouseLeave(e);
                _hover = false;
                Invalidate();
            }

            protected override void OnMouseDown(MouseEventArgs e)
            {
                base.OnMouseDown(e);
                if (e.Button == MouseButtons.Left)
                {
                    _dragging = true;
                    _grabOffset = Horizontal ? e.X : e.Y;
                    Capture = true;
                    Invalidate();
                }
            }

            protected override void OnMouseMove(MouseEventArgs e)
            {
                base.OnMouseMove(e);
                if (!_dragging)
                {
                    return;
                }

                var point = _host.PointToClient(Cursor.Position);
                _host.DragSplitter(this, (Horizontal ? point.X : point.Y) - _grabOffset);
            }

            protected override void OnMouseUp(MouseEventArgs e)
            {
                base.OnMouseUp(e);
                if (_dragging)
                {
                    _dragging = false;
                    Capture = false;
                    Invalidate();
                    _host.EndDrag();
                }
            }
        }
    }
}
