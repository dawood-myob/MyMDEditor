using MyMDEditor.Services;

namespace MyMDEditor.Tests
{
	[TestClass]
	public sealed class PaneLayoutSettingsTests
	{
		private string _dir = null!;

		[TestInitialize]
		public void Setup()
		{
			_dir = Path.Combine(Path.GetTempPath(), "MyMDEditorTests", Guid.NewGuid().ToString("N"));
			Directory.CreateDirectory(_dir);
		}

		[TestCleanup]
		public void Cleanup()
		{
			try { Directory.Delete(_dir, recursive: true); } catch (IOException) { }
		}

		private AppSettings LoadJson(string json)
		{
			var path = Path.Combine(_dir, "settings.json");
			File.WriteAllText(path, json);
			return new SettingsService(path).Load();
		}

		[TestMethod]
		public void OldSettingsFileWithoutLayout_LoadsAndMigratesLegacyFields()
		{
			var settings = LoadJson("{ \"Theme\": \"light\", \"ShowOutline\": false, \"ViewMode\": \"preview\", \"VerticalSplit\": false }");

			var layout = settings.GetPaneLayout();

			Assert.AreEqual("light", settings.Theme);
			Assert.IsFalse(layout[PaneId.Outline].Visible);
			Assert.IsFalse(layout[PaneId.Editor].Visible);
			Assert.IsTrue(layout[PaneId.Preview].Visible);
			Assert.IsFalse(layout.EditorPreviewSideBySide);
			Assert.IsNotNull(settings.Layout);
		}

		[TestMethod]
		public void OldSettingsFileWithEmptyObject_GivesDefaultLayout()
		{
			var settings = LoadJson("{}");

			Assert.AreEqual(new PaneLayoutState(), settings.GetPaneLayout());
		}

		[TestMethod]
		public void MissingFile_GivesDefaultLayout()
		{
			var settings = new SettingsService(Path.Combine(_dir, "none.json")).Load();

			Assert.AreEqual(new PaneLayoutState(), settings.GetPaneLayout());
		}

		[TestMethod]
		public void CorruptFile_GivesDefaultLayout()
		{
			var settings = LoadJson("{ this is not json");

			Assert.AreEqual(new PaneLayoutState(), settings.GetPaneLayout());
		}

		[TestMethod]
		public void SavedLayout_RoundTripsThroughTheSettingsFile()
		{
			var path = Path.Combine(_dir, "settings.json");
			var service = new SettingsService(path);
			var state = new PaneLayoutState();
			state.SetDock(PaneId.Preview, DockPosition.Bottom);
			state.Minimise(PaneId.Outline);
			state.SetSizeRatio(PaneId.Preview, 0.33);
			var settings = new AppSettings();
			settings.SetPaneLayout(state);

			service.Save(settings);
			var loaded = service.Load();

			Assert.AreEqual(state, loaded.GetPaneLayout());
			StringAssert.Contains(File.ReadAllText(path), "\"Layout\"");
		}

		[TestMethod]
		public void SetPaneLayout_MirrorsLegacyFields()
		{
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			state.Hide(PaneId.Preview);
			state.SetEditorPreviewSideBySide(false);
			var settings = new AppSettings();

			settings.SetPaneLayout(state);

			Assert.IsFalse(settings.ShowOutline);
			Assert.AreEqual("editor", settings.ViewMode);
			Assert.IsFalse(settings.VerticalSplit);
		}

		[TestMethod]
		public void LayoutWinsOverLegacyFieldsWhenBothArePresent()
		{
			var settings = LoadJson(@"{
			  ""ShowOutline"": true, ""ViewMode"": ""split"",
			  ""Layout"": { ""Version"": 1,
				""Panes"": [ { ""Pane"": ""Outline"", ""Visible"": false, ""Dock"": ""Left"", ""SizeRatio"": 0.2 } ],
				""Order"": [ ""Outline"", ""Editor"", ""Preview"" ] } }");

			var layout = settings.GetPaneLayout();

			Assert.IsFalse(layout[PaneId.Outline].Visible);
			Assert.IsFalse(settings.ShowOutline);
		}

		[TestMethod]
		public void LayoutWithWrongTypes_IsIgnoredWithoutLosingOtherSettings()
		{
			var settings = LoadJson("{ \"Theme\": \"light\", \"ZoomPercent\": 150, \"ShowOutline\": false, \"Layout\": { \"Panes\": \"oops\", \"Version\": \"x\" } }");

			Assert.AreEqual("light", settings.Theme);
			Assert.AreEqual(150, settings.ZoomPercent);
			Assert.IsFalse(settings.GetPaneLayout()[PaneId.Outline].Visible);
		}

		[TestMethod]
		public void LayoutThatIsNotAnObject_IsIgnored()
		{
			foreach (var value in new[] { "42", "\"text\"", "[1,2]", "null", "true" })
			{
				var settings = LoadJson($"{{ \"Theme\": \"light\", \"Layout\": {value} }}");

				Assert.AreEqual("light", settings.Theme, value);
				Assert.AreEqual(new PaneLayoutState(), settings.GetPaneLayout(), value);
			}
		}

		[TestMethod]
		public void LayoutWithInvalidNames_FallsBackPerField()
		{
			var settings = LoadJson(@"{ ""Layout"": {
			  ""Panes"": [ { ""Pane"": ""Editor"", ""Dock"": ""Middle"", ""Visible"": true, ""SizeRatio"": 12 },
						   { ""Pane"": ""Ghost"", ""Visible"": false } ],
			  ""Order"": [ ""Nothing"" ], ""Maximised"": ""Ghost"" } }");

			var layout = settings.GetPaneLayout();

			Assert.AreEqual(DockPosition.Left, layout[PaneId.Editor].Dock);
			Assert.AreEqual(PaneLayoutState.MaxRatio, layout[PaneId.Editor].SizeRatio, 1e-9);
			Assert.IsNull(layout.Maximised);
			Assert.HasCount(3, layout.Order);
		}

		[TestMethod]
		public void LayoutWithAllPanesHidden_StillShowsSomething()
		{
			var settings = LoadJson(@"{ ""Layout"": { ""Panes"": [
			  { ""Pane"": ""Outline"", ""Visible"": false }, { ""Pane"": ""Editor"", ""Visible"": false }, { ""Pane"": ""Preview"", ""Visible"": false } ] } }");

			var layout = settings.GetPaneLayout();

			Assert.IsTrue(layout.ExpandedPanes.Count >= 1);
			Assert.IsTrue(settings.ShowOutline == layout[PaneId.Outline].Visible);
		}

		[TestMethod]
		public void LoadedLayout_IsSanitisedAndWrittenBackConsistently()
		{
			var settings = LoadJson(@"{ ""ViewMode"": ""bogus"", ""Layout"": { ""Panes"": [ { ""Pane"": ""Preview"", ""Visible"": false } ] } }");

			Assert.AreEqual("editor", settings.ViewMode);
			Assert.AreEqual(settings.GetPaneLayout(), PaneLayoutState.FromSnapshot(settings.Layout));
		}

		[TestMethod]
		public void SavedFile_KeepsLegacyFieldsForOlderVersions()
		{
			var path = Path.Combine(_dir, "settings.json");
			var service = new SettingsService(path);
			var settings = new AppSettings();
			var state = new PaneLayoutState();
			state.Hide(PaneId.Outline);
			settings.SetPaneLayout(state);

			service.Save(settings);
			var text = File.ReadAllText(path);

			StringAssert.Contains(text, "\"ShowOutline\": false");
			StringAssert.Contains(text, "\"ViewMode\": \"split\"");
		}
	}
}
