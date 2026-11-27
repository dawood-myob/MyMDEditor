using MyMDEditor.Services;
using MyMDEditor.UI;

namespace MyMDEditor.Tests
{
	[TestClass]
	public sealed class PaneLayoutEngineTests
	{
		private static readonly PaneLayoutMetrics Metrics = new(RailThickness: 28, RailLength: 124, SplitterThickness: 5, MinPaneSize: 120);
		private static readonly Size Area = new(1000, 600);

		private static void AssertNoOverlap(PaneLayoutPlan plan)
		{
			var rects = plan.Panes.Values.Concat(plan.Rails.Select(r => r.Bounds)).Concat(plan.Splitters.Select(s => s.Bounds)).ToList();
			for (var i = 0; i < rects.Count; i++)
			{
				for (var j = i + 1; j < rects.Count; j++)
				{
					Assert.IsFalse(rects[i].IntersectsWith(rects[j]) && !Rectangle.Intersect(rects[i], rects[j]).IsEmpty,
						$"{rects[i]} overlaps {rects[j]}");
				}
			}

			foreach (var rect in rects)
			{
				Assert.IsTrue(new Rectangle(Point.Empty, Area).Contains(rect) || rect.IsEmpty, $"{rect} is outside the area");
			}
		}

		[TestMethod]
		public void Metrics_ScaleWithDpi()
		{
			var metrics = PaneLayoutMetrics.ForDpi(192);

			Assert.AreEqual(56, metrics.RailThickness);
			Assert.AreEqual(10, metrics.SplitterThickness);
		}

