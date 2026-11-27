using MyMDEditor.Services;
using MyMDEditor.UI;

namespace MyMDEditor
{
    /// <summary>Pane chrome, docking and arrangement: the form's single entry point is <see cref="ApplyPaneLayout"/>.</summary>
    public sealed partial class MarkdownEditorForm
    {
        private static readonly DockPosition[] DockChoices = { DockPosition.Left, DockPosition.Right, DockPosition.Top, DockPosition.Bottom };

        private PaneLayoutState _layout = new();
        private PaneId _activePane = PaneId.Editor;
        private bool _previewWasShown;
        private readonly List<ContextMenuStrip> _layoutMenus = new();
        private ContextMenuStrip? _ribbonDockMenu;
        private ContextMenuStrip? _minimiseMenu;
        private ContextMenuStrip? _maximiseMenu;

        private static string PaneCaption(PaneId pane) => pane switch
        {
            PaneId.Outline => "Outline",
            PaneId.Editor => "Editor",
            _ => "Preview",
        };

        private PanelFrame FrameOf(PaneId pane) => _layoutHost.GetFrame(pane);

        // ---------------------------------------------------------------- Construction

        private void BuildPaneLayout()
        {
            _preview.Dock = DockStyle.Fill;

            // Docked controls are laid out from the last-added to the first-added, so the fill
            // control must be added first and the edge-docked controls after it.
            var editorPanel = new Panel { Dock = DockStyle.Fill };
            editorPanel.Controls.Add(_editorHost);
            editorPanel.Controls.Add(_findBar);

            _outlineFrame.Content.Controls.Add(_outlineTree);
            _editorFrame.Content.Controls.Add(editorPanel);
            _previewFrame.Content.Controls.Add(_preview);

            foreach (var frame in new[] { _outlineFrame, _editorFrame, _previewFrame })
            {
                var pane = frame.Pane;
                var rail = new PaneRail(pane, PaneCaption(pane), PaneGlyph(pane));
                _layoutHost.AddPane(frame, rail);

                frame.DockMenu = BuildDockMenu(pane);
                frame.MinimiseRequested += (_, _) => ExecuteLayout(l => l.Minimise(pane));
                frame.MaximiseToggleRequested += (_, _) => ExecuteLayout(l => l.ToggleMaximise(pane), pane);
                frame.CloseRequested += (_, _) => ExecuteLayout(l => l.Hide(pane));
                frame.Enter += (_, _) => SetActivePane(pane);
                frame.Activated += (_, _) =>
                {
                    SetActivePane(pane);
                    FocusPane(pane);
                };
                rail.RestoreRequested += (_, _) => ExecuteLayout(l => l.Restore(pane), pane);
            }

            _layoutHost.State = _layout;
            _layoutHost.SplittersChanged += (_, _) => _settings.SetPaneLayout(_layout);

            Controls.Add(_layoutHost);
            Controls.Add(_tabStrip);
            Controls.Add(_ribbon);
            Controls.Add(_statusStrip);

            ApplyPaneLayout();
            Shown += (_, _) => ApplyPaneLayout();
        }

        private static string PaneGlyph(PaneId pane) => pane switch
        {
            PaneId.Outline => "\uE700",
            PaneId.Editor => "\uE70F",
            _ => "\uE7B3",
        };

        private ContextMenuStrip BuildDockMenu(PaneId pane)
        {
            var menu = new ContextMenuStrip { AccessibleName = $"Dock {PaneCaption(pane)}" };
            foreach (var dock in DockChoices)
            {
                var target = dock;
                var item = new ToolStripMenuItem($"Dock {dock}") { Tag = dock };
                item.Click += (_, _) => ExecuteLayout(l => l.SetDock(pane, target), pane);
                menu.Items.Add(item);
            }

            menu.Items.Add(new ToolStripSeparator());
            var swap = new ToolStripMenuItem("Swap with Neighbour") { Name = "swap" };
            swap.Click += (_, _) => ExecuteLayout(l => l.SwapWithNeighbour(pane), pane);
            menu.Items.Add(swap);
            var reset = new ToolStripMenuItem("Reset Layout (Ctrl+Alt+0)");
            reset.Click += (_, _) => ResetLayout();
            menu.Items.Add(reset);

            menu.Opening += (_, _) =>
            {
                var effective = _layout.GetEffectiveDock(pane);
                foreach (ToolStripItem item in menu.Items)
                {
                    if (item is ToolStripMenuItem { Tag: DockPosition dock } dockItem)
                    {
                        dockItem.Checked = dock == effective;
                    }
                }

                swap.Enabled = _layout.GetNeighbour(pane) is not null;
            };
            _layoutMenus.Add(menu);
            return menu;
        }

