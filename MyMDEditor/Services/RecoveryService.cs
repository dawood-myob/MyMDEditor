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

        private string SnapshotPath => Path.Combine(_directory, $"recovery-{_processId}.json");

        public void Save(string? originalPath, string text)
        {
            try
            {
                Directory.CreateDirectory(_directory);
                var snapshot = new RecoverySnapshot(originalPath, text, DateTime.UtcNow, _processId);
                var temp = SnapshotPath + ".tmp";
                File.WriteAllText(temp, JsonSerializer.Serialize(snapshot));
                File.Move(temp, SnapshotPath, overwrite: true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Warn("Could not write recovery snapshot.", ex);
            }
        }

        public void Clear()
        {
            try
            {
                if (File.Exists(SnapshotPath))
                {
                    File.Delete(SnapshotPath);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Warn("Could not remove recovery snapshot.", ex);
            }
        }

        /// <summary>Returns the newest snapshot that belongs to a process that is no longer running.</summary>
        public RecoverySnapshot? FindOrphan()
        {
            if (!Directory.Exists(_directory))
            {
                return null;
            }

            RecoverySnapshot? newest = null;
            string? newestPath = null;

            foreach (var file in Directory.EnumerateFiles(_directory, "recovery-*.json"))
            {
                try
                {
                    var snapshot = JsonSerializer.Deserialize<RecoverySnapshot>(File.ReadAllText(file));
                    if (snapshot is null || snapshot.ProcessId == _processId || IsRunning(snapshot.ProcessId))
                    {
                        continue;
                    }

                    if (newest is null || snapshot.SavedUtc > newest.SavedUtc)
                    {
                        newest = snapshot;
                        newestPath = file;
                    }
                }
                catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
                {
                    AppLogger.Warn($"Ignoring unreadable recovery file '{file}'.", ex);
                }
            }

            if (newestPath is not null)
            {
                try { File.Delete(newestPath); } catch (IOException) { }
            }

            return newest;
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
