using MyMDEditor.Services;

namespace MyMDEditor.UI
{
    /// <summary>Pixel sizes the layout engine works with (already scaled for DPI).</summary>
    public readonly record struct PaneLayoutMetrics(int RailThickness, int RailLength, int SplitterThickness, int MinPaneSize)
    {
        public static PaneLayoutMetrics ForDpi(int dpi)
        {
            int Dp(int value) => (int)Math.Round(value * dpi / 96.0);
            return new PaneLayoutMetrics(Dp(28), Dp(124), Dp(5), Dp(120));
        }
    }

    /// <summary>A minimised pane's rail tab and the edge strip it sits in.</summary>
    public sealed record RailPlacement(PaneId Pane, DockPosition Edge, Rectangle Bounds);

    /// <summary>
    /// A draggable divider. <see cref="Pane"/> is the pane whose size it controls and <see cref="Area"/> the
    /// rectangle that pane was cut from.
    /// </summary>
    public sealed record SplitterPlacement(PaneId Pane, DockPosition Edge, Rectangle Bounds, Rectangle Area);

    public sealed class PaneLayoutPlan
    {
        public Dictionary<PaneId, Rectangle> Panes { get; } = new();
        public List<RailPlacement> Rails { get; } = new();
        public List<SplitterPlacement> Splitters { get; } = new();
        public Rectangle Content { get; set; }
    }

    /// <summary>Turns a <see cref="PaneLayoutState"/> and an area size into rectangles. Pure, so it is unit tested.</summary>
    public static class PaneLayoutEngine
    {
        public static PaneLayoutPlan Compute(PaneLayoutState state, Size area, PaneLayoutMetrics metrics)
        {
            var plan = new PaneLayoutPlan();
            var width = Math.Max(0, area.Width);
            var height = Math.Max(0, area.Height);

            var rails = state.RailPanes.Select(p => (Pane: p, Edge: state.GetEffectiveDock(p))).ToList();
            var thickness = metrics.RailThickness;
            var left = rails.Any(r => r.Edge == DockPosition.Left) ? thickness : 0;
            var right = rails.Any(r => r.Edge == DockPosition.Right) ? thickness : 0;
            var top = rails.Any(r => r.Edge == DockPosition.Top) ? thickness : 0;
            var bottom = rails.Any(r => r.Edge == DockPosition.Bottom) ? thickness : 0;

            var horizontalLength = Math.Max(0, width - left - right);
            foreach (var group in rails.GroupBy(r => r.Edge))
            {
                var edge = group.Key;
                var count = group.Count();
                var stripLength = PaneLayoutState.IsHorizontalEdge(edge) ? height : horizontalLength;
                var length = Math.Max(0, Math.Min(metrics.RailLength, stripLength / count));
                var offset = 0;
                foreach (var rail in group)
                {
                    var bounds = edge switch
                    {
                        DockPosition.Left => new Rectangle(0, offset, thickness, length),
                        DockPosition.Right => new Rectangle(width - thickness, offset, thickness, length),
                        DockPosition.Top => new Rectangle(left + offset, 0, length, thickness),
                        _ => new Rectangle(left + offset, height - thickness, length, thickness),
                    };
                    plan.Rails.Add(new RailPlacement(rail.Pane, edge, bounds));
                    offset += length;
                }
            }

            var content = new Rectangle(left, top, Math.Max(0, width - left - right), Math.Max(0, height - top - bottom));
            plan.Content = content;

            var expanded = state.ExpandedPanes;
            var remaining = content;
            for (var i = 0; i < expanded.Count; i++)
            {
                var pane = expanded[i];
                if (i == expanded.Count - 1)
                {
                    plan.Panes[pane] = remaining;
                    break;
                }

                var dock = state[pane].Dock;
                var horizontal = PaneLayoutState.IsHorizontalEdge(dock);
                var extent = horizontal ? remaining.Width : remaining.Height;
                var size = ClampSize((int)Math.Round(state[pane].SizeRatio * extent), extent, expanded.Count - 1 - i, metrics);
                var gap = Math.Min(metrics.SplitterThickness, Math.Max(0, extent - size));

                Rectangle paneRect, splitter, rest;
                switch (dock)
                {
                    case DockPosition.Left:
                        paneRect = new Rectangle(remaining.Left, remaining.Top, size, remaining.Height);
                        splitter = new Rectangle(remaining.Left + size, remaining.Top, gap, remaining.Height);
                        rest = new Rectangle(remaining.Left + size + gap, remaining.Top, remaining.Width - size - gap, remaining.Height);
                        break;
                    case DockPosition.Right:
                        paneRect = new Rectangle(remaining.Right - size, remaining.Top, size, remaining.Height);
                        splitter = new Rectangle(remaining.Right - size - gap, remaining.Top, gap, remaining.Height);
                        rest = new Rectangle(remaining.Left, remaining.Top, remaining.Width - size - gap, remaining.Height);
                        break;
                    case DockPosition.Top:
                        paneRect = new Rectangle(remaining.Left, remaining.Top, remaining.Width, size);
                        splitter = new Rectangle(remaining.Left, remaining.Top + size, remaining.Width, gap);
                        rest = new Rectangle(remaining.Left, remaining.Top + size + gap, remaining.Width, remaining.Height - size - gap);
                        break;
                    default:
                        paneRect = new Rectangle(remaining.Left, remaining.Bottom - size, remaining.Width, size);
                        splitter = new Rectangle(remaining.Left, remaining.Bottom - size - gap, remaining.Width, gap);
                        rest = new Rectangle(remaining.Left, remaining.Top, remaining.Width, remaining.Height - size - gap);
                        break;
                }

                plan.Panes[pane] = paneRect;
                plan.Splitters.Add(new SplitterPlacement(pane, dock, splitter, remaining));
                remaining = rest;
            }

            return plan;
        }

        /// <summary>
        /// The size ratio a pane gets when its splitter's leading edge (left or top edge of the divider) is dragged to
        /// <paramref name="leadingEdge"/>, a coordinate along the splitter's axis in the same space as the plan.
        /// </summary>
        public static double RatioFromSplitterEdge(SplitterPlacement splitter, int leadingEdge, PaneLayoutMetrics metrics)
        {
            var horizontal = PaneLayoutState.IsHorizontalEdge(splitter.Edge);
            var extent = horizontal ? splitter.Area.Width : splitter.Area.Height;
            if (extent <= 0)
            {
                return PaneLayoutState.MinRatio;
            }

            var size = splitter.Edge switch
            {
                DockPosition.Left => leadingEdge - splitter.Area.Left,
                DockPosition.Right => splitter.Area.Right - metrics.SplitterThickness - leadingEdge,
                DockPosition.Top => leadingEdge - splitter.Area.Top,
                _ => splitter.Area.Bottom - metrics.SplitterThickness - leadingEdge,
            };
            return Math.Clamp(size / (double)extent, PaneLayoutState.MinRatio, PaneLayoutState.MaxRatio);
        }

        private static int ClampSize(int size, int extent, int panesAfter, PaneLayoutMetrics metrics)
        {
            var min = metrics.MinPaneSize;
            var max = extent - (metrics.SplitterThickness + min) * panesAfter;
            if (max < min)
            {
                return Math.Max(0, Math.Min(size, Math.Max(0, max)));
            }

            return Math.Clamp(size, min, max);
        }
    }
}