        /// <summary>Builds the View > Panes ribbon menus (dock, minimise, maximise).</summary>
        private void BuildRibbonPaneMenus()
        {
            _ribbonDockMenu = new ContextMenuStrip { AccessibleName = "Dock panes" };
            foreach (var pane in PaneLayoutState.AllPanes)
            {
                var target = pane;
                var parent = new ToolStripMenuItem(PaneCaption(pane)) { Tag = pane };
                foreach (var dock in DockChoices)
                {
                    var edge = dock;
                    var item = new ToolStripMenuItem($"Dock {dock}") { Tag = dock };
                    item.Click += (_, _) => ExecuteLayout(l => l.SetDock(target, edge), target);
                    parent.DropDownItems.Add(item);
                }

                parent.DropDownItems.Add(new ToolStripSeparator());
                var swap = new ToolStripMenuItem("Swap with Neighbour") { Name = "swap" };
                swap.Click += (_, _) => ExecuteLayout(l => l.SwapWithNeighbour(target), target);
                parent.DropDownItems.Add(swap);
                _ribbonDockMenu.Items.Add(parent);
            }

            _ribbonDockMenu.Opening += (_, _) =>
            {
                foreach (ToolStripMenuItem parent in _ribbonDockMenu.Items)
                {
                    var pane = (PaneId)parent.Tag!;
                    var effective = _layout.GetEffectiveDock(pane);
                    foreach (var child in parent.DropDownItems.OfType<ToolStripMenuItem>())
                    {
                        if (child.Tag is DockPosition dock)
                        {
                            child.Checked = dock == effective;
                        }
                        else if (child.Name == "swap")
                        {
                            child.Enabled = _layout.GetNeighbour(pane) is not null;
                        }
                    }
                }
            };

            _minimiseMenu = BuildPaneToggleMenu("Minimise panes",
                pane => _layout[pane].Visible && _layout[pane].Minimised,
                pane => _layout[pane].Visible && (_layout[pane].Minimised || _layout.CanMinimise(pane)),
                pane => ExecuteLayout(l => l.ToggleMinimise(pane)));
            _maximiseMenu = BuildPaneToggleMenu("Maximise panes",
                pane => _layout.Maximised == pane,
                pane => _layout[pane].Visible,
                pane => ExecuteLayout(l => l.ToggleMaximise(pane), pane));

            _layoutMenus.Add(_ribbonDockMenu);
            _layoutMenus.Add(_minimiseMenu);
            _layoutMenus.Add(_maximiseMenu);
        }

        private ContextMenuStrip BuildPaneToggleMenu(string name, Func<PaneId, bool> isChecked, Func<PaneId, bool> isEnabled, Action<PaneId> toggle)
        {
            var menu = new ContextMenuStrip { AccessibleName = name };
            foreach (var pane in PaneLayoutState.AllPanes)
            {
                var target = pane;
                var item = new ToolStripMenuItem(PaneCaption(pane)) { Tag = pane };
                item.Click += (_, _) => toggle(target);
                menu.Items.Add(item);
            }

            menu.Opening += (_, _) =>
            {
                foreach (ToolStripMenuItem item in menu.Items)
                {
                    var pane = (PaneId)item.Tag!;
                    item.Checked = isChecked(pane);
                    item.Enabled = isEnabled(pane);
                }
            };
            return menu;
        }

        private void ApplyPaneLayoutTheme()
        {
            _layoutHost.ApplyTheme(_palette);
            foreach (var menu in _layoutMenus)
            {
                ThemeApplier.ApplyToolStrip(menu, _palette);
            }
        }

        // ---------------------------------------------------------------- Applying the state

        /// <summary>Applies <see cref="_layout"/> to the controls and keeps the ribbon, switcher and settings in step.</summary>
        private void ApplyPaneLayout()
        {
            EnsureActivePane();
            foreach (var pane in PaneLayoutState.AllPanes)
            {
                var frame = FrameOf(pane);
                frame.IsMaximised = _layout.Maximised == pane;
                frame.CanMinimise = _layout.CanMinimise(pane);
                frame.CanClose = _layout.CanHide(pane);
                frame.IsActive = pane == _activePane;
            }

            _layoutHost.State = _layout;
            _layoutHost.ApplyLayout();
            _settings.SetPaneLayout(_layout);
            UpdateRibbonState();

            var previewShown = _layout.IsExpanded(PaneId.Preview);
            if (previewShown && !_previewWasShown && _active is not null)
            {
                ScheduleRender();
            }

            _previewWasShown = previewShown;
        }

