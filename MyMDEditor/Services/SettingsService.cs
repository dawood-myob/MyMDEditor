using System.Text.Json;
using System.Text.Json.Serialization;
using MyMDEditor.Infrastructure;

namespace MyMDEditor.Services
{
    public sealed class WindowPlacement
    {
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public bool Maximized { get; set; }
    }

    /// <summary>User preferences and session information persisted between runs.</summary>
    public sealed class AppSettings
    {
        public const int MaxRecentFiles = 10;

        /// <summary>"dark", "light" or "system".</summary>
        public string Theme { get; set; } = "dark";
        public bool WordWrap { get; set; } = true;
        public bool ShowOutline { get; set; } = true;
        public int OutlineWidth { get; set; } = 220;

        /// <summary>"split", "editor" or "preview".</summary>
        public string ViewMode { get; set; } = "split";
        public bool VerticalSplit { get; set; } = true;
        public bool SyncEnabled { get; set; } = true;
        public int ZoomPercent { get; set; } = 100;

        public bool AutoSaveEnabled { get; set; }
        public int AutoSaveSeconds { get; set; } = 30;

        public bool RestoreSession { get; set; } = true;
        public string? LastFile { get; set; }
        public int LastCaret { get; set; }
        public WindowPlacement? Window { get; set; }
        public List<string> RecentFiles { get; set; } = new();

        /// <summary>Moves <paramref name="path"/> to the top of the recent list (case-insensitive de-duplication).</summary>
        public void AddRecent(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return;
            }

            RecentFiles.RemoveAll(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase));
            RecentFiles.Insert(0, path);
            if (RecentFiles.Count > MaxRecentFiles)
            {
                RecentFiles.RemoveRange(MaxRecentFiles, RecentFiles.Count - MaxRecentFiles);
            }
        }

        public void RemoveRecent(string path) =>
            RecentFiles.RemoveAll(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase));

        /// <summary>Clamps values loaded from a hand-edited or older settings file into safe ranges.</summary>
        public void Sanitise()
        {
            Theme = Theme is "dark" or "light" or "system" ? Theme : "dark";
            ViewMode = ViewMode is "split" or "editor" or "preview" ? ViewMode : "split";
            ZoomPercent = Math.Clamp(ZoomPercent, 50, 300);
            AutoSaveSeconds = Math.Clamp(AutoSaveSeconds, 5, 3600);
            OutlineWidth = Math.Clamp(OutlineWidth, 120, 600);
            RecentFiles ??= new List<string>();
            RecentFiles = RecentFiles.Where(p => !string.IsNullOrWhiteSpace(p)).Take(MaxRecentFiles).ToList();
            LastCaret = Math.Max(0, LastCaret);
        }
    }

    public interface ISettingsService
    {
        AppSettings Load();

        void Save(AppSettings settings);
    }

    /// <summary>JSON-file backed settings store. Corrupt or missing files yield defaults.</summary>
    public sealed class SettingsService : ISettingsService
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        private readonly string _path;

        public SettingsService(string? path = null)
        {
            _path = path ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MyMDEditor", "settings.json");
        }

        public AppSettings Load()
        {
            try
            {
                if (File.Exists(_path))
                {
                    var settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_path), JsonOptions) ?? new AppSettings();
                    settings.Sanitise();
                    return settings;
                }
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                AppLogger.Warn($"Could not read settings from '{_path}'; using defaults.", ex);
            }

            return new AppSettings();
        }

        public void Save(AppSettings settings)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                var temp = _path + ".tmp";
                File.WriteAllText(temp, JsonSerializer.Serialize(settings, JsonOptions));
                File.Move(temp, _path, overwrite: true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLogger.Warn($"Could not save settings to '{_path}'.", ex);
            }
        }
    }
}
