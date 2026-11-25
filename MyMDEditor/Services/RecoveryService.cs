using System.Diagnostics;
using System.Text.Json;
using MyMDEditor.Infrastructure;

namespace MyMDEditor.Services
{
    public sealed record RecoverySnapshot(string? OriginalPath, string Text, DateTime SavedUtc, int ProcessId);

    /// <summary>
    /// Keeps a crash-recovery copy of unsaved work. Each running instance owns one snapshot file
    /// (named after its process id); snapshots left behind by dead processes can be offered for restore.
    /// </summary>
    public sealed class RecoveryService
    {
        private readonly string _directory;
        private readonly int _processId;

        public RecoveryService(string? directory = null, int? processId = null)
        {
            _directory = directory ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MyMDEditor", "recovery");
            _processId = processId ?? Environment.ProcessId;
        }

        private string SnapshotPathFor(string? documentKey) => Path.Combine(_directory,
            string.IsNullOrEmpty(documentKey) ? $"recovery-{_processId}.json" : $"recovery-{_processId}-{documentKey}.json");

        /// <summary>Writes the snapshot for one document; <paramref name="documentKey"/> distinguishes open tabs.</summary>
        public void Save(string? originalPath, string text, string? documentKey = null)
        {
            try
            {
                Directory.CreateDirectory(_directory);
                var snapshot = new RecoverySnapshot(originalPath, text, DateTime.UtcNow, _processId);
                var path = SnapshotPathFor(documentKey);
                var temp = path + ".tmp";
                File.WriteAllText(temp, JsonSerializer.Serialize(snapshot));
                File.Move(temp, path, overwrite: true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Warn("Could not write recovery snapshot.", ex);
            }
        }

        /// <summary>Removes the snapshot for one document, or every snapshot owned by this process when no key is given.</summary>
        public void Clear(string? documentKey = null)
        {
            try
            {
                if (documentKey is not null)
                {
                    var single = SnapshotPathFor(documentKey);
                    if (File.Exists(single))
                    {
                        File.Delete(single);
                    }

                    return;
                }

                if (!Directory.Exists(_directory))
                {
                    return;
                }

                foreach (var file in Directory.EnumerateFiles(_directory, $"recovery-{_processId}.json")
                             .Concat(Directory.EnumerateFiles(_directory, $"recovery-{_processId}-*.json")))
                {
                    File.Delete(file);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Warn("Could not remove recovery snapshot.", ex);
            }
        }

        /// <summary>Returns the newest snapshot that belongs to a process that is no longer running.</summary>
        public RecoverySnapshot? FindOrphan() => FindOrphans().FirstOrDefault();

        /// <summary>Returns (and removes) every snapshot left behind by dead processes, newest first.</summary>
        public IReadOnlyList<RecoverySnapshot> FindOrphans()
        {
            if (!Directory.Exists(_directory))
            {
                return Array.Empty<RecoverySnapshot>();
            }

            var found = new List<(RecoverySnapshot Snapshot, string Path)>();

            foreach (var file in Directory.EnumerateFiles(_directory, "recovery-*.json"))
            {
                try
                {
                    var snapshot = JsonSerializer.Deserialize<RecoverySnapshot>(File.ReadAllText(file));
                    if (snapshot is null || snapshot.ProcessId == _processId || IsRunning(snapshot.ProcessId))
                    {
                        continue;
                    }

                    found.Add((snapshot, file));
                }
                catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
                {
                    AppLogger.Warn($"Ignoring unreadable recovery file '{file}'.", ex);
                }
            }

            foreach (var (_, path) in found)
            {
                try { File.Delete(path); } catch (IOException) { }
            }

            return found.Select(f => f.Snapshot).OrderByDescending(s => s.SavedUtc).ToList();
        }

        private static bool IsRunning(int processId)
        {
            try
            {
                using var process = Process.GetProcessById(processId);
                return !process.HasExited;
            }
            catch (ArgumentException)
            {
                return false;
            }
        }
    }
}
