using MyMDEditor.Services;

namespace MyMDEditor.Tests
{
	[TestClass]
	public sealed class PaneLayoutStateTests
	{
		private static void AssertInvariants(PaneLayoutState state)
		{
			Assert.IsTrue(PaneLayoutState.AllPanes.Any(p => state[p].Visible && !state[p].Minimised), "at least one pane must be visible and expanded");
			Assert.HasCount(3, state.Order);
			Assert.HasCount(3, state.Order.Distinct());
			if (state.Maximised is { } maximised)
			{
				Assert.IsTrue(state[maximised].Visible);
				Assert.IsFalse(state[maximised].Minimised);
			}

			foreach (var pane in PaneLayoutState.AllPanes)
			{
				Assert.IsTrue(state[pane].SizeRatio is >= PaneLayoutState.MinRatio and <= PaneLayoutState.MaxRatio);
				if (!state[pane].Visible)
				{
					Assert.IsFalse(state[pane].Minimised);
				}
			}
		}

		[TestMethod]
		public void Default_ShowsAllPanesLeftToRight()
		{
			var state = new PaneLayoutState();

			CollectionAssert.AreEqual(new[] { PaneId.Outline, PaneId.Editor, PaneId.Preview }, state.Order.ToArray());
			Assert.IsNull(state.Maximised);
			Assert.IsTrue(PaneLayoutState.AllPanes.All(state.IsExpanded));
			Assert.AreEqual(DockPosition.Left, state.GetEffectiveDock(PaneId.Outline));
			Assert.AreEqual(DockPosition.Left, state.GetEffectiveDock(PaneId.Editor));
			Assert.AreEqual(DockPosition.Right, state.GetEffectiveDock(PaneId.Preview));
			Assert.IsTrue(state.EditorPreviewSideBySide);
			Assert.AreEqual("split", state.LegacyViewMode);
		}

		[TestMethod]
		public void Minimise_ShowsRailAndRestoreBringsPaneBack()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.Minimise(PaneId.Outline));

			Assert.IsTrue(state.IsRail(PaneId.Outline));
			Assert.IsFalse(state.IsExpanded(PaneId.Outline));
			Assert.IsTrue(state.IsShown(PaneId.Outline));
			CollectionAssert.AreEqual(new[] { PaneId.Editor, PaneId.Preview }, state.ExpandedPanes.ToArray());
			CollectionAssert.AreEqual(new[] { PaneId.Outline }, state.RailPanes.ToArray());

