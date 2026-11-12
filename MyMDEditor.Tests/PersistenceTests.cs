using System.Text;
using MyMDEditor.Services;

namespace MyMDEditor.Tests
{
    [TestClass]
    public sealed class FileManagementServiceTests
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

        [TestMethod]
        public async Task OpenSave_CrLfFile_RoundTripsLineEndings()
        {
            var path = Path.Combine(_dir, "crlf.md");
            await File.WriteAllTextAsync(path, "a\r\nb\r\n", new UTF8Encoding(false));
            var service = new FileManagementService();

            var text = await service.OpenFileAsync(path);
            Assert.AreEqual("a\nb\n", text);
            Assert.AreEqual("CRLF", service.CurrentFormat.LineEndingName);

            await service.SaveFileAsync(path, text + "c");
            Assert.AreEqual("a\r\nb\r\nc", await File.ReadAllTextAsync(path));
        }

        [TestMethod]
        public async Task OpenSave_Utf8Bom_IsPreserved()
        {
            var path = Path.Combine(_dir, "bom.md");
            await File.WriteAllTextAsync(path, "héllo", new UTF8Encoding(true));
            var service = new FileManagementService();

            Assert.AreEqual("héllo", await service.OpenFileAsync(path));
            Assert.AreEqual("UTF-8 with BOM", service.CurrentFormat.EncodingName);

            await service.SaveFileAsync(path, "x");
            var bytes = await File.ReadAllBytesAsync(path);
            CollectionAssert.AreEqual(new byte[] { 0xEF, 0xBB, 0xBF, (byte)'x' }, bytes);
        }

        [TestMethod]
        public async Task Save_NewFile_UsesUtf8NoBomAndLf()
        {
            var path = Path.Combine(_dir, "new.md");
            var service = new FileManagementService();

            await service.SaveFileAsync(path, "a\r\nb");

            CollectionAssert.AreEqual(Encoding.UTF8.GetBytes("a\nb"), await File.ReadAllBytesAsync(path));
            Assert.AreEqual(path, service.CurrentFilePath);
        }

        [TestMethod]
        public async Task Save_OverwritesExistingFile_AndLeavesNoTempFiles()
        {
            var path = Path.Combine(_dir, "over.md");
            await File.WriteAllTextAsync(path, "old content that is longer");
            var service = new FileManagementService();
            await service.OpenFileAsync(path);

            await service.SaveFileAsync(path, "new");

            Assert.AreEqual("new", await File.ReadAllTextAsync(path));
            Assert.HasCount(1, Directory.GetFiles(_dir));
        }

        [TestMethod]
        public async Task Open_InvalidUtf8_FallsBackWithoutReplacementChars()
        {
            var path = Path.Combine(_dir, "latin1.md");
            await File.WriteAllBytesAsync(path, new byte[] { (byte)'c', 0xE9 });
            var service = new FileManagementService();

            var text = await service.OpenFileAsync(path);

            Assert.AreEqual("cé", text);
        }

        [TestMethod]
        public async Task Open_Utf16_IsDecoded()
        {
            var path = Path.Combine(_dir, "utf16.md");
            await File.WriteAllTextAsync(path, "wide", Encoding.Unicode);
            var service = new FileManagementService();

            Assert.AreEqual("wide", await service.OpenFileAsync(path));
            Assert.AreEqual("UTF-16", service.CurrentFormat.EncodingName);
        }

        [TestMethod]
        public async Task InvalidPath_Throws()
        {
            var service = new FileManagementService();

            await Assert.ThrowsAsync<ArgumentException>(() => service.OpenFileAsync(" "));
            await Assert.ThrowsAsync<ArgumentException>(() => service.SaveFileAsync(string.Empty, "x"));
        }

        [TestMethod]
        public async Task Reset_ClearsPathAndFormat()
        {
            var path = Path.Combine(_dir, "r.md");
            await File.WriteAllTextAsync(path, "a\r\n");
            var service = new FileManagementService();
            await service.OpenFileAsync(path);

            service.Reset();

            Assert.IsNull(service.CurrentFilePath);
            Assert.AreEqual("LF", service.CurrentFormat.LineEndingName);
        }