        /// <summary>Runs a state operation and, when it changed something, applies it and puts focus on the active pane.</summary>
        private bool ExecuteLayout(Func<PaneLayoutState, bool> operation, PaneId? activate = null)
        {
            if (!operation(_layout))
            {
                return false;
            }

            if (activate is { } pane && _layout.IsExpanded(pane))
            {
                _activePane = pane;
            }

            ApplyPaneLayout();
            FocusPane(_activePane);
            return true;
        }

        private void EnsureActivePane()
        {
            if (_layout.IsExpanded(_activePane))
            {
                return;
            }

            var expanded = _layout.ExpandedPanes;
            _activePane = expanded.Contains(PaneId.Editor) ? PaneId.Editor : expanded.Count > 0 ? expanded[0] : PaneId.Editor;
        }

        private void SetActivePane(PaneId pane)
        {
            if (_activePane == pane || !_layout.IsExpanded(pane))
            {
                return;
            }

            _activePane = pane;
            foreach (var id in PaneLayoutState.AllPanes)
            {
                FrameOf(id).IsActive = id == pane;
            }
        }

        private void FocusPane(PaneId pane)
        {
            if (!_layout.IsExpanded(pane))
            {
                return;
            }

            switch (pane)
            {
                case PaneId.Outline:
                    _outlineTree.Focus();
                    break;
                case PaneId.Editor:
                    _active?.Editor.Focus();
                    break;
                default:
                    _preview.Focus();
                    break;
            }
        }

        // ---------------------------------------------------------------- Commands

        private void TogglePane(PaneId pane) => ExecuteLayout(l => l.ToggleVisible(pane), pane);

        private void ResetLayout() => ExecuteLayout(l =>
        {
            var changed = !l.Equals(new PaneLayoutState());
            l.Reset();
            return changed;
        });

        private void SetViewMode(string mode)
        {
            ExecuteLayout(l => l.ApplyViewMode(mode));
            if (mode != "editor" && _active is not null)
            {
                ScheduleRender();
            }
        }

        private void SetSplitOrientation(bool sideBySide) =>
            ExecuteLayout(l => l.SetEditorPreviewSideBySide(sideBySide));

        private bool TryHandleLayoutShortcut(Keys keyData)
        {
            switch (keyData)
            {
                case Keys.Control | Keys.Shift | Keys.M:
                    ExecuteLayout(l => l.ToggleMinimise(_activePane));
                    return true;
                case Keys.Control | Keys.Shift | Keys.Enter:
                    ExecuteLayout(l => l.ToggleMaximise(_activePane), _activePane);
                    return true;
                case Keys.Control | Keys.Alt | Keys.D1:
                case Keys.Control | Keys.Alt | Keys.NumPad1:
                    TogglePane(PaneId.Outline);
                    return true;
                case Keys.Control | Keys.Alt | Keys.D2:
                case Keys.Control | Keys.Alt | Keys.NumPad2:
                    TogglePane(PaneId.Editor);
                    return true;
                case Keys.Control | Keys.Alt | Keys.D3:
                case Keys.Control | Keys.Alt | Keys.NumPad3:
                    TogglePane(PaneId.Preview);
                    return true;
                case Keys.Control | Keys.Alt | Keys.D0:
                case Keys.Control | Keys.Alt | Keys.NumPad0:
                    ResetLayout();
                    return true;
                default:
                    return false;
            }
        }

        private IEnumerable<PaletteItem> BuildLayoutPaletteItems()
        {
            yield return new PaletteItem("Toggle Document Outline", "Ctrl+Alt+1", () => TogglePane(PaneId.Outline));
            yield return new PaletteItem("Toggle Editor Pane", "Ctrl+Alt+2", () => TogglePane(PaneId.Editor));
            yield return new PaletteItem("Toggle Preview Pane", "Ctrl+Alt+3", () => TogglePane(PaneId.Preview));
            yield return new PaletteItem("Minimise / Restore Active Pane", "Ctrl+Shift+M", () => ExecuteLayout(l => l.ToggleMinimise(_activePane)));
            yield return new PaletteItem("Maximise / Restore Active Pane", "Ctrl+Shift+Enter", () => ExecuteLayout(l => l.ToggleMaximise(_activePane), _activePane));
            foreach (var dock in DockChoices)
            {
                var edge = dock;
                yield return new PaletteItem($"Dock Active Pane {dock}", string.Empty, () => ExecuteLayout(l => l.SetDock(_activePane, edge), _activePane));
            }

            yield return new PaletteItem("Swap Active Pane with Neighbour", string.Empty, () => ExecuteLayout(l => l.SwapWithNeighbour(_activePane), _activePane));
            yield return new PaletteItem("Swap Editor and Preview", string.Empty, () => ExecuteLayout(l => l.Swap(PaneId.Editor, PaneId.Preview)));
            yield return new PaletteItem("Reset Layout", "Ctrl+Alt+0", ResetLayout);
        }
    }
}
