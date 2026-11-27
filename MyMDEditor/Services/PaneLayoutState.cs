namespace MyMDEditor.Services
{
    public enum PaneId
    {
        Outline = 0,
        Editor = 1,
        Preview = 2,
    }

    public enum DockPosition
    {
        Left,
        Right,
        Top,
        Bottom,
    }

    /// <summary>Mutable state of one pane. Only <see cref="PaneLayoutState"/> changes it, so its invariants hold.</summary>
    public sealed class PaneState
    {
        internal PaneState(PaneId id, DockPosition dock, double sizeRatio)
        {
            Id = id;
            Dock = dock;
            SizeRatio = sizeRatio;
        }

        public PaneId Id { get; }

        /// <summary>False when the pane has been hidden (closed); it neither shows content nor a rail.</summary>
        public bool Visible { get; internal set; } = true;

        /// <summary>True when the pane is collapsed to a rail strip.</summary>
        public bool Minimised { get; internal set; }

        public DockPosition Dock { get; internal set; }

        /// <summary>Share (0.1 - 0.9) of the area still unclaimed at the pane's turn that the pane occupies.</summary>
        public double SizeRatio { get; internal set; }

        internal PaneState Clone() => new(Id, Dock, SizeRatio) { Visible = Visible, Minimised = Minimised };
    }

    /// <summary>Persisted form of one pane. Plain strings keep hand-edited or newer files from breaking deserialisation.</summary>
    public sealed class PaneSnapshot
    {
        public string Pane { get; set; } = string.Empty;
        public bool Visible { get; set; } = true;
        public bool Minimised { get; set; }
        public string Dock { get; set; } = string.Empty;
        public double SizeRatio { get; set; } = 0.5;
    }

    /// <summary>Persisted form of <see cref="PaneLayoutState"/>.</summary>
    public sealed class PaneLayoutSnapshot
    {
        public int Version { get; set; } = 1;
        public List<PaneSnapshot> Panes { get; set; } = new();

        /// <summary>Panes from outermost to innermost.</summary>
        public List<string> Order { get; set; } = new();
        public string? Maximised { get; set; }
    }

    /// <summary>
    /// The arrangement of the Outline, Editor and Preview panes, free of any WinForms dependency.
    /// Panes are laid out outermost first: each pane except the innermost takes <see cref="PaneState.SizeRatio"/> of the
    /// area still free at its <see cref="PaneState.Dock"/> edge, and the innermost visible pane fills what is left.
    /// Invariants: at least one pane is visible and expanded, at most one pane is maximised, and a maximised pane is
    /// visible and expanded.
    /// </summary>
    public sealed class PaneLayoutState : IEquatable<PaneLayoutState>
    {
        public const double MinRatio = 0.1;
        public const double MaxRatio = 0.9;

        public static readonly IReadOnlyList<PaneId> AllPanes = new[] { PaneId.Outline, PaneId.Editor, PaneId.Preview };

        private readonly PaneState[] _panes = new PaneState[3];
        private readonly List<PaneId> _order = new();

        public PaneLayoutState()
        {
            Reset();
        }

        public PaneState this[PaneId id] => _panes[(int)id];

        /// <summary>Panes from outermost to innermost.</summary>
        public IReadOnlyList<PaneId> Order => _order;

        /// <summary>The pane currently filling the whole content area, if any.</summary>
        public PaneId? Maximised { get; private set; }

        // ---------------------------------------------------------------- Queries

        /// <summary>True when the pane is visible and not hidden away by another pane being maximised.</summary>
        public bool IsShown(PaneId id) => this[id].Visible && (Maximised is null || Maximised == id);

        /// <summary>True when the pane currently shows its content.</summary>
        public bool IsExpanded(PaneId id) => IsShown(id) && !this[id].Minimised;

        /// <summary>True when the pane currently shows as a rail strip.</summary>
        public bool IsRail(PaneId id) => Maximised is null && this[id].Visible && this[id].Minimised;

        public IReadOnlyList<PaneId> ExpandedPanes => _order.Where(IsExpanded).ToList();

        public IReadOnlyList<PaneId> RailPanes => _order.Where(IsRail).ToList();

        public IReadOnlyList<PaneId> VisiblePanes => _order.Where(p => this[p].Visible).ToList();

        /// <summary>Hiding is refused when it would leave no visible, expanded pane.</summary>
        public bool CanHide(PaneId id) => this[id].Visible && HasOtherExpanded(id);

        public bool CanMinimise(PaneId id) => this[id].Visible && !this[id].Minimised && HasOtherExpanded(id);

        /// <summary>
        /// The edge a pane really sits at. The innermost visible pane fills the remaining area, so its edge is the
        /// opposite of the pane just outside it.
        /// </summary>
        public DockPosition GetEffectiveDock(PaneId id)
        {
            var visible = VisiblePanes;
            if (visible.Count > 1 && visible[^1] == id)
            {
                return Opposite(this[visible[^2]].Dock);
            }

            return this[id].Dock;
        }

        /// <summary>The visible pane next to <paramref name="id"/> in layout order (the next one, else the previous one).</summary>
        public PaneId? GetNeighbour(PaneId id)
        {
            var visible = VisiblePanes;
            var index = visible.ToList().IndexOf(id);
            if (index < 0 || visible.Count < 2)
            {
                return null;
            }

            return index + 1 < visible.Count ? visible[index + 1] : visible[index - 1];
        }

        /// <summary>True when Editor and Preview sit next to each other rather than one above the other.</summary>
        public bool EditorPreviewSideBySide
        {
            get
            {
                var first = _order.First(p => p is PaneId.Editor or PaneId.Preview);
                return IsHorizontalEdge(this[first].Dock);
            }
        }

        /// <summary>"split", "editor" or "preview", as stored by older versions of the settings file.</summary>
        public string LegacyViewMode
        {
            get
            {
                var editor = this[PaneId.Editor].Visible;
                var preview = this[PaneId.Preview].Visible;
                return editor && !preview ? "editor" : preview && !editor ? "preview" : "split";
            }
        }

        // ---------------------------------------------------------------- Operations (each returns true when something changed)

        public bool Minimise(PaneId id)
        {
            if (!CanMinimise(id))
            {
                return false;
            }

            if (Maximised == id)
            {
                Maximised = null;
            }

            this[id].Minimised = true;
            return true;
        }

        /// <summary>Brings a minimised pane back, or un-maximises a maximised one.</summary>
        public bool Restore(PaneId id)
        {
            if (this[id].Visible && this[id].Minimised)
            {
                this[id].Minimised = false;
                return true;
            }

            if (Maximised == id)
            {
                Maximised = null;
                return true;
            }

            return false;
        }

        public bool ToggleMinimise(PaneId id) => this[id].Minimised && this[id].Visible ? Restore(id) : Minimise(id);

        public bool ToggleMaximise(PaneId id)
        {
            if (Maximised == id)
            {
                Maximised = null;
                return true;
            }

            if (!this[id].Visible)
            {
                return false;
            }

            this[id].Minimised = false;
            Maximised = id;
            return true;
        }

        /// <summary>Hides a pane. Hiding the maximised pane first restores the layout.</summary>
        public bool Hide(PaneId id)
        {
            if (!CanHide(id))
            {
                return false;
            }

            if (Maximised == id)
            {
                Maximised = null;
            }

            this[id].Visible = false;
            this[id].Minimised = false;
            return true;
        }

        /// <summary>Makes a pane visible and expanded, and reveals it if another pane is maximised.</summary>
        public bool Show(PaneId id)
        {
            var changed = false;
            var pane = this[id];
            if (!pane.Visible)
            {
                pane.Visible = true;
                changed = true;
            }

            if (pane.Minimised)
            {
                pane.Minimised = false;
                changed = true;
            }

            if (Maximised is { } maximised && maximised != id)
            {
                Maximised = null;
                changed = true;
            }

            return changed;
        }

        /// <summary>Show/hide toggle used by the pane switcher and shortcuts.</summary>
        public bool ToggleVisible(PaneId id)
        {
            if (!this[id].Visible)
            {
                return Show(id);
            }

            if (Maximised is { } maximised && maximised != id)
            {
                Maximised = null;
                return true;
            }

            return Hide(id);
        }

        /// <summary>Docks a pane to an edge of the whole content area; it becomes the outermost pane.</summary>
        public bool SetDock(PaneId id, DockPosition dock)
        {
            if (!Enum.IsDefined(dock))
            {
                return false;
            }

            var pane = this[id];
            var alreadyOutermost = _order[0] == id;
            if (alreadyOutermost && pane.Dock == dock)
            {
                return false;
            }

            _order.Remove(id);
            _order.Insert(0, id);
            pane.Dock = dock;
            if (!alreadyOutermost)
            {
                pane.SizeRatio = DefaultRatio(id, outermost: true);
            }

            return true;
        }

        /// <summary>Exchanges the layout positions of two panes; each keeps its own size.</summary>
        public bool Swap(PaneId a, PaneId b)
        {
            if (a == b)
            {
                return false;
            }

            var dockA = GetEffectiveDock(a);
            var dockB = GetEffectiveDock(b);
            var indexA = _order.IndexOf(a);
            var indexB = _order.IndexOf(b);
            _order[indexA] = b;
            _order[indexB] = a;
            this[a].Dock = dockB;
            this[b].Dock = dockA;
            return true;
        }

        public bool SwapWithNeighbour(PaneId id) => GetNeighbour(id) is { } neighbour && Swap(id, neighbour);

        /// <summary>Turns the Editor/Preview pair between side by side and stacked.</summary>
        public bool RotateEditorPreview()
        {
            this[PaneId.Editor].Dock = RotateEdge(this[PaneId.Editor].Dock);
            this[PaneId.Preview].Dock = RotateEdge(this[PaneId.Preview].Dock);
            return true;
        }

        /// <summary>Makes the Editor/Preview pair side by side (true) or stacked (false).</summary>
        public bool SetEditorPreviewSideBySide(bool sideBySide) =>
            EditorPreviewSideBySide != sideBySide && RotateEditorPreview();

        /// <summary>Sets Editor/Preview visibility from a legacy "split", "editor" or "preview" mode.</summary>
        public bool ApplyViewMode(string mode)
        {
            var showEditor = mode != "preview";
            var showPreview = mode != "editor";
            var changed = Maximised is not null;
            Maximised = null;
            changed |= SetVisibleExpanded(PaneId.Editor, showEditor);
            changed |= SetVisibleExpanded(PaneId.Preview, showPreview);
            return changed;
        }

        public bool SetSizeRatio(PaneId id, double ratio)
        {
            var clamped = ClampRatio(ratio, this[id].SizeRatio);
            if (Math.Abs(clamped - this[id].SizeRatio) < 1e-9)
            {
                return false;
            }

            this[id].SizeRatio = clamped;
            return true;
        }

        /// <summary>Restores the default layout: everything visible, Outline | Editor | Preview, nothing maximised.</summary>
        public void Reset()
        {
            _panes[(int)PaneId.Outline] = new PaneState(PaneId.Outline, DockPosition.Left, DefaultRatio(PaneId.Outline, outermost: true));
            _panes[(int)PaneId.Editor] = new PaneState(PaneId.Editor, DockPosition.Left, DefaultRatio(PaneId.Editor, outermost: false));
            _panes[(int)PaneId.Preview] = new PaneState(PaneId.Preview, DockPosition.Right, DefaultRatio(PaneId.Preview, outermost: false));
            _order.Clear();
            _order.AddRange(AllPanes);
            Maximised = null;
        }

        // ---------------------------------------------------------------- Persistence

        public PaneLayoutSnapshot ToSnapshot() => new()
        {
            Version = 1,
            Panes = AllPanes.Select(id => new PaneSnapshot
            {
                Pane = id.ToString(),
                Visible = this[id].Visible,
                Minimised = this[id].Minimised,
                Dock = this[id].Dock.ToString(),
                SizeRatio = this[id].SizeRatio,
            }).ToList(),
            Order = _order.Select(id => id.ToString()).ToList(),
            Maximised = Maximised?.ToString(),
        };

        /// <summary>Rebuilds a state from persisted data; anything missing or invalid falls back to the default.</summary>
        public static PaneLayoutState FromSnapshot(PaneLayoutSnapshot? snapshot)
        {
            var state = new PaneLayoutState();
            if (snapshot is null)
            {
                return state;
            }

            var seen = new HashSet<PaneId>();
            foreach (var entry in snapshot.Panes ?? new List<PaneSnapshot>())
            {
                if (entry is null || !TryParseName(entry.Pane, out PaneId id) || !seen.Add(id))
                {
                    continue;
                }

                var pane = state[id];
                pane.Visible = entry.Visible;
                pane.Minimised = entry.Minimised;
                if (TryParseName(entry.Dock, out DockPosition dock))
                {
                    pane.Dock = dock;
                }

                pane.SizeRatio = ClampRatio(entry.SizeRatio, pane.SizeRatio);
            }

            var order = new List<PaneId>();
            foreach (var name in snapshot.Order ?? new List<string>())
            {
                if (TryParseName(name, out PaneId id) && !order.Contains(id))
                {
                    order.Add(id);
                }
            }

            foreach (var id in AllPanes.Where(id => !order.Contains(id)))
            {
                order.Add(id);
            }

            state._order.Clear();
            state._order.AddRange(order);

            if (TryParseName(snapshot.Maximised, out PaneId maximised))
            {
                state.Maximised = maximised;
            }

            state.EnsureInvariants();
            return state;
        }

        /// <summary>
        /// Derives a layout from the settings of versions that predated pane docking (outline flag, view mode and
        /// split orientation).
        /// </summary>
        public static PaneLayoutState FromLegacy(bool showOutline, string? viewMode, bool sideBySide)
        {
            var state = new PaneLayoutState();
            state[PaneId.Outline].Visible = showOutline;
            state.ApplyViewMode(viewMode ?? "split");
            state.SetEditorPreviewSideBySide(sideBySide);
            state.EnsureInvariants();
            return state;
        }

        public PaneLayoutState Clone()
        {
            var copy = new PaneLayoutState();
            for (var i = 0; i < _panes.Length; i++)
            {
                copy._panes[i] = _panes[i].Clone();
            }

            copy._order.Clear();
            copy._order.AddRange(_order);
            copy.Maximised = Maximised;
            return copy;
        }

        public bool Equals(PaneLayoutState? other)
        {
            if (other is null)
            {
                return false;
            }

            if (Maximised != other.Maximised || !_order.SequenceEqual(other._order))
            {
                return false;
            }

            return AllPanes.All(id =>
                this[id].Visible == other[id].Visible &&
                this[id].Minimised == other[id].Minimised &&
                this[id].Dock == other[id].Dock &&
                Math.Abs(this[id].SizeRatio - other[id].SizeRatio) < 1e-9);
        }

        public override bool Equals(object? obj) => Equals(obj as PaneLayoutState);

        public override int GetHashCode() => HashCode.Combine(Maximised, string.Join(',', _order));

        // ---------------------------------------------------------------- Helpers

        public static DockPosition Opposite(DockPosition dock) => dock switch
        {
            DockPosition.Left => DockPosition.Right,
            DockPosition.Right => DockPosition.Left,
            DockPosition.Top => DockPosition.Bottom,
            _ => DockPosition.Top,
        };

        /// <summary>True for Left and Right edges (panes are placed side by side along the horizontal axis).</summary>
        public static bool IsHorizontalEdge(DockPosition dock) => dock is DockPosition.Left or DockPosition.Right;

        private static DockPosition RotateEdge(DockPosition dock) => dock switch
        {
            DockPosition.Left => DockPosition.Top,
            DockPosition.Right => DockPosition.Bottom,
            DockPosition.Top => DockPosition.Left,
            _ => DockPosition.Right,
        };

        private static double DefaultRatio(PaneId id, bool outermost) =>
            id == PaneId.Outline ? 0.2 : outermost ? 0.4 : 0.5;

        private static double ClampRatio(double value, double fallback) =>
            double.IsNaN(value) || double.IsInfinity(value) ? fallback : Math.Clamp(value, MinRatio, MaxRatio);

        private bool HasOtherExpanded(PaneId id) =>
            AllPanes.Any(p => p != id && this[p].Visible && !this[p].Minimised);

        private bool SetVisibleExpanded(PaneId id, bool visible)
        {
            var pane = this[id];
            var changed = pane.Visible != visible || (visible && pane.Minimised);
            pane.Visible = visible;
            pane.Minimised = false;
            return changed;
        }

        private void EnsureInvariants()
        {
            foreach (var id in AllPanes)
            {
                var pane = this[id];
                pane.SizeRatio = ClampRatio(pane.SizeRatio, DefaultRatio(id, outermost: false));
                if (!pane.Visible)
                {
                    pane.Minimised = false;
                }
            }

            if (Maximised is { } maximised)
            {
                if (this[maximised].Visible)
                {
                    this[maximised].Minimised = false;
                }
                else
                {
                    Maximised = null;
                }
            }

            if (!AllPanes.Any(id => this[id].Visible && !this[id].Minimised))
            {
                this[PaneId.Editor].Visible = true;
                this[PaneId.Editor].Minimised = false;
            }
        }

        private static bool TryParseName<T>(string? value, out T result) where T : struct, Enum
        {
            foreach (var name in Enum.GetNames<T>())
            {
                if (string.Equals(name, value?.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    result = Enum.Parse<T>(name);
                    return true;
                }
            }

            result = default;
            return false;
        }
    }
}