        [TestMethod]
        public void NormalizeAndDetectLineEndings()
        {
            Assert.AreEqual("a\nb\nc", FileManagementService.NormalizeLineEndings("a\r\nb\rc"));
            Assert.AreEqual("\n", FileManagementService.DetectLineEnding("a\nb\r\nc\n"));
            Assert.AreEqual("\r\n", FileManagementService.DetectLineEnding("a\r\nb\r\n"));
        }
    }

    [TestClass]
    public sealed class SettingsAndRecoveryTests
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

        [TestMethod]
        public void Settings_RoundTrip()
        {
            var service = new SettingsService(Path.Combine(_dir, "s.json"));
            var settings = new AppSettings { Theme = "light", AutoSaveEnabled = true, ZoomPercent = 125 };
            settings.AddRecent(@"C:\a.md");

            service.Save(settings);
            var loaded = service.Load();

            Assert.AreEqual("light", loaded.Theme);
            Assert.IsTrue(loaded.AutoSaveEnabled);
            Assert.AreEqual(125, loaded.ZoomPercent);
            CollectionAssert.AreEqual(new[] { @"C:\a.md" }, loaded.RecentFiles);
        }

        [TestMethod]
        public void Settings_CorruptFile_ReturnsDefaults()
        {
            var path = Path.Combine(_dir, "s.json");
            File.WriteAllText(path, "{ not json");

            var loaded = new SettingsService(path).Load();

            Assert.AreEqual("dark", loaded.Theme);
        }

        [TestMethod]
        public void Settings_Sanitise_ClampsOutOfRangeValues()
        {
            var settings = new AppSettings { Theme = "neon", ViewMode = "x", ZoomPercent = 5000, AutoSaveSeconds = 0, RecentFiles = null! };

            settings.Sanitise();

            Assert.AreEqual("dark", settings.Theme);
            Assert.AreEqual("split", settings.ViewMode);
            Assert.AreEqual(300, settings.ZoomPercent);
            Assert.AreEqual(5, settings.AutoSaveSeconds);
            Assert.IsNotNull(settings.RecentFiles);
        }

        [TestMethod]
        public void AddRecent_DeduplicatesCaseInsensitivelyAndCaps()
        {
            var settings = new AppSettings();
            for (var i = 0; i < 15; i++)
            {
                settings.AddRecent($@"C:\f{i}.md");
            }

            settings.AddRecent(@"c:\F3.MD");

            Assert.HasCount(AppSettings.MaxRecentFiles, settings.RecentFiles);
            Assert.AreEqual(@"c:\F3.MD", settings.RecentFiles[0]);
            Assert.AreEqual(1, settings.RecentFiles.Count(p => p.Equals(@"C:\f3.md", StringComparison.OrdinalIgnoreCase)));
        }

        [TestMethod]
        public void Recovery_OrphanFromDeadProcess_IsFoundOnce()
        {
            // int.MaxValue is never a valid live process id.
            new RecoveryService(_dir, processId: int.MaxValue).Save(@"C:\doc.md", "unsaved work");
            var current = new RecoveryService(_dir, processId: Environment.ProcessId);

            var orphan = current.FindOrphan();

            Assert.IsNotNull(orphan);
            Assert.AreEqual("unsaved work", orphan.Text);
            Assert.AreEqual(@"C:\doc.md", orphan.OriginalPath);
            Assert.IsNull(current.FindOrphan(), "An orphan should only be offered once.");
        }

        [TestMethod]
        public void Recovery_OwnSnapshot_IsNotOfferedAndClearRemovesIt()
        {
            var service = new RecoveryService(_dir, processId: Environment.ProcessId);
            service.Save(null, "mine");

            Assert.IsNull(service.FindOrphan());
            service.Clear();
            Assert.IsEmpty(Directory.GetFiles(_dir));
        }
    }
}