			Assert.IsTrue(state.Restore(PaneId.Outline));
			Assert.IsTrue(state.IsExpanded(PaneId.Outline));
			Assert.IsFalse(state.Restore(PaneId.Outline));
		}

		[TestMethod]
		public void Minimise_LastExpandedPaneIsRefused()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Outline);
			state.Minimise(PaneId.Editor);

			Assert.IsFalse(state.CanMinimise(PaneId.Preview));
			Assert.IsFalse(state.Minimise(PaneId.Preview));
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
			AssertInvariants(state);
		}

		[TestMethod]
		public void Minimise_IgnoresHiddenPane()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);

			Assert.IsFalse(state.Minimise(PaneId.Outline));
			Assert.IsFalse(state[PaneId.Outline].Minimised);
		}

		[TestMethod]
		public void ToggleMinimise_AlternatesBetweenRailAndExpanded()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.ToggleMinimise(PaneId.Preview));
			Assert.IsTrue(state.IsRail(PaneId.Preview));
			Assert.IsTrue(state.ToggleMinimise(PaneId.Preview));
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
		}

		[TestMethod]
		public void ToggleMaximise_HidesOthersButRemembersThem()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Outline);

			Assert.IsTrue(state.ToggleMaximise(PaneId.Editor));

			Assert.AreEqual(PaneId.Editor, state.Maximised);
			Assert.IsTrue(state.IsExpanded(PaneId.Editor));
			Assert.IsFalse(state.IsShown(PaneId.Preview));
			Assert.IsFalse(state.IsShown(PaneId.Outline));
			Assert.IsEmpty(state.RailPanes);
			Assert.IsTrue(state[PaneId.Preview].Visible);
			Assert.IsTrue(state[PaneId.Outline].Minimised);

			Assert.IsTrue(state.ToggleMaximise(PaneId.Editor));
			Assert.IsNull(state.Maximised);
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
			Assert.IsTrue(state.IsRail(PaneId.Outline));
		}

		[TestMethod]
		public void ToggleMaximise_OnlyOnePaneIsMaximised()
		{
			var state = new PaneLayoutState();
			state.ToggleMaximise(PaneId.Editor);

			state.ToggleMaximise(PaneId.Preview);

			Assert.AreEqual(PaneId.Preview, state.Maximised);
			Assert.IsFalse(state.IsShown(PaneId.Editor));
			AssertInvariants(state);
		}

		[TestMethod]
		public void ToggleMaximise_ExpandsMinimisedPane()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Outline);

			state.ToggleMaximise(PaneId.Outline);

			Assert.AreEqual(PaneId.Outline, state.Maximised);
			Assert.IsFalse(state[PaneId.Outline].Minimised);
		}

		[TestMethod]
		public void ToggleMaximise_HiddenPaneIsRefused()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Preview);

			Assert.IsFalse(state.ToggleMaximise(PaneId.Preview));
			Assert.IsNull(state.Maximised);
		}

		[TestMethod]
		public void Minimise_MaximisedPaneIsRefusedWhenOthersAreOnlyRemembered()
		{
			var state = new PaneLayoutState();
			state.ToggleMaximise(PaneId.Editor);

			Assert.IsTrue(state.Minimise(PaneId.Editor));

			Assert.IsNull(state.Maximised);
			Assert.IsTrue(state.IsRail(PaneId.Editor));
			AssertInvariants(state);
		}

		[TestMethod]
		public void Hide_RemovesPaneAndItsRail()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Outline);

			Assert.IsTrue(state.Hide(PaneId.Outline));

			Assert.IsFalse(state.IsShown(PaneId.Outline));
			Assert.IsFalse(state.IsRail(PaneId.Outline));
			Assert.IsFalse(state[PaneId.Outline].Minimised);
			Assert.IsFalse(state.Hide(PaneId.Outline));
		}

		[TestMethod]
		public void Hide_LastVisiblePaneIsRefused()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.Hide(PaneId.Preview);

			Assert.IsFalse(state.CanHide(PaneId.Editor));
			Assert.IsFalse(state.Hide(PaneId.Editor));
			Assert.IsTrue(state[PaneId.Editor].Visible);
		}

		[TestMethod]
		public void Hide_PaneIsRefusedWhenOnlyOtherPaneIsMinimised()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.Minimise(PaneId.Preview);

			Assert.IsFalse(state.Hide(PaneId.Editor));
			AssertInvariants(state);
		}

		[TestMethod]
		public void Hide_MaximisedPaneRestoresTheOthers()
		{
			var state = new PaneLayoutState();
			state.ToggleMaximise(PaneId.Editor);

			Assert.IsTrue(state.Hide(PaneId.Editor));

			Assert.IsNull(state.Maximised);
			Assert.IsFalse(state[PaneId.Editor].Visible);
			Assert.IsTrue(state.IsExpanded(PaneId.Outline));
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
			AssertInvariants(state);
		}

		[TestMethod]
		public void Show_RevealsHiddenAndMinimisedPanes()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.Minimise(PaneId.Preview);

			Assert.IsTrue(state.Show(PaneId.Outline));
			Assert.IsTrue(state.Show(PaneId.Preview));

			Assert.IsTrue(state.IsExpanded(PaneId.Outline));
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
			Assert.IsFalse(state.Show(PaneId.Preview));
		}

		[TestMethod]
		public void Show_WhileAnotherPaneIsMaximisedUnmaximises()
		{
			var state = new PaneLayoutState();
			state.ToggleMaximise(PaneId.Editor);

			Assert.IsTrue(state.Show(PaneId.Preview));

			Assert.IsNull(state.Maximised);
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
		}

		[TestMethod]
		public void ToggleVisible_HidesAndShows()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.ToggleVisible(PaneId.Outline));
			Assert.IsFalse(state[PaneId.Outline].Visible);
			Assert.IsTrue(state.ToggleVisible(PaneId.Outline));
			Assert.IsTrue(state[PaneId.Outline].Visible);
		}

		[TestMethod]
		public void ToggleVisible_OtherPaneWhileMaximisedUnmaximisesInsteadOfHiding()
		{
			var state = new PaneLayoutState();
			state.ToggleMaximise(PaneId.Editor);

			Assert.IsTrue(state.ToggleVisible(PaneId.Preview));

			Assert.IsNull(state.Maximised);
			Assert.IsTrue(state[PaneId.Preview].Visible);
		}

		[TestMethod]
		public void ToggleVisible_LastPaneStaysVisible()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.Hide(PaneId.Preview);

			Assert.IsFalse(state.ToggleVisible(PaneId.Editor));
			Assert.IsTrue(state[PaneId.Editor].Visible);
		}

		[TestMethod]
		public void SetDock_MovesPaneToOutermostPosition()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.SetDock(PaneId.Preview, DockPosition.Bottom));

			CollectionAssert.AreEqual(new[] { PaneId.Preview, PaneId.Outline, PaneId.Editor }, state.Order.ToArray());
			Assert.AreEqual(DockPosition.Bottom, state[PaneId.Preview].Dock);
			Assert.AreEqual(DockPosition.Bottom, state.GetEffectiveDock(PaneId.Preview));
			Assert.AreEqual(DockPosition.Right, state.GetEffectiveDock(PaneId.Editor));
			AssertInvariants(state);
		}

		[TestMethod]
		public void SetDock_SameDockOnOutermostPaneIsNoOp()
		{
			var state = new PaneLayoutState();

			Assert.IsFalse(state.SetDock(PaneId.Outline, DockPosition.Left));
			Assert.IsTrue(state.SetDock(PaneId.Outline, DockPosition.Right));
			Assert.IsFalse(state.SetDock(PaneId.Outline, DockPosition.Right));
		}

		[TestMethod]
		public void SetDock_OutlineRightPutsItOnTheOppositeSideOfTheRest()
		{
			var state = new PaneLayoutState();

			state.SetDock(PaneId.Outline, DockPosition.Right);

			Assert.AreEqual(DockPosition.Right, state.GetEffectiveDock(PaneId.Outline));
			Assert.AreEqual(DockPosition.Left, state.GetEffectiveDock(PaneId.Editor));
			Assert.AreEqual(DockPosition.Right, state.GetEffectiveDock(PaneId.Preview));
		}

		[TestMethod]
		public void SetDock_InvalidEdgeIsRejected()
		{
			var state = new PaneLayoutState();
			var before = state.Clone();

			Assert.IsFalse(state.SetDock(PaneId.Editor, (DockPosition)99));

			Assert.AreEqual(before, state);
		}

		[TestMethod]
		public void SetDock_AllPaneAndEdgeCombinationsKeepInvariants()
		{
			foreach (var pane in PaneLayoutState.AllPanes)
			{
				foreach (var dock in Enum.GetValues<DockPosition>())
				{
					var state = new PaneLayoutState();
					state.SetDock(pane, dock);
					AssertInvariants(state);
					Assert.AreEqual(pane, state.Order[0]);
					Assert.AreEqual(dock, state.GetEffectiveDock(pane));
				}
			}
		}

		[TestMethod]
		public void Swap_ExchangesPositionsAndEdges()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.Swap(PaneId.Editor, PaneId.Preview));

			CollectionAssert.AreEqual(new[] { PaneId.Outline, PaneId.Preview, PaneId.Editor }, state.Order.ToArray());
			Assert.AreEqual(DockPosition.Left, state.GetEffectiveDock(PaneId.Preview));
			Assert.AreEqual(DockPosition.Right, state.GetEffectiveDock(PaneId.Editor));
			AssertInvariants(state);
		}

		[TestMethod]
		public void Swap_TwiceRestoresTheOriginalArrangement()
		{
			var state = new PaneLayoutState();
			var original = state.Clone();

			state.Swap(PaneId.Outline, PaneId.Preview);
			state.Swap(PaneId.Outline, PaneId.Preview);

			Assert.AreEqual(original, state);
		}

		[TestMethod]
		public void Swap_SamePaneIsNoOp()
		{
			var state = new PaneLayoutState();

			Assert.IsFalse(state.Swap(PaneId.Editor, PaneId.Editor));
		}

		[TestMethod]
		public void SwapWithNeighbour_UsesNextVisiblePaneOrPreviousForTheLast()
		{
			var state = new PaneLayoutState();

			Assert.AreEqual(PaneId.Editor, state.GetNeighbour(PaneId.Outline));
			Assert.AreEqual(PaneId.Editor, state.GetNeighbour(PaneId.Preview));

			Assert.IsTrue(state.SwapWithNeighbour(PaneId.Outline));
			CollectionAssert.AreEqual(new[] { PaneId.Editor, PaneId.Outline, PaneId.Preview }, state.Order.ToArray());
		}

		[TestMethod]
		public void SwapWithNeighbour_SkipsHiddenPanes()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Editor);

			Assert.AreEqual(PaneId.Preview, state.GetNeighbour(PaneId.Outline));
			Assert.IsTrue(state.SwapWithNeighbour(PaneId.Outline));
			Assert.AreEqual(PaneId.Preview, state.Order[0]);
		}

		[TestMethod]
		public void SwapWithNeighbour_NeedsAtLeastTwoVisiblePanes()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.Hide(PaneId.Preview);

			Assert.IsNull(state.GetNeighbour(PaneId.Editor));
			Assert.IsFalse(state.SwapWithNeighbour(PaneId.Editor));
		}

		[TestMethod]
		public void RotateEditorPreview_TogglesBetweenSideBySideAndStacked()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.EditorPreviewSideBySide);
			state.RotateEditorPreview();
			Assert.IsFalse(state.EditorPreviewSideBySide);
			Assert.AreEqual(DockPosition.Top, state[PaneId.Editor].Dock);
			Assert.AreEqual(DockPosition.Bottom, state[PaneId.Preview].Dock);
			state.RotateEditorPreview();
			Assert.IsTrue(state.EditorPreviewSideBySide);
		}

		[TestMethod]
		public void SetEditorPreviewSideBySide_OnlyChangesWhenNeeded()
		{
			var state = new PaneLayoutState();

			Assert.IsFalse(state.SetEditorPreviewSideBySide(true));
			Assert.IsTrue(state.SetEditorPreviewSideBySide(false));
			Assert.IsFalse(state.SetEditorPreviewSideBySide(false));
			Assert.IsFalse(state.EditorPreviewSideBySide);
		}

		[TestMethod]
		public void ApplyViewMode_MapsLegacyModes()
		{
			var state = new PaneLayoutState();

			state.ApplyViewMode("editor");
			Assert.IsTrue(state[PaneId.Editor].Visible);
			Assert.IsFalse(state[PaneId.Preview].Visible);
			Assert.AreEqual("editor", state.LegacyViewMode);

			state.ApplyViewMode("preview");
			Assert.IsFalse(state[PaneId.Editor].Visible);
			Assert.IsTrue(state[PaneId.Preview].Visible);
			Assert.AreEqual("preview", state.LegacyViewMode);

			state.ApplyViewMode("split");
			Assert.IsTrue(state[PaneId.Editor].Visible && state[PaneId.Preview].Visible);
			Assert.AreEqual("split", state.LegacyViewMode);
			AssertInvariants(state);
		}

		[TestMethod]
		public void ApplyViewMode_ClearsMaximiseAndMinimise()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Preview);
			state.ToggleMaximise(PaneId.Outline);

			state.ApplyViewMode("split");

			Assert.IsNull(state.Maximised);
			Assert.IsTrue(state.IsExpanded(PaneId.Editor));
			Assert.IsTrue(state.IsExpanded(PaneId.Preview));
		}

		[TestMethod]
		public void SetSizeRatio_ClampsAndReportsChanges()
		{
			var state = new PaneLayoutState();

			Assert.IsTrue(state.SetSizeRatio(PaneId.Outline, 5));
			Assert.AreEqual(PaneLayoutState.MaxRatio, state[PaneId.Outline].SizeRatio, 1e-9);
			Assert.IsTrue(state.SetSizeRatio(PaneId.Outline, -1));
			Assert.AreEqual(PaneLayoutState.MinRatio, state[PaneId.Outline].SizeRatio, 1e-9);
			Assert.IsFalse(state.SetSizeRatio(PaneId.Outline, 0));
			Assert.IsFalse(state.SetSizeRatio(PaneId.Outline, double.NaN));
			Assert.AreEqual(PaneLayoutState.MinRatio, state[PaneId.Outline].SizeRatio, 1e-9);
		}

		[TestMethod]
		public void Reset_RestoresDefaults()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Preview, DockPosition.Top);
			state.Minimise(PaneId.Outline);
			state.SetSizeRatio(PaneId.Editor, 0.8);
			state.ToggleMaximise(PaneId.Editor);

			state.Reset();

			Assert.AreEqual(new PaneLayoutState(), state);
			Assert.IsNull(state.Maximised);
		}

		[TestMethod]
		public void Clone_IsIndependent()
		{
			var state = new PaneLayoutState();
			var copy = state.Clone();

			copy.Hide(PaneId.Outline);

			Assert.IsTrue(state[PaneId.Outline].Visible);
			Assert.AreNotEqual(state, copy);
		}

		[TestMethod]
		public void Equality_ComparesAllState()
		{
			var a = new PaneLayoutState();
			var b = new PaneLayoutState();
			Assert.AreEqual(a, b);
			Assert.AreEqual(a.GetHashCode(), b.GetHashCode());

			b.SetSizeRatio(PaneId.Outline, 0.35);
			Assert.AreNotEqual(a, b);
			Assert.IsFalse(a.Equals(null));
		}

		[TestMethod]
		public void RandomOperationSequences_AlwaysKeepInvariants()
		{
			var random = new Random(12345);
			var panes = PaneLayoutState.AllPanes;
			var docks = Enum.GetValues<DockPosition>();
			for (var run = 0; run < 200; run++)
			{
				var state = new PaneLayoutState();
				for (var step = 0; step < 40; step++)
				{
					var pane = panes[random.Next(3)];
					var other = panes[random.Next(3)];
					switch (random.Next(13))
					{
						case 0: state.Minimise(pane); break;
						case 1: state.Restore(pane); break;
						case 2: state.ToggleMaximise(pane); break;
						case 3: state.Hide(pane); break;
						case 4: state.Show(pane); break;
						case 5: state.ToggleVisible(pane); break;
						case 6: state.SetDock(pane, docks[random.Next(4)]); break;
						case 7: state.Swap(pane, other); break;
						case 8: state.SwapWithNeighbour(pane); break;
						case 9: state.RotateEditorPreview(); break;
						case 10: state.ApplyViewMode(new[] { "split", "editor", "preview" }[random.Next(3)]); break;
						case 11: state.SetSizeRatio(pane, random.NextDouble() * 2 - 0.5); break;
						default: state.ToggleMinimise(pane); break;
					}

					AssertInvariants(state);
					Assert.IsTrue(state.ExpandedPanes.Count >= 1, "something must be expanded");
				}
			}
		}

		// ---------------------------------------------------------------- Persistence

		[TestMethod]
		public void Snapshot_RoundTripsEveryField()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Preview, DockPosition.Bottom);
			state.Swap(PaneId.Outline, PaneId.Editor);
			state.Minimise(PaneId.Outline);
			state.SetSizeRatio(PaneId.Editor, 0.65);
			state.ToggleMaximise(PaneId.Preview);

			var restored = PaneLayoutState.FromSnapshot(state.ToSnapshot());

			Assert.AreEqual(state, restored);
		}

		[TestMethod]
		public void Snapshot_SurvivesJsonRoundTrip()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Outline, DockPosition.Right);
			state.Hide(PaneId.Preview);

			var json = System.Text.Json.JsonSerializer.Serialize(state.ToSnapshot());
			var restored = PaneLayoutState.FromSnapshot(System.Text.Json.JsonSerializer.Deserialize<PaneLayoutSnapshot>(json));

			Assert.AreEqual(state, restored);
		}

		[TestMethod]
		public void Snapshot_UsesReadableNames()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Editor, DockPosition.Top);

			var snapshot = state.ToSnapshot();

			Assert.AreEqual("Editor", snapshot.Order[0]);
			Assert.AreEqual("Top", snapshot.Panes.Single(p => p.Pane == "Editor").Dock);
		}

		[TestMethod]
		public void FromSnapshot_NullGivesDefault()
		{
			Assert.AreEqual(new PaneLayoutState(), PaneLayoutState.FromSnapshot(null));
		}

		[TestMethod]
		public void FromSnapshot_EmptySnapshotGivesDefault()
		{
			Assert.AreEqual(new PaneLayoutState(), PaneLayoutState.FromSnapshot(new PaneLayoutSnapshot()));
		}

		[TestMethod]
		public void FromSnapshot_IgnoresUnknownAndDuplicateEntries()
		{
			var snapshot = new PaneLayoutSnapshot
			{
				Panes =
				{
					new PaneSnapshot { Pane = "Sidebar", Visible = false },
					new PaneSnapshot { Pane = "outline", Visible = false, Dock = "bottom", SizeRatio = 0.3 },
					new PaneSnapshot { Pane = "Outline", Visible = true, Dock = "Right" },
					new PaneSnapshot { Pane = "Editor", Dock = "Diagonal", SizeRatio = 0.6 },
				},
				Order = { "Preview", "Bogus", "Preview", "Outline" },
			};

			var state = PaneLayoutState.FromSnapshot(snapshot);

			Assert.IsFalse(state[PaneId.Outline].Visible);
			Assert.AreEqual(DockPosition.Bottom, state[PaneId.Outline].Dock);
			Assert.AreEqual(0.3, state[PaneId.Outline].SizeRatio, 1e-9);
			Assert.AreEqual(DockPosition.Left, state[PaneId.Editor].Dock);
			Assert.AreEqual(0.6, state[PaneId.Editor].SizeRatio, 1e-9);
			CollectionAssert.AreEqual(new[] { PaneId.Preview, PaneId.Outline, PaneId.Editor }, state.Order.ToArray());
			AssertInvariants(state);
		}

		[TestMethod]
		public void FromSnapshot_ClampsInvalidRatios()
		{
			var snapshot = new PaneLayoutSnapshot
			{
				Panes =
				{
					new PaneSnapshot { Pane = "Outline", SizeRatio = 7 },
					new PaneSnapshot { Pane = "Editor", SizeRatio = -3 },
					new PaneSnapshot { Pane = "Preview", SizeRatio = double.NaN },
				},
			};

			var state = PaneLayoutState.FromSnapshot(snapshot);

			Assert.AreEqual(PaneLayoutState.MaxRatio, state[PaneId.Outline].SizeRatio, 1e-9);
			Assert.AreEqual(PaneLayoutState.MinRatio, state[PaneId.Editor].SizeRatio, 1e-9);
			Assert.IsTrue(state[PaneId.Preview].SizeRatio is >= PaneLayoutState.MinRatio and <= PaneLayoutState.MaxRatio);
		}

		[TestMethod]
		public void FromSnapshot_AllPanesHiddenFallsBackToVisibleEditor()
		{
			var snapshot = new PaneLayoutSnapshot
			{
				Panes =
				{
					new PaneSnapshot { Pane = "Outline", Visible = false },
					new PaneSnapshot { Pane = "Editor", Visible = false },
					new PaneSnapshot { Pane = "Preview", Visible = false },
				},
			};

			var state = PaneLayoutState.FromSnapshot(snapshot);

			Assert.IsTrue(state.IsExpanded(PaneId.Editor));
			AssertInvariants(state);
		}

		[TestMethod]
		public void FromSnapshot_AllPanesMinimisedKeepsOneExpanded()
		{
			var snapshot = new PaneLayoutSnapshot
			{
				Panes =
				{
					new PaneSnapshot { Pane = "Outline", Minimised = true },
					new PaneSnapshot { Pane = "Editor", Minimised = true },
					new PaneSnapshot { Pane = "Preview", Minimised = true },
				},
			};

			var state = PaneLayoutState.FromSnapshot(snapshot);

			AssertInvariants(state);
			Assert.IsTrue(state.ExpandedPanes.Count >= 1);
		}

		[TestMethod]
		public void FromSnapshot_MaximisedHiddenPaneIsDropped()
		{
			var snapshot = new PaneLayoutSnapshot
			{
				Panes = { new PaneSnapshot { Pane = "Preview", Visible = false } },
				Maximised = "Preview",
			};

			var state = PaneLayoutState.FromSnapshot(snapshot);

			Assert.IsNull(state.Maximised);
		}

		[TestMethod]
		public void FromSnapshot_MaximisedMinimisedPaneIsExpanded()
		{
			var snapshot = new PaneLayoutSnapshot
			{
				Panes = { new PaneSnapshot { Pane = "Editor", Minimised = true } },
				Maximised = "Editor",
			};

			var state = PaneLayoutState.FromSnapshot(snapshot);

			Assert.AreEqual(PaneId.Editor, state.Maximised);
			Assert.IsFalse(state[PaneId.Editor].Minimised);
		}

		[TestMethod]
		public void FromSnapshot_NullCollectionsAreTolerated()
		{
			var snapshot = new PaneLayoutSnapshot { Panes = null!, Order = null! };

			Assert.AreEqual(new PaneLayoutState(), PaneLayoutState.FromSnapshot(snapshot));
		}

		[TestMethod]
		public void FromLegacy_DefaultsMatchDefaultLayout()
		{
			Assert.AreEqual(new PaneLayoutState(), PaneLayoutState.FromLegacy(true, "split", true));
		}

		[TestMethod]
		public void FromLegacy_MapsOutlineViewModeAndOrientation()
		{
			var state = PaneLayoutState.FromLegacy(showOutline: false, viewMode: "editor", sideBySide: false);

			Assert.IsFalse(state[PaneId.Outline].Visible);
			Assert.IsFalse(state[PaneId.Preview].Visible);
			Assert.IsTrue(state[PaneId.Editor].Visible);
			Assert.IsFalse(state.EditorPreviewSideBySide);
			AssertInvariants(state);
		}

		[TestMethod]
		public void FromLegacy_UnknownViewModeShowsBothPanes()
		{
			var state = PaneLayoutState.FromLegacy(true, "nonsense", true);

			Assert.AreEqual("split", state.LegacyViewMode);
			AssertInvariants(state);
		}

		[TestMethod]
		public void FromLegacy_NullViewModeShowsBothPanes()
		{
			Assert.AreEqual("split", PaneLayoutState.FromLegacy(true, null, true).LegacyViewMode);
		}
	}
}