		[TestMethod]
		public void Default_PlacesThreePanesSideBySideFillingTheArea()
		{
			var plan = PaneLayoutEngine.Compute(new PaneLayoutState(), Area, Metrics);

			Assert.HasCount(3, plan.Panes);
			Assert.HasCount(2, plan.Splitters);
			Assert.IsEmpty(plan.Rails);
			Assert.AreEqual(0, plan.Panes[PaneId.Outline].Left);
			Assert.AreEqual(Area.Height, plan.Panes[PaneId.Outline].Height);
			Assert.AreEqual(Area.Width, plan.Panes[PaneId.Preview].Right);
			Assert.IsLessThan(plan.Panes[PaneId.Editor].Left, plan.Panes[PaneId.Outline].Right);
			Assert.IsLessThan(plan.Panes[PaneId.Preview].Left, plan.Panes[PaneId.Editor].Right);
			Assert.AreEqual(200, plan.Panes[PaneId.Outline].Width);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void SinglePane_FillsTheWholeArea()
		{
			var state = new PaneLayoutState();
			state.ToggleMaximise(PaneId.Editor);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.HasCount(1, plan.Panes);
			Assert.AreEqual(new Rectangle(Point.Empty, Area), plan.Panes[PaneId.Editor]);
			Assert.IsEmpty(plan.Splitters);
			Assert.IsEmpty(plan.Rails);
		}

		[TestMethod]
		public void MinimisedPane_GetsRailAndFreesContent()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Outline);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.HasCount(1, plan.Rails);
			var rail = plan.Rails[0];
			Assert.AreEqual(PaneId.Outline, rail.Pane);
			Assert.AreEqual(DockPosition.Left, rail.Edge);
			Assert.AreEqual(28, rail.Bounds.Width);
			Assert.AreEqual(124, rail.Bounds.Height);
			Assert.AreEqual(28, plan.Content.Left);
			Assert.AreEqual(28, plan.Panes[PaneId.Editor].Left);
			Assert.IsFalse(plan.Panes.ContainsKey(PaneId.Outline));
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void MinimisedPane_OnTopEdgeGetsHorizontalRail()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Outline, DockPosition.Top);
			state.Minimise(PaneId.Outline);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			var rail = plan.Rails.Single();
			Assert.AreEqual(DockPosition.Top, rail.Edge);
			Assert.AreEqual(0, rail.Bounds.Top);
			Assert.AreEqual(28, rail.Bounds.Height);
			Assert.AreEqual(28, plan.Content.Top);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void MinimisedPane_OnRightAndBottomEdgesSitAtTheFarSide()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Outline, DockPosition.Right);
			state.Minimise(PaneId.Outline);
			var right = PaneLayoutEngine.Compute(state, Area, Metrics).Rails.Single();
			Assert.AreEqual(Area.Width, right.Bounds.Right);

			state = new PaneLayoutState();
			state.SetDock(PaneId.Outline, DockPosition.Bottom);
			state.Minimise(PaneId.Outline);
			var bottom = PaneLayoutEngine.Compute(state, Area, Metrics).Rails.Single();
			Assert.AreEqual(Area.Height, bottom.Bounds.Bottom);
		}

		[TestMethod]
		public void TwoRailsOnTheSameEdge_AreStackedWithoutOverlap()
		{
			var state = new PaneLayoutState();
			state.Minimise(PaneId.Outline);
			state.Minimise(PaneId.Editor);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.HasCount(2, plan.Rails);
			Assert.HasCount(1, plan.Panes);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void Splitter_SitsBetweenTheTwoPanes()
		{
			var plan = PaneLayoutEngine.Compute(new PaneLayoutState(), Area, Metrics);

			var splitter = plan.Splitters.Single(s => s.Pane == PaneId.Outline);

			Assert.AreEqual(plan.Panes[PaneId.Outline].Right, splitter.Bounds.Left);
			Assert.AreEqual(5, splitter.Bounds.Width);
			Assert.AreEqual(plan.Panes[PaneId.Editor].Left, splitter.Bounds.Right);
		}

		[TestMethod]
		public void StackedEditorPreview_SplitsVertically()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.SetEditorPreviewSideBySide(false);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.AreEqual(0, plan.Panes[PaneId.Editor].Top);
			Assert.AreEqual(Area.Height, plan.Panes[PaneId.Preview].Bottom);
			Assert.AreEqual(Area.Width, plan.Panes[PaneId.Editor].Width);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void DockedRight_PutsPaneAtTheRightEdge()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Outline, DockPosition.Right);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.AreEqual(Area.Width, plan.Panes[PaneId.Outline].Right);
			Assert.AreEqual(0, plan.Panes[PaneId.Editor].Left);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void DockedBottom_PutsPaneAtTheBottomEdge()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Preview, DockPosition.Bottom);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.AreEqual(Area.Height, plan.Panes[PaneId.Preview].Bottom);
			Assert.AreEqual(Area.Width, plan.Panes[PaneId.Preview].Width);
			Assert.AreEqual(0, plan.Panes[PaneId.Outline].Top);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void EveryDockCombination_ProducesNonOverlappingPanesInsideTheArea()
		{
			foreach (var first in PaneLayoutState.AllPanes)
			{
				foreach (var dock in Enum.GetValues<DockPosition>())
				{
					var state = new PaneLayoutState();
					state.SetDock(first, dock);
					var plan = PaneLayoutEngine.Compute(state, Area, Metrics);
					Assert.HasCount(3, plan.Panes);
					AssertNoOverlap(plan);
				}
			}
		}

		[TestMethod]
		public void SmallArea_RespectsMinimumPaneSizeAndNeverGoesNegative()
		{
			var plan = PaneLayoutEngine.Compute(new PaneLayoutState(), new Size(300, 200), Metrics);

			foreach (var rect in plan.Panes.Values)
			{
				Assert.IsGreaterThanOrEqualTo(0, rect.Width);
				Assert.IsGreaterThanOrEqualTo(0, rect.Height);
			}

			var roomy = PaneLayoutEngine.Compute(new PaneLayoutState(), new Size(500, 200), Metrics);
			Assert.IsGreaterThanOrEqualTo(120, roomy.Panes[PaneId.Outline].Width);
			Assert.IsGreaterThanOrEqualTo(120, roomy.Panes[PaneId.Editor].Width);
		}

		[TestMethod]
		public void ZeroArea_DoesNotThrow()
		{
			var plan = PaneLayoutEngine.Compute(new PaneLayoutState(), Size.Empty, Metrics);

			Assert.HasCount(3, plan.Panes);
			foreach (var rect in plan.Panes.Values)
			{
				Assert.IsTrue(rect.Width >= 0 && rect.Height >= 0);
			}
		}

		[TestMethod]
		public void LargeRatio_StillLeavesRoomForTheOtherPanes()
		{
			var state = new PaneLayoutState();
			state.SetSizeRatio(PaneId.Outline, 0.9);

			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);

			Assert.IsGreaterThanOrEqualTo(120, plan.Panes[PaneId.Editor].Width);
			Assert.IsGreaterThanOrEqualTo(120, plan.Panes[PaneId.Preview].Width);
			AssertNoOverlap(plan);
		}

		[TestMethod]
		public void RatioFromSplitterEdge_RoundTripsThePlannedSplitter()
		{
			var state = new PaneLayoutState();
			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);
			var splitter = plan.Splitters.Single(s => s.Pane == PaneId.Outline);

			var ratio = PaneLayoutEngine.RatioFromSplitterEdge(splitter, splitter.Bounds.Left, Metrics);

			Assert.AreEqual(state[PaneId.Outline].SizeRatio, ratio, 0.01);
		}

		[TestMethod]
		public void RatioFromSplitterEdge_RightDockedRoundTrips()
		{
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Outline, DockPosition.Right);
			var plan = PaneLayoutEngine.Compute(state, Area, Metrics);
			var splitter = plan.Splitters.Single(s => s.Pane == PaneId.Outline);

			var ratio = PaneLayoutEngine.RatioFromSplitterEdge(splitter, splitter.Bounds.Left, Metrics);

			Assert.AreEqual(state[PaneId.Outline].SizeRatio, ratio, 0.01);
		}

		[TestMethod]
		public void RatioFromSplitterEdge_BottomAndTopDockRoundTrip()
		{
			foreach (var dock in new[] { DockPosition.Top, DockPosition.Bottom })
			{
				var state = new PaneLayoutState();
				state.SetDock(PaneId.Preview, dock);
				var plan = PaneLayoutEngine.Compute(state, Area, Metrics);
				var splitter = plan.Splitters.Single(s => s.Pane == PaneId.Preview);

				var ratio = PaneLayoutEngine.RatioFromSplitterEdge(splitter, splitter.Bounds.Top, Metrics);

				Assert.AreEqual(state[PaneId.Preview].SizeRatio, ratio, 0.01, dock.ToString());
			}
		}

		[TestMethod]
		public void RatioFromSplitterEdge_ClampsDragsOutsideTheArea()
		{
			var plan = PaneLayoutEngine.Compute(new PaneLayoutState(), Area, Metrics);
			var splitter = plan.Splitters.Single(s => s.Pane == PaneId.Outline);

			Assert.AreEqual(PaneLayoutState.MinRatio, PaneLayoutEngine.RatioFromSplitterEdge(splitter, -500, Metrics), 1e-9);
			Assert.AreEqual(PaneLayoutState.MaxRatio, PaneLayoutEngine.RatioFromSplitterEdge(splitter, 5000, Metrics), 1e-9);
		}
	}
}
